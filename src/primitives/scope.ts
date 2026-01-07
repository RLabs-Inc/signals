// ============================================================================
// @rlabs-inc/signals - Effect Scope
//
// Group effects for batch disposal with pause/resume support.
// Based on Vue 3's effectScope pattern.
// ============================================================================

import type { Effect, CleanupFn } from '../core/types.js'
import { DESTROYED, INERT, DIRTY, EFFECT } from '../core/constants.js'
import { setSignalStatus } from '../reactivity/tracking.js'
import { scheduleEffect } from '../reactivity/scheduling.js'
import { destroyEffect } from './effect.js'

// =============================================================================
// TYPES
// =============================================================================

/**
 * An effect scope that groups effects for batch disposal.
 */
export interface EffectScope {
  /** Whether the scope is still active (not stopped) */
  readonly active: boolean

  /** Whether the scope is paused */
  readonly paused: boolean

  /**
   * Run a function within this scope.
   * Effects created during execution are tracked by this scope.
   */
  run<R>(fn: () => R): R | undefined

  /**
   * Stop the scope, disposing all tracked effects.
   */
  stop(): void

  /**
   * Pause all effects in this scope.
   * Paused effects won't run until resumed.
   */
  pause(): void

  /**
   * Resume all paused effects in this scope.
   * Dirty effects will be scheduled for execution.
   */
  resume(): void
}

// =============================================================================
// SCOPE STATE
// =============================================================================

let activeScope: EffectScopeImpl | null = null

/**
 * Get the currently active scope.
 */
export function getCurrentScope(): EffectScope | null {
  return activeScope
}

/**
 * Set the active scope (internal).
 */
function setActiveScope(scope: EffectScopeImpl | null): EffectScopeImpl | null {
  const prev = activeScope
  activeScope = scope
  return prev
}

// =============================================================================
// EFFECT SCOPE IMPLEMENTATION
// =============================================================================

class EffectScopeImpl implements EffectScope {
  private _active = true
  private _paused = false

  /** Effects created within this scope */
  effects: Effect[] = []

  /** Cleanup functions to run on stop */
  cleanups: CleanupFn[] = []

  /** Parent scope (for nested scopes) */
  parent: EffectScopeImpl | null = null

  /** Child scopes */
  scopes: EffectScopeImpl[] | null = null

  constructor(detached = false) {
    this.parent = activeScope

    // Register with parent scope unless detached
    if (!detached && this.parent) {
      if (this.parent.scopes === null) {
        this.parent.scopes = []
      }
      this.parent.scopes.push(this)
    }
  }

  get active(): boolean {
    return this._active
  }

  get paused(): boolean {
    return this._paused
  }

  run<R>(fn: () => R): R | undefined {
    if (!this._active) {
      return undefined
    }

    const prevScope = setActiveScope(this)
    try {
      return fn()
    } finally {
      setActiveScope(prevScope)
    }
  }

  stop(): void {
    if (!this._active) return

    // Dispose all effects
    for (const effect of [...this.effects]) {
      destroyEffect(effect)
    }
    this.effects.length = 0

    // Run cleanups
    for (const cleanup of this.cleanups) {
      try {
        cleanup()
      } catch {
        // Cleanup errors are silently ignored
      }
    }
    this.cleanups.length = 0

    // Stop child scopes
    if (this.scopes) {
      for (const scope of this.scopes) {
        scope.stop()
      }
      this.scopes.length = 0
    }

    // Remove from parent
    if (this.parent?.scopes) {
      const idx = this.parent.scopes.indexOf(this)
      if (idx !== -1) {
        this.parent.scopes.splice(idx, 1)
      }
    }

    this._active = false
  }

  pause(): void {
    if (!this._active || this._paused) return

    this._paused = true

    // Mark all effects as inert (paused)
    for (const effect of this.effects) {
      effect.f |= INERT
    }

    // Pause child scopes
    if (this.scopes) {
      for (const scope of this.scopes) {
        scope.pause()
      }
    }
  }

  resume(): void {
    if (!this._active || !this._paused) return

    this._paused = false

    // Unmark effects and reschedule dirty ones
    for (const effect of this.effects) {
      effect.f &= ~INERT

      // If effect is dirty, reschedule it
      if ((effect.f & DIRTY) !== 0) {
        scheduleEffect(effect)
      }
    }

    // Resume child scopes
    if (this.scopes) {
      for (const scope of this.scopes) {
        scope.resume()
      }
    }
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create an effect scope.
 * Effects created within the scope can be disposed together.
 *
 * @example
 * ```ts
 * const scope = effectScope()
 *
 * scope.run(() => {
 *   // These effects are tracked by the scope
 *   effect(() => console.log(count.value))
 *   effect(() => console.log(name.value))
 * })
 *
 * // Later, dispose all effects at once
 * scope.stop()
 * ```
 *
 * @example With pause/resume
 * ```ts
 * const scope = effectScope()
 *
 * scope.run(() => {
 *   effect(() => console.log(count.value))
 * })
 *
 * // Pause effects (they won't run while paused)
 * scope.pause()
 *
 * count.value++ // Effect doesn't run
 *
 * // Resume effects (pending updates will run)
 * scope.resume()
 * ```
 *
 * @param detached - If true, scope won't be collected by parent scope
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScopeImpl(detached)
}

/**
 * Register a cleanup function on the current scope.
 * Will be called when the scope is stopped.
 *
 * @example
 * ```ts
 * scope.run(() => {
 *   const timer = setInterval(() => console.log('tick'), 1000)
 *
 *   onScopeDispose(() => {
 *     clearInterval(timer)
 *   })
 * })
 *
 * // Later...
 * scope.stop() // Timer is cleared
 * ```
 */
export function onScopeDispose(fn: CleanupFn): void {
  if (activeScope) {
    activeScope.cleanups.push(fn)
  } else {
    console.warn('onScopeDispose() called outside of scope context')
  }
}

/**
 * Register an effect with the current scope.
 * Called internally when an effect is created.
 */
export function registerEffectWithScope(effect: Effect): void {
  if (activeScope) {
    activeScope.effects.push(effect)
  }
}
