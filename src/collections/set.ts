// ============================================================================
// @rlabs-inc/signals - ReactiveSet
// A Set with fine-grained per-item reactivity
// Based on Svelte 5's SvelteSet
// ============================================================================

import type { Source } from '../core/types.js'
import { source } from '../primitives/signal.js'
import { get, set } from '../reactivity/tracking.js'

// =============================================================================
// REACTIVE SET
// =============================================================================

/**
 * A reactive Set with per-item granularity
 *
 * Three levels of reactivity:
 * 1. Per-item signals: set.has(item) only tracks that specific item
 * 2. Version signal: Tracks structural changes (add/delete)
 * 3. Size signal: Tracks set size changes
 *
 * @example
 * ```ts
 * const tags = new ReactiveSet<string>()
 *
 * effect(() => {
 *   // Only re-runs when 'important' membership changes
 *   console.log('Is important:', tags.has('important'))
 * })
 *
 * tags.add('todo') // Doesn't trigger above effect
 * tags.add('important') // Triggers effect
 * ```
 */
export class ReactiveSet<T> extends Set<T> {
  // Per-item signals (true = present, false = deleted)
  #itemSignals = new Map<T, Source<boolean>>()

  // Version signal for structural changes
  #version: Source<number> = source(0)

  // Size signal
  #size: Source<number>

  constructor(values?: Iterable<T> | null) {
    super(values)
    this.#size = source(super.size)
  }

  /**
   * Get or create a signal for an item
   */
  #getItemSignal(item: T): Source<boolean> {
    let sig = this.#itemSignals.get(item)
    if (sig === undefined) {
      sig = source(super.has(item))
      this.#itemSignals.set(item, sig)
    }
    return sig
  }

  /**
   * Increment the version signal
   */
  #incrementVersion(): void {
    set(this.#version, this.#version.v + 1)
  }

  // ===========================================================================
  // SIZE
  // ===========================================================================

  get size(): number {
    get(this.#size)
    return super.size
  }

  // ===========================================================================
  // HAS
  // ===========================================================================

  has(item: T): boolean {
    const sig = this.#itemSignals.get(item)

    if (sig === undefined) {
      const exists = super.has(item)

      if (exists) {
        // Item exists, create signal and track
        const newSig = this.#getItemSignal(item)
        get(newSig)
        return true
      }

      // Item doesn't exist, track version for future adds
      get(this.#version)
      return false
    }

    get(sig)
    return super.has(item)
  }

  // ===========================================================================
  // ADD
  // ===========================================================================

  add(item: T): this {
    const isNew = !super.has(item)

    super.add(item)

    if (isNew) {
      const sig = this.#getItemSignal(item)
      set(sig, true)
      set(this.#size, super.size)
      this.#incrementVersion()
    }

    return this
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  delete(item: T): boolean {
    const existed = super.has(item)

    if (existed) {
      super.delete(item)

      const sig = this.#itemSignals.get(item)
      if (sig !== undefined) {
        set(sig, false)
        this.#itemSignals.delete(item)
      }

      set(this.#size, super.size)
      this.#incrementVersion()
    }

    return existed
  }

  // ===========================================================================
  // CLEAR
  // ===========================================================================

  clear(): void {
    if (super.size > 0) {
      // Mark all item signals as deleted
      for (const [item, sig] of this.#itemSignals) {
        set(sig, false)
      }
      this.#itemSignals.clear()

      super.clear()

      set(this.#size, 0)
      this.#incrementVersion()
    }
  }

  // ===========================================================================
  // ITERATION (tracks version)
  // ===========================================================================

  keys(): SetIterator<T> {
    get(this.#version)
    return super.keys()
  }

  values(): SetIterator<T> {
    get(this.#version)
    return super.values()
  }

  entries(): SetIterator<[T, T]> {
    get(this.#version)
    return super.entries()
  }

  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: unknown): void {
    get(this.#version)
    super.forEach(callbackfn, thisArg)
  }

  [Symbol.iterator](): SetIterator<T> {
    return this.values()
  }
}
