// ============================================================================
// @rlabs-inc/signals - Batching
// Group multiple updates into a single reaction cycle
// ============================================================================

import {
  incrementBatchDepth,
  decrementBatchDepth,
  getBatchDepth,
} from '../core/globals.js'
import { flushPendingReactions } from './scheduling.js'

// =============================================================================
// BATCH
// =============================================================================

/**
 * Batch multiple signal updates into a single reaction cycle
 *
 * Without batching, each signal update triggers effects immediately.
 * With batching, effects only run once after all updates complete.
 *
 * @example
 * ```ts
 * const a = signal(1)
 * const b = signal(2)
 *
 * effect(() => {
 *   console.log(a.value + b.value)
 * })
 *
 * // Without batch: logs twice (during each update)
 * // With batch: logs once (after both updates)
 * batch(() => {
 *   a.value = 10
 *   b.value = 20
 * })
 * ```
 */
export function batch<T>(fn: () => T): T {
  incrementBatchDepth()

  try {
    return fn()
  } finally {
    const depth = decrementBatchDepth()

    // When outermost batch completes, flush pending reactions
    if (depth === 0) {
      flushPendingReactions()
    }
  }
}

// =============================================================================
// UNTRACK
// =============================================================================

import { setUntracking } from '../core/globals.js'

/**
 * Read signals without creating dependencies
 *
 * Useful when you need to read a value but don't want
 * the effect to re-run when it changes.
 *
 * @example
 * ```ts
 * const a = signal(1)
 * const b = signal(2)
 *
 * effect(() => {
 *   // This creates a dependency on 'a'
 *   console.log(a.value)
 *
 *   // This does NOT create a dependency on 'b'
 *   untrack(() => {
 *     console.log(b.value)
 *   })
 * })
 *
 * a.value = 10 // Effect re-runs
 * b.value = 20 // Effect does NOT re-run
 * ```
 */
export function untrack<T>(fn: () => T): T {
  const prev = setUntracking(true)

  try {
    return fn()
  } finally {
    setUntracking(prev)
  }
}

/**
 * Alias for untrack()
 * Some prefer this name as it's more explicit about "peeking" at a value
 */
export const peek = untrack
