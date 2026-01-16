// ============================================================================
// @rlabs-inc/signals - Effect System
// Side effects that re-run when dependencies change
// ============================================================================

import type { Effect, EffectFn, CleanupFn, DisposeFn } from '../core/types.js'
import {
  EFFECT,
  RENDER_EFFECT,
  ROOT_EFFECT,
  BRANCH_EFFECT,
  USER_EFFECT,
  DIRTY,
  CLEAN,
  DESTROYED,
  EFFECT_RAN,
  EFFECT_PRESERVED,
} from '../core/constants.js'
import {
  activeEffect,
  setActiveEffect,
  incrementWriteVersion,
} from '../core/globals.js'
import {
  updateReaction,
  setSignalStatus,
  removeReactions,
} from '../reactivity/tracking.js'
import { scheduleEffect, setUpdateEffectImpl } from '../reactivity/scheduling.js'
import { setDestroyEffectImpl } from './derived.js'
import { registerEffectWithScope } from './scope.js'

// =============================================================================
// CREATE EFFECT (Internal)
// =============================================================================

/**
 * Create an effect (internal)
 *
 * @param type - Effect type flags
 * @param fn - Effect function
 * @param sync - Whether to run synchronously
 * @param push - Whether to add to parent's child list
 */
export function createEffect(
  type: number,
  fn: EffectFn | null,
  sync: boolean,
  push = true
): Effect {
  const parent = activeEffect

  const effect: Effect = {
    f: type | DIRTY,
    fn,
    deps: null,
    teardown: null,
    parent,
    first: null,
    last: null,
    prev: null,
    next: null,
    wv: 0,
  }

  // Register with active scope (for effectScope() support)
  registerEffectWithScope(effect)

  // Run immediately if sync, otherwise schedule
  if (sync) {
    updateEffect(effect)
    effect.f |= EFFECT_RAN
  } else if (fn !== null) {
    scheduleEffect(effect)
  }

  // Add to parent's child list
  if (push && parent !== null) {
    pushEffect(effect, parent)
  }

  return effect
}

// =============================================================================
// PUSH EFFECT - Add to parent's child list
// =============================================================================

/**
 * Add an effect to its parent's child list
 */
function pushEffect(effect: Effect, parent: Effect): void {
  const parentLast = parent.last

  if (parentLast === null) {
    parent.first = parent.last = effect
  } else {
    parentLast.next = effect
    effect.prev = parentLast
    parent.last = effect
  }
}

// =============================================================================
// UPDATE EFFECT - Run an effect
// =============================================================================

/**
 * Run an effect and track its dependencies
 */
export function updateEffect(effect: Effect): void {
  // Skip if destroyed
  if ((effect.f & DESTROYED) !== 0) return

  // Mark as clean
  setSignalStatus(effect, CLEAN)

  const prevEffect = activeEffect
  setActiveEffect(effect)

  try {
    // Destroy child effects from previous run
    destroyEffectChildren(effect)

    // Run teardown from previous run
    executeTeardown(effect)

    // Run the effect function with dependency tracking
    const teardown = updateReaction(effect)

    // Store teardown if returned
    effect.teardown = typeof teardown === 'function' ? (teardown as CleanupFn) : null

    // Update write version
    effect.wv = incrementWriteVersion()
  } finally {
    setActiveEffect(prevEffect)
  }
}

// Register with scheduling
setUpdateEffectImpl(updateEffect)

// =============================================================================
// DESTROY EFFECT
// =============================================================================

/**
 * Destroy an effect and all its children
 */
export function destroyEffect(effect: Effect, removeFromParent = true): void {
  // Recursively destroy children
  destroyEffectChildren(effect)

  // Remove from all dependencies
  removeReactions(effect, 0)

  // Mark as destroyed
  setSignalStatus(effect, DESTROYED)

  // Run teardown
  executeTeardown(effect)

  // Remove from parent's child list
  if (removeFromParent && effect.parent !== null) {
    unlinkEffect(effect)
  }

  // Nullify for GC
  effect.fn = null
  effect.teardown = null
  effect.deps = null
  effect.first = null
  effect.last = null
  effect.prev = null
  effect.next = null
}

// Register with derived
setDestroyEffectImpl(destroyEffect)

// =============================================================================
// DESTROY EFFECT CHILDREN
// =============================================================================

/**
 * Destroy all children of an effect
 */
function destroyEffectChildren(effect: Effect): void {
  let child = effect.first
  effect.first = null
  effect.last = null

  while (child !== null) {
    const next = child.next

    // Don't destroy preserved or root effects
    if ((child.f & (EFFECT_PRESERVED | ROOT_EFFECT)) === 0) {
      destroyEffect(child, false)
    }

    child = next
  }
}

// =============================================================================
// EXECUTE TEARDOWN
// =============================================================================

/**
 * Run an effect's teardown function
 */
function executeTeardown(effect: Effect): void {
  const teardown = effect.teardown
  if (teardown !== null) {
    effect.teardown = null
    teardown()
  }
}

// =============================================================================
// UNLINK EFFECT
// =============================================================================

/**
 * Remove an effect from its parent's child list
 */
function unlinkEffect(effect: Effect): void {
  const { parent, prev, next } = effect

  if (prev !== null) {
    prev.next = next
  }
  if (next !== null) {
    next.prev = prev
  }

  if (parent !== null) {
    if (parent.first === effect) {
      parent.first = next
    }
    if (parent.last === effect) {
      parent.last = prev
    }
  }

  effect.prev = null
  effect.next = null
}

// =============================================================================
// EFFECT (Public API)
// =============================================================================

/**
 * Create an effect that runs when dependencies change
 *
 * Effects are scheduled asynchronously (microtask).
 * The function can return a cleanup function that runs before the next execution.
 *
 * @example
 * ```ts
 * const count = signal(0)
 *
 * effect(() => {
 *   console.log('Count:', count.value)
 *   return () => console.log('Cleanup')
 * })
 * ```
 */
export function effect(fn: EffectFn): DisposeFn {
  const eff = createEffect(EFFECT | USER_EFFECT, fn, false)

  return () => destroyEffect(eff)
}

/**
 * Create a synchronous effect that runs immediately when dependencies change.
 * Unlike regular effect() which batches via microtask, sync effects execute
 * immediately after each signal write for predictable timing.
 *
 * Use when you need:
 * - Predictable execution order (debugging, testing)
 * - Immediate side effects after signal writes
 * - Sequential logic where timing matters
 *
 * For best performance with multiple writes, combine with batch():
 * @example
 * ```ts
 * const count = signal(0)
 * effect.sync(() => console.log(count.value)) // Runs immediately on each change
 *
 * batch(() => {
 *   count.value = 1
 *   count.value = 2
 *   count.value = 3
 * }) // Effect runs once with final value (3)
 * ```
 */
effect.sync = function effectSync(fn: EffectFn): DisposeFn {
  const eff = createEffect(RENDER_EFFECT | USER_EFFECT, fn, true)
  return () => destroyEffect(eff)
}

/** @deprecated Use effect.sync() instead */
effect.pre = effect.sync

/**
 * Create a root effect scope
 * Returns a dispose function that destroys all effects created inside
 *
 * @example
 * ```ts
 * const dispose = effect.root(() => {
 *   effect(() => console.log('A'))
 *   effect(() => console.log('B'))
 * })
 *
 * // Later, clean up all effects
 * dispose()
 * ```
 */
effect.root = function effectRoot(fn: () => void): DisposeFn {
  const eff = createEffect(ROOT_EFFECT | EFFECT_PRESERVED, fn, true)

  return () => destroyEffect(eff)
}

/**
 * Check if we're currently inside a tracking context
 * Useful for conditional reactivity
 */
effect.tracking = function effectTracking(): boolean {
  return activeEffect !== null
}
