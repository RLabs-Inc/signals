// ============================================================================
// @rlabs-inc/signals - ReactiveMap
// A Map with fine-grained per-key reactivity
// Based on Svelte 5's SvelteMap
// ============================================================================

import type { Source } from '../core/types.js'
import { source } from '../primitives/signal.js'
import { get, set } from '../reactivity/tracking.js'

// =============================================================================
// REACTIVE MAP
// =============================================================================

/**
 * A reactive Map with per-key granularity
 *
 * Three levels of reactivity:
 * 1. Per-key signals: map.get('key') only tracks that specific key
 * 2. Version signal: Tracks structural changes (add/delete)
 * 3. Size signal: Tracks map size changes
 *
 * @example
 * ```ts
 * const users = new ReactiveMap<string, User>()
 *
 * effect(() => {
 *   // Only re-runs when 'alice' changes
 *   console.log(users.get('alice'))
 * })
 *
 * users.set('bob', { name: 'Bob' }) // Doesn't trigger above effect
 * users.set('alice', { name: 'Alice Updated' }) // Triggers effect
 * ```
 */
export class ReactiveMap<K, V> extends Map<K, V> {
  // Per-key signals (version number incremented on change)
  #keySignals = new Map<K, Source<number>>()

  // Version signal for structural changes
  #version: Source<number> = source(0)

  // Size signal
  #size: Source<number>

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super(entries)
    this.#size = source(super.size)
  }

  /**
   * Get or create a signal for a key
   */
  #getKeySignal(key: K): Source<number> {
    let sig = this.#keySignals.get(key)
    if (sig === undefined) {
      sig = source(0)
      this.#keySignals.set(key, sig)
    }
    return sig
  }

  /**
   * Increment a signal's value (trigger update)
   */
  #increment(sig: Source<number>): void {
    set(sig, sig.v + 1)
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

  has(key: K): boolean {
    const sig = this.#keySignals.get(key)

    if (sig === undefined) {
      // Key doesn't exist yet, track version for future adds
      if (!super.has(key)) {
        get(this.#version)
        return false
      }

      // Key exists, create signal and track
      const newSig = this.#getKeySignal(key)
      get(newSig)
      return true
    }

    get(sig)
    return super.has(key)
  }

  // ===========================================================================
  // GET
  // ===========================================================================

  get(key: K): V | undefined {
    const sig = this.#keySignals.get(key)

    if (sig === undefined) {
      const val = super.get(key)

      if (val !== undefined) {
        // Key exists, create signal and track
        const newSig = this.#getKeySignal(key)
        get(newSig)
        return val
      }

      // Key doesn't exist, track version for future adds
      get(this.#version)
      return undefined
    }

    get(sig)
    return super.get(key)
  }

  // ===========================================================================
  // SET
  // ===========================================================================

  set(key: K, value: V): this {
    const isNew = !super.has(key)
    const oldValue = super.get(key)

    super.set(key, value)

    const sig = this.#getKeySignal(key)

    if (isNew) {
      // New key: trigger size, version, and key signal
      set(this.#size, super.size)
      this.#increment(this.#version)
      this.#increment(sig)
    } else if (!Object.is(oldValue, value)) {
      // Value changed: trigger key signal
      this.#increment(sig)

      // Also trigger version if any reaction to this key
      // isn't already tracking version (optimization from Svelte)
      const versionReactions = this.#version.reactions
      const keyReactions = sig.reactions

      if (
        keyReactions !== null &&
        (versionReactions === null ||
          !keyReactions.every(r => versionReactions.includes(r)))
      ) {
        this.#increment(this.#version)
      }
    }

    return this
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  delete(key: K): boolean {
    const existed = super.has(key)

    if (existed) {
      super.delete(key)

      const sig = this.#keySignals.get(key)
      if (sig !== undefined) {
        // Mark key signal as deleted (-1)
        set(sig, -1)
        this.#keySignals.delete(key)
      }

      set(this.#size, super.size)
      this.#increment(this.#version)
    }

    return existed
  }

  // ===========================================================================
  // CLEAR
  // ===========================================================================

  clear(): void {
    if (super.size > 0) {
      // Mark all key signals as deleted
      for (const [key, sig] of this.#keySignals) {
        set(sig, -1)
      }
      this.#keySignals.clear()

      super.clear()

      set(this.#size, 0)
      this.#increment(this.#version)
    }
  }

  // ===========================================================================
  // ITERATION (tracks version)
  // ===========================================================================

  keys(): MapIterator<K> {
    get(this.#version)
    return super.keys()
  }

  values(): MapIterator<V> {
    get(this.#version)
    return super.values()
  }

  entries(): MapIterator<[K, V]> {
    get(this.#version)
    return super.entries()
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    get(this.#version)
    super.forEach(callbackfn, thisArg)
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }
}
