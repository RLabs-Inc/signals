// ============================================================================
// @rlabs-inc/signals
// Production-grade fine-grained reactivity for TypeScript
// A complete standalone mirror of Svelte 5's reactivity system
// ============================================================================

// =============================================================================
// INITIALIZATION
// =============================================================================

import { setProxyFn } from './primitives/signal.js'
import { proxy } from './deep/proxy.js'

// Initialize state() to use proxy()
setProxyFn(proxy)

// =============================================================================
// CORE PRIMITIVES
// =============================================================================

export { signal, source, mutableSource, state, stateRaw } from './primitives/signal.js'
export { derived, createDerived, disconnectDerived } from './primitives/derived.js'
export { effect, createEffect, updateEffect, destroyEffect } from './primitives/effect.js'
export { bind, bindReadonly, isBinding, unwrap } from './primitives/bind.js'

// =============================================================================
// DEEP REACTIVITY
// =============================================================================

export { proxy, toRaw, isReactive } from './deep/proxy.js'

// =============================================================================
// REACTIVITY UTILITIES
// =============================================================================

export { batch, untrack, peek } from './reactivity/batching.js'
export { flushSync, tick } from './reactivity/scheduling.js'

// =============================================================================
// EQUALITY FUNCTIONS
// =============================================================================

export {
  equals,
  safeEquals,
  safeNotEqual,
  shallowEquals,
  createEquals,
  neverEquals,
  alwaysEquals,
} from './reactivity/equality.js'

// =============================================================================
// REACTIVE COLLECTIONS
// =============================================================================

export { ReactiveMap } from './collections/map.js'
export { ReactiveSet } from './collections/set.js'
export { ReactiveDate } from './collections/date.js'

// =============================================================================
// LOW-LEVEL TRACKING API (for advanced use)
// =============================================================================

export {
  get,
  set,
  isDirty,
  setSignalStatus,
  markReactions,
  updateReaction,
  removeReactions,
} from './reactivity/tracking.js'

// =============================================================================
// CONSTANTS (for advanced use)
// =============================================================================

export {
  // Signal type flags
  DERIVED,
  EFFECT,
  RENDER_EFFECT,
  ROOT_EFFECT,
  BRANCH_EFFECT,
  USER_EFFECT,
  BLOCK_EFFECT,

  // Status flags
  CLEAN,
  DIRTY,
  MAYBE_DIRTY,
  REACTION_IS_UPDATING,
  DESTROYED,
  INERT,
  EFFECT_RAN,
  EFFECT_PRESERVED,

  // Derived flags
  UNOWNED,
  DISCONNECTED,

  // Sentinel values
  UNINITIALIZED,
  STALE_REACTION,
  STATE_SYMBOL,
  REACTIVE_MARKER,
} from './core/constants.js'

// =============================================================================
// GLOBALS (for advanced use)
// =============================================================================

export {
  activeReaction,
  activeEffect,
  untracking,
  writeVersion,
  readVersion,
  batchDepth,

  // Setters
  setActiveReaction,
  setActiveEffect,
  setUntracking,
  incrementWriteVersion,
  incrementReadVersion,
  incrementBatchDepth,
  decrementBatchDepth,

  // Getters
  getReadVersion,
  getWriteVersion,
  getBatchDepth,
} from './core/globals.js'

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Core types
  Signal,
  Source,
  Reaction,
  Derived,
  Effect,
  Value,

  // Public API types
  ReadableSignal,
  WritableSignal,
  DerivedSignal,
  DisposeFn,
  CleanupFn,
  EffectFn,

  // Utility types
  Equals,
  Uninitialized,
} from './core/types.js'

export type { Binding, ReadonlyBinding } from './primitives/bind.js'
