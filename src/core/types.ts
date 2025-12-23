// ============================================================================
// @rlabs-inc/signals - Type Definitions
// Based on Svelte 5's internal types
// ============================================================================

import type { UNINITIALIZED } from './constants.js'

// =============================================================================
// EQUALITY FUNCTION
// =============================================================================

/** Equality function for comparing signal values */
// Using `any` to avoid covariance issues - equality functions don't need strong typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Equals<T = any> = (oldValue: any, newValue: any) => boolean

// =============================================================================
// BASE SIGNAL INTERFACE
// =============================================================================

/** Base interface for all reactive values */
export interface Signal {
  /** Flags bitmask for state tracking */
  f: number

  /** Write version - incremented when signal is written */
  wv: number
}

// =============================================================================
// SOURCE (BASIC SIGNAL)
// =============================================================================

/** A reactive source (basic signal) */
export interface Source<T = unknown> extends Signal {
  /** Current value */
  v: T

  /** Equality function for comparing values */
  equals: Equals<T>

  /** Reactions (effects/deriveds) that depend on this source */
  reactions: Reaction[] | null

  /** Read version - for dependency deduplication */
  rv: number
}

// =============================================================================
// REACTION (EFFECT OR DERIVED)
// =============================================================================

/** Base interface for reactions (effects and deriveds) */
export interface Reaction extends Signal {
  /** The function to execute */
  fn: Function | null

  /** Dependencies (sources/deriveds this reaction reads) */
  deps: Source[] | null
}

// =============================================================================
// DERIVED
// =============================================================================

/** A derived (computed) value */
export interface Derived<T = unknown> extends Source<T>, Reaction {
  /** Computation function */
  fn: () => T

  /** Child effects created inside this derived */
  effects: Effect[] | null

  /** Parent effect or derived */
  parent: Effect | Derived | null
}

// =============================================================================
// EFFECT
// =============================================================================

/** Cleanup function returned by effects */
export type CleanupFn = () => void

/** Effect function signature */
export type EffectFn = () => void | CleanupFn

/** An effect (side effect) */
export interface Effect extends Reaction {
  /** Effect function */
  fn: EffectFn | null

  /** Teardown/cleanup function from last run */
  teardown: CleanupFn | null

  /** Parent effect in the effect tree */
  parent: Effect | null

  /** First child effect */
  first: Effect | null

  /** Last child effect */
  last: Effect | null

  /** Previous sibling effect */
  prev: Effect | null

  /** Next sibling effect */
  next: Effect | null
}

// =============================================================================
// VALUE TYPE (SOURCE OR DERIVED)
// =============================================================================

/** A value that can be read (source or derived) */
export type Value<T = unknown> = Source<T> | Derived<T>

// =============================================================================
// PUBLIC API TYPES
// =============================================================================

/** Read-only signal interface (public API) */
export interface ReadableSignal<T> {
  readonly value: T
}

/** Writable signal interface (public API) */
export interface WritableSignal<T> extends ReadableSignal<T> {
  value: T
}

/** Derived signal interface (public API) */
export interface DerivedSignal<T> extends ReadableSignal<T> {}

/** Dispose function for effects */
export type DisposeFn = () => void

// =============================================================================
// UNINITIALIZED TYPE
// =============================================================================

/** Type for uninitialized values */
export type Uninitialized = typeof UNINITIALIZED
