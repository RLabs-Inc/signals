// ============================================================================
// @rlabs-inc/signals - Derived Signals
// Lazy computed values that cache and update when dependencies change
// ============================================================================

import type { Derived, Effect, DerivedSignal, Equals } from '../core/types.js'
import {
  DERIVED,
  DIRTY,
  CLEAN,
  MAYBE_DIRTY,
  UNOWNED,
  UNINITIALIZED,
} from '../core/constants.js'
import { activeReaction, activeEffect, incrementWriteVersion } from '../core/globals.js'
import { deepEquals as defaultEquals } from '../reactivity/equality.js'
import {
  get,
  updateReaction,
  setSignalStatus,
  setUpdateDerivedImpl,
  removeReactions,
} from '../reactivity/tracking.js'

// =============================================================================
// AUTO-CLEANUP VIA FINALIZATION REGISTRY
// =============================================================================

/**
 * FinalizationRegistry for automatic derived cleanup.
 * When a derived wrapper is garbage collected, we disconnect it from
 * the dependency graph to prevent memory leaks.
 */
const derivedCleanup = new FinalizationRegistry<Derived>((d) => {
  // Use disconnectDerived logic inline to avoid circular issues
  removeReactions(d, 0)
  d.deps = null
  d.reactions = null
  // Destroy any effects created inside this derived
  const effects = d.effects
  if (effects !== null) {
    d.effects = null
    for (let i = 0; i < effects.length; i++) {
      destroyEffectImpl(effects[i])
    }
  }
})

// =============================================================================
// DERIVED OPTIONS
// =============================================================================

export interface DerivedOptions<T> {
  equals?: Equals<T>
}

// =============================================================================
// DERIVED (Internal)
// =============================================================================

/**
 * Create a derived signal (internal)
 * This is the low-level primitive
 */
export function createDerived<T>(fn: () => T, options?: DerivedOptions<T>): Derived<T> {
  let flags = DERIVED | DIRTY

  // Find parent for ownership tracking
  const parentDerived =
    activeReaction !== null && (activeReaction.f & DERIVED) !== 0
      ? (activeReaction as unknown as Derived)
      : null

  // If no active effect, or parent derived is unowned, mark as unowned
  if (activeEffect === null || (parentDerived !== null && (parentDerived.f & UNOWNED) !== 0)) {
    flags |= UNOWNED
  }

  const derived: Derived<T> = {
    f: flags,
    fn,
    v: UNINITIALIZED as T,
    equals: options?.equals ?? defaultEquals,
    reactions: null,
    deps: null,
    effects: null,
    parent: parentDerived ?? activeEffect,
    rv: 0,
    wv: 0,
  }

  return derived
}

// =============================================================================
// EXECUTE DERIVED
// =============================================================================

/**
 * Execute a derived's computation function
 * Cleans up old effects and tracks new dependencies
 */
export function executeDerived<T>(derived: Derived<T>): T {
  // Destroy any effects created in previous execution
  destroyDerivedEffects(derived)

  // Run the computation with dependency tracking
  const value = updateReaction(derived) as T

  return value
}

// =============================================================================
// UPDATE DERIVED
// =============================================================================

/**
 * Update a derived signal's value
 * Only called when the derived is dirty and being read
 */
export function updateDerived<T>(derived: Derived<T>): void {
  const value = executeDerived(derived)

  // Only trigger reactions if value actually changed
  if (!derived.equals(derived.v, value)) {
    derived.v = value
    derived.wv = incrementWriteVersion()
  }

  // Mark as clean (or MAYBE_DIRTY if unowned and has deps)
  const status =
    (derived.f & UNOWNED) !== 0 && derived.deps !== null ? MAYBE_DIRTY : CLEAN

  setSignalStatus(derived, status)
}

// Register the implementation with tracking.ts
setUpdateDerivedImpl(updateDerived)

// =============================================================================
// DESTROY DERIVED EFFECTS
// =============================================================================

// Forward declaration - actual implementation set by effect.ts
let destroyEffectImpl: (effect: Effect) => void = () => {}

export function setDestroyEffectImpl(impl: (effect: Effect) => void): void {
  destroyEffectImpl = impl
}

/**
 * Destroy all effects created inside a derived
 */
function destroyDerivedEffects(derived: Derived): void {
  const effects = derived.effects
  if (effects !== null) {
    derived.effects = null
    for (let i = 0; i < effects.length; i++) {
      destroyEffectImpl(effects[i])
    }
  }
}

// =============================================================================
// DERIVED (Public API)
// =============================================================================

/**
 * Create a derived signal
 *
 * Derived signals are lazy - they only compute when read.
 * They cache their value and only recompute when dependencies change.
 *
 * @example
 * ```ts
 * const count = signal(1)
 * const doubled = derived(() => count.value * 2)
 * console.log(doubled.value) // 2
 * count.value = 5
 * console.log(doubled.value) // 10
 * ```
 */
export function derived<T>(fn: () => T, options?: DerivedOptions<T>): DerivedSignal<T> {
  const d = createDerived(fn, options)

  const wrapper = {
    get value(): T {
      return get(d)
    },
  }

  // Register for automatic cleanup when derived is GC'd
  derivedCleanup.register(wrapper, d)

  return wrapper
}

/**
 * Create a derived signal (alternative syntax)
 * Alias for derived() to match Svelte's $derived.by()
 */
derived.by = derived

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Disconnect a derived from its dependencies
 * Used when a derived is no longer needed
 */
export function disconnectDerived(derived: Derived): void {
  removeReactions(derived, 0)
  derived.deps = null
  derived.reactions = null
  destroyDerivedEffects(derived)
}
