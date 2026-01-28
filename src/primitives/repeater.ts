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
import { get, updateReaction, removeReactions } from '../reactivity/tracking.js'
import type { SharedSlotBuffer } from '../shared/shared-slot-buffer.js'

/** Global registry symbol — same key as signal.ts uses */
const SOURCE_SYMBOL = Symbol.for('signal.source')

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

  // Signal wrapper — extract internal Source via shared Symbol
  const src = (input as unknown as Record<symbol, unknown>)[SOURCE_SYMBOL] as Source<number> | undefined
  if (src && typeof src.f === 'number' && 'reactions' in src) {
    return { source: src, readFn: () => get(src) }
  }

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
 *
 * Uses updateReaction() to discover deps during initial evaluation,
 * then wires the repeater into all discovered sources' reactions.
 * On subsequent changes, forwardRepeater() re-evaluates the getter inline.
 */
function repeatGetter(
  getter: () => number,
  target: SharedSlotBuffer,
  index: number,
): () => void {
  const node: RepeaterNode = {
    f: REPEATER | CLEAN,
    wv: 0,
    fn: getter,
    deps: null,
    _readFn: getter,
    _target: target,
    _index: index,
  }

  // Run getter with dependency tracking — discovers which sources it reads
  // and registers the repeater in their reactions arrays
  const initialValue = updateReaction(node) as number
  target.set(index, initialValue)

  return () => {
    node.f |= DESTROYED
    removeReactions(node, 0)
    node.deps = null
  }
}

/**
 * Create a repeater from a signal wrapper (WritableSignal/ReadableSignal).
 * Extracts the internal Source via SOURCE_SYMBOL, falls back to getter tracking.
 */
function repeatSignalWrapper(
  sig: ReadableSignal<number>,
  target: SharedSlotBuffer,
  index: number,
): () => void {
  // Extract internal source via shared Symbol
  const src = (sig as unknown as Record<symbol, unknown>)[SOURCE_SYMBOL] as Source<number> | undefined
  if (src && typeof src.f === 'number' && 'reactions' in src) {
    return repeatSource(src, () => get(src), target, index)
  }

  // Non-standard signal — fall back to getter with dep tracking
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
