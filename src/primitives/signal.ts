// ============================================================================
// @rlabs-inc/signals - Signal Primitives
// Core signal creation functions
// ============================================================================

import type { Source, WritableSignal, Equals } from '../core/types.js'
import { equals as defaultEquals, safeEquals } from '../reactivity/equality.js'
import { get, set } from '../reactivity/tracking.js'

// =============================================================================
// SYMBOL FOR SOURCE ACCESS
// =============================================================================

/** Symbol to access the internal Source from a signal wrapper */
const SOURCE_SYMBOL = Symbol.for('signal.source')

// =============================================================================
// SOURCE (Internal Signal)
// =============================================================================

export interface SourceOptions<T> {
  equals?: Equals<T>
}

/**
 * Create a source (internal signal)
 * This is the low-level primitive - use signal() for the public API
 */
export function source<T>(initialValue: T, options?: SourceOptions<T>): Source<T> {
  return {
    f: 0,
    v: initialValue,
    equals: options?.equals ?? defaultEquals,
    reactions: null,
    rv: 0,
    wv: 0,
  }
}

/**
 * Create a mutable source with safe equality
 * Used for values that may contain NaN or need object reference tracking
 */
export function mutableSource<T>(initialValue: T): Source<T> {
  return source(initialValue, { equals: safeEquals })
}

// =============================================================================
// SIGNAL (Public API)
// =============================================================================

export interface SignalOptions<T> {
  equals?: Equals<T>
}

// =============================================================================
// AUTO-CLEANUP VIA FINALIZATION REGISTRY
// =============================================================================

/**
 * FinalizationRegistry for automatic signal cleanup.
 * When a signal wrapper is garbage collected, we clean up the internal Source
 * to break any remaining reaction links.
 */
const signalCleanup = new FinalizationRegistry<Source<unknown>>((src) => {
  src.reactions = null
})

/**
 * Create a writable signal
 *
 * @example
 * ```ts
 * const count = signal(0)
 * console.log(count.value) // 0
 * count.value = 1
 * console.log(count.value) // 1
 * ```
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): WritableSignal<T> {
  const src = source(initialValue, options)

  const sig = {
    [SOURCE_SYMBOL]: src,
    get value(): T {
      return get(src)
    },
    set value(newValue: T) {
      set(src, newValue)
    },
  }

  // Register for automatic cleanup when signal is GC'd
  signalCleanup.register(sig, src)

  return sig
}

/**
 * Get the internal Source from a signal wrapper.
 * Used internally for cleanup registration.
 */
export function getSource<T>(sig: WritableSignal<T>): Source<T> | undefined {
  return (sig as unknown as Record<symbol, Source<T>>)[SOURCE_SYMBOL]
}

// =============================================================================
// STATE (Deep Reactive Object)
// =============================================================================

// Import proxy lazily to avoid circular dependencies
let proxyFn: (<T extends object>(value: T) => T) | null = null

export function setProxyFn(fn: <T extends object>(value: T) => T): void {
  proxyFn = fn
}

/**
 * Create a deeply reactive state object
 * Unlike signal(), state() returns the proxy directly (no .value needed)
 *
 * @example
 * ```ts
 * const user = state({ name: 'John', age: 30 })
 * user.name = 'Jane' // No .value needed
 * ```
 */
export function state<T extends object>(initialValue: T): T {
  if (proxyFn === null) {
    throw new Error('state() requires proxy to be initialized. Import from index.ts.')
  }
  return proxyFn(initialValue)
}

// =============================================================================
// RAW STATE (No Deep Reactivity)
// =============================================================================

/**
 * Create a signal that holds an object reference without deep reactivity
 * Useful for DOM elements, class instances, or large objects where
 * you only want to track reference changes
 *
 * @example
 * ```ts
 * const canvas = stateRaw(document.createElement('canvas'))
 * // Only triggers when canvas.value is reassigned, not on canvas mutations
 * ```
 */
export function stateRaw<T>(initialValue: T): WritableSignal<T> {
  return signal(initialValue)
}
