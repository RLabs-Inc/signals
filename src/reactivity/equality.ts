// ============================================================================
// @rlabs-inc/signals - Equality Functions
// Based on Svelte 5's equality checking
// ============================================================================

import type { Equals } from '../core/types.js'

// =============================================================================
// STRICT EQUALITY (Default)
// =============================================================================

/**
 * Default strict equality function using Object.is
 * This is the default for source() signals
 */
export const equals: Equals = (oldValue, newValue) => Object.is(oldValue, newValue)

// =============================================================================
// SAFE EQUALITY (Handles NaN and objects)
// =============================================================================

/**
 * Safe not-equal check
 * Handles NaN correctly and considers objects/functions as not equal
 */
export function safeNotEqual<T>(a: T, b: T): boolean {
  // NaN check: NaN !== NaN but we want NaN === NaN
  // eslint-disable-next-line no-self-compare
  return a != a
    ? // If a is NaN, check if b is NOT NaN (if b is NaN, they're "equal")
      b == b
    : // Otherwise, check strict inequality OR if a is an object/function
      a !== b || (a !== null && typeof a === 'object') || typeof a === 'function'
}

/**
 * Safe equality function
 * Used for mutable sources where NaN and objects need special handling
 */
export const safeEquals: Equals = (oldValue, newValue) => !safeNotEqual(oldValue, newValue)

// =============================================================================
// SHALLOW EQUALITY
// =============================================================================

/**
 * Shallow equality for objects/arrays
 * Compares own enumerable properties one level deep
 */
export const shallowEquals: Equals = (oldValue, newValue) => {
  // Handle primitives and identical references
  if (Object.is(oldValue, newValue)) {
    return true
  }

  // Both must be objects
  if (
    typeof oldValue !== 'object' ||
    oldValue === null ||
    typeof newValue !== 'object' ||
    newValue === null
  ) {
    return false
  }

  // Check array length
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    if (oldValue.length !== newValue.length) {
      return false
    }
    for (let i = 0; i < oldValue.length; i++) {
      if (!Object.is(oldValue[i], newValue[i])) {
        return false
      }
    }
    return true
  }

  // Check object keys
  const oldKeys = Object.keys(oldValue)
  const newKeys = Object.keys(newValue)

  if (oldKeys.length !== newKeys.length) {
    return false
  }

  for (const key of oldKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(newValue, key) ||
      !Object.is(
        (oldValue as Record<string, unknown>)[key],
        (newValue as Record<string, unknown>)[key]
      )
    ) {
      return false
    }
  }

  return true
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a custom equality function
 */
export function createEquals<T>(fn: (a: T, b: T) => boolean): Equals<T> {
  return (oldValue, newValue) => fn(oldValue, newValue)
}

/**
 * Never equal - always triggers updates
 * Useful for forcing reactivity
 */
export const neverEquals: Equals = () => false

/**
 * Always equal - never triggers updates
 * Useful for static values
 */
export const alwaysEquals: Equals = () => true
