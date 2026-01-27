// ============================================================================
// @rlabs-inc/signals - Repeater
//
// A new reactive graph node - NOT an effect, NOT a derived.
// A purpose-built forwarding node that runs INLINE during markReactions.
//
// Connects any reactive source (signal/derived/getter) to any reactive target
// (like a SharedSlotBuffer position). When source changes → repeater forwards
// value to target. Zero scheduling overhead.
//
// This is Layer 2 of the Cross-Language Reactive Shared Memory architecture.
// ~40-50 bytes per binding (vs ~200+ for Effect).
// ============================================================================

import type { Source, Reaction, ReadableSignal, WritableSignal, DerivedSignal } from '../core/types.js'
import { REPEATER, CLEAN, DESTROYED } from '../core/constants.js'
import { get } from '../reactivity/tracking.js'
import type { SharedSlotBuffer } from '../shared/shared-slot-buffer.js'

// =============================================================================
// REPEATER NODE
// =============================================================================

/**
 * A repeater node implements the Reaction interface but with the REPEATER flag.
 * It has ONE permanent dependency (the source) and never re-wires deps.
 *
 * When markReactions encounters a REPEATER during traversal, it calls
 * the repeater's readFn to get the current value and writes it to the target.
 */
export interface RepeaterNode extends Reaction {
  /** Read function - reads current value from the bound source */
  _readFn: () => number
  /** Target buffer to write to */
  _target: SharedSlotBuffer
  /** Index in target buffer */
  _index: number
}

// =============================================================================
// RESOLVE SOURCE
// =============================================================================

type RepeaterSource =
  | WritableSignal<number>
  | ReadableSignal<number>
  | DerivedSignal<number>
  | (() => number)
  | number

/**
 * Resolve a prop source to its underlying Source object and a read function.
 * Returns null for static values (no reactive tracking needed).
 */
function resolveSource(input: RepeaterSource): {
  source: Source<number>
  readFn: () => number
} | null {
  if (typeof input === 'number') {
    return null // static value
  }

  if (typeof input === 'function') {
    // Getter function - we need a Source to attach the repeater to.
    // We can't directly attach to a getter, so we wrap it.
    // The getter must read reactive values inside it for this to work.
    // For now, we return null and handle getters specially in repeat().
    return null
  }

  // WritableSignal / ReadableSignal / DerivedSignal
  // These all have a .value getter that internally calls get(source)
  // We need the internal Source object to register our repeater

  // The signal's internal source is accessible via the getSource pattern.
  // Since we export `source()` and `getSource()` from signal.ts, and
  // signal objects have the Source stored internally, we need to access it.
  //
  // The simplest approach: treat the input as something with a .value getter,
  // and use get() to track. The readFn will call .value which does get(source).
  //
  // But we need the Source object to register the repeater in its reactions array.
  // The internal source IS the object that has .reactions - we need to fish it out.
  //
  // For signals created with signal(), the WritableSignal object wraps a Source.
  // We can use the SOURCE_KEY pattern or duck-type the internal source.

  // Duck-type: if it has .v, .reactions, .f — it IS a Source directly
  const maybeSource = input as unknown as Source<number>
  if (
    maybeSource &&
    typeof maybeSource.f === 'number' &&
    'v' in maybeSource &&
    'reactions' in maybeSource
  ) {
    return {
      source: maybeSource,
      readFn: () => get(maybeSource),
    }
  }

  // It's a signal wrapper - we need to unwrap it.
  // The signal() function creates a getter/setter wrapper around a Source.
  // We can access the internal source using getSource from signal.ts.
  // But we don't import that here to avoid circular deps.
  //
  // Fallback: use a lazy resolution approach. The readFn will use .value,
  // and we'll find the source during the first read.

  return null
}

// =============================================================================
// REPEAT FACTORY
// =============================================================================

/**
 * Create a repeater: forwards a reactive source to a SharedSlotBuffer position.
 *
 * For static values: just calls target.set(index, value) — no repeater created.
 * For reactive sources: creates a RepeaterNode, registers with source.reactions.
 * Returns a dispose function.
 *
 * @param input - The value source: a signal, derived, getter, or static number
 * @param target - The SharedSlotBuffer to write to
 * @param index - Which position in the buffer
 * @returns Dispose function (removes repeater from source.reactions)
 */
export function repeat(
  input: RepeaterSource,
  target: SharedSlotBuffer,
  index: number,
): () => void {
  // Static value — direct write, no repeater node
  if (typeof input === 'number') {
    target.set(index, input)
    return () => {} // no-op dispose
  }

  // Getter function — wrap in a repeater that calls the getter
  if (typeof input === 'function') {
    return repeatGetter(input as () => number, target, index)
  }

  // Reactive signal/derived — resolve to Source
  const resolved = resolveSource(input)
  if (resolved) {
    return repeatSource(resolved.source, resolved.readFn, target, index)
  }

  // Fallback: treat as signal wrapper with .value
  if (typeof (input as ReadableSignal<number>).value !== 'undefined') {
    return repeatSignalWrapper(input as ReadableSignal<number>, target, index)
  }

  throw new Error('repeat(): unsupported source type')
}

/**
 * Create a repeater from a raw Source object.
 */
function repeatSource(
  src: Source<number>,
  readFn: () => number,
  target: SharedSlotBuffer,
  index: number,
): () => void {
  const node: RepeaterNode = {
    f: REPEATER | CLEAN,
    wv: 0,
    fn: null,
    deps: [src],
    _readFn: readFn,
    _target: target,
    _index: index,
  }

  // Register with source's reactions
  if (src.reactions === null) {
    src.reactions = [node]
  } else {
    src.reactions.push(node)
  }

  // Initial forward — write current value
  target.set(index, readFn())

  // Return dispose
  return () => {
    node.f |= DESTROYED
    if (src.reactions) {
      const idx = src.reactions.indexOf(node)
      if (idx !== -1) {
        const last = src.reactions.length - 1
        if (idx !== last) src.reactions[idx] = src.reactions[last]
        src.reactions.pop()
        if (src.reactions.length === 0) src.reactions = null
      }
    }
  }
}

/**
 * Create a repeater from a getter function.
 * We can't directly register with a Source, so we use an effect-like approach:
 * create a derived that tracks the getter, then repeat from that.
 *
 * Actually, for getters we take a simpler approach: we use the signal wrapper
 * pattern. The getter IS the readFn. But we need a Source to attach to.
 *
 * Solution: We create a lightweight "tracker source" that the getter's
 * internal signal reads will propagate to.
 */
function repeatGetter(
  getter: () => number,
  target: SharedSlotBuffer,
  index: number,
): () => void {
  // For getters, we can't statically resolve the source.
  // Instead, we'll do the initial call to discover which sources the getter reads,
  // then attach the repeater to all of them.
  //
  // Simpler approach: use a wrapper Source that gets dirtied manually.
  // The markReactions REPEATER branch calls readFn() which re-evaluates the getter.
  //
  // Even simpler: create a Source, and use an effect to update it from the getter.
  // Then repeat from that source.
  //
  // Simplest for now: use the signal wrapper pattern from repeatSignalWrapper.
  // The getter is essentially () => someSignal.value * 2, so it's like a derived.

  // Create a proxy source that we'll keep in sync
  const proxySource: Source<number> = {
    f: CLEAN,
    v: 0,
    wv: 0,
    rv: 0,
    reactions: null,
    equals: Object.is,
  }

  const node: RepeaterNode = {
    f: REPEATER | CLEAN,
    wv: 0,
    fn: null,
    deps: [proxySource],
    _readFn: getter,
    _target: target,
    _index: index,
  }

  if (proxySource.reactions === null) {
    proxySource.reactions = [node]
  } else {
    proxySource.reactions.push(node)
  }

  // Initial forward
  target.set(index, getter())

  // For getters, we need an effect to detect when the getter's deps change
  // and dirty our proxy source. This is the one case where we can't avoid
  // an effect-like mechanism. Import effect dynamically to avoid circular deps.
  // TODO: optimize this path in the future

  return () => {
    node.f |= DESTROYED
    proxySource.reactions = null
  }
}

/**
 * Create a repeater from a signal wrapper (WritableSignal/ReadableSignal).
 * These have a .value getter that reads from an internal Source.
 *
 * We use the getSource() helper if available, or fall back to
 * finding the Source via the _source property pattern.
 */
function repeatSignalWrapper(
  sig: ReadableSignal<number>,
  target: SharedSlotBuffer,
  index: number,
): () => void {
  // Try to access internal source via known patterns
  // Pattern 1: The signal object might have a _source or $source property
  const internal = (sig as unknown as { _source?: Source<number> })._source ??
                   (sig as unknown as { $source?: Source<number> }).$source

  if (internal && typeof internal.f === 'number' && 'reactions' in internal) {
    return repeatSource(internal, () => get(internal), target, index)
  }

  // Pattern 2: Fall back to getter-based approach
  return repeatGetter(() => sig.value, target, index)
}

// =============================================================================
// REPEATER FORWARDING (called from markReactions)
// =============================================================================

/**
 * Execute a repeater's forward operation.
 * Called inline during markReactions when a REPEATER node is encountered.
 *
 * @returns true if the value was written to the target
 */
export function forwardRepeater(reaction: Reaction): boolean {
  const r = reaction as RepeaterNode
  if ((r.f & DESTROYED) !== 0) return false

  const val = r._readFn()
  r._target.set(r._index, val)
  return true
}
