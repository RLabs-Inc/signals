// ============================================================================
// @rlabs-inc/signals - createSelector (Solid's O(n)->O(2) optimization)
//
// For list selection patterns, instead of O(n) effects re-running on every
// selection change, only the previous and current selected items' effects
// run = O(2).
// ============================================================================

import type { Reaction } from '../core/types.js'
import { DIRTY, DESTROYED, EFFECT, DERIVED } from '../core/constants.js'
import { activeReaction } from '../core/globals.js'
import { scheduleEffect, flushSync } from '../reactivity/scheduling.js'
import { setSignalStatus } from '../reactivity/tracking.js'
import { derived } from './derived.js'
import { effect } from './effect.js'

// =============================================================================
// TYPES
// =============================================================================

/**
 * A selector function that returns whether a key matches the current selection.
 */
export type SelectorFn<T, U = T> = (key: U) => boolean

// =============================================================================
// createSelector Implementation
// =============================================================================

/**
 * Create a selector function for efficient list selection tracking.
 *
 * Instead of each list item effect depending on the full selection state,
 * only items whose selection status changed will re-run.
 *
 * This turns O(n) updates into O(2) updates: only the previously selected
 * and newly selected items' effects run.
 *
 * @example
 * ```ts
 * const selectedId = signal(1)
 * const isSelected = createSelector(() => selectedId.value)
 *
 * // In a list of 1000 items:
 * items.forEach(item => {
 *   effect(() => {
 *     // Only runs when THIS item's selection state changes!
 *     // When selectedId changes from 1 to 2:
 *     // - Only item 1's effect runs (was selected, now not)
 *     // - Only item 2's effect runs (was not selected, now is)
 *     // - Other 998 items' effects DON'T run
 *     if (isSelected(item.id)) {
 *       highlight(item)
 *     } else {
 *       unhighlight(item)
 *     }
 *   })
 * })
 * ```
 *
 * @param source - Function returning the current selection value
 * @param fn - Optional comparison function (defaults to strict equality)
 */
export function createSelector<T, U = T>(
  source: () => T,
  fn: (key: U, value: T) => boolean = (k, v) => (k as unknown) === v
): SelectorFn<T, U> {
  // Map of keys to their subscribed reactions
  const subscribers = new Map<U, Set<Reaction>>()

  // Track subscriptions per reaction for cleanup
  const reactionKeys = new WeakMap<Reaction, Set<U>>()

  let prevValue: T | undefined
  let initialized = false

  // Internal effect to track source changes
  effect.pre(() => {
    const value = source()

    // Only notify if value actually changed and we're initialized
    if (initialized && !Object.is(prevValue, value)) {
      // Find keys whose selection state changed
      for (const [key, reactions] of subscribers) {
        const wasSelected = fn(key, prevValue!)
        const isSelected = fn(key, value)

        if (wasSelected !== isSelected) {
          // Selection state changed - notify these reactions
          // Filter out destroyed reactions while we're at it
          const toRemove: Reaction[] = []

          for (const reaction of reactions) {
            if ((reaction.f & DESTROYED) !== 0) {
              toRemove.push(reaction)
              continue
            }

            // Mark reaction as dirty
            setSignalStatus(reaction, DIRTY)

            // Schedule effects for execution
            if ((reaction.f & EFFECT) !== 0 && (reaction.f & DERIVED) === 0) {
              scheduleEffect(reaction)
            }
          }

          // Clean up destroyed reactions
          for (const r of toRemove) {
            reactions.delete(r)
          }
        }
      }
    }

    prevValue = value
    initialized = true
  })

  // Return the selector function
  return (key: U): boolean => {
    // Get current value (this is untracked - we manage dependencies manually)
    const currentValue = prevValue!

    // Subscribe this key if we're in a reactive context
    if (activeReaction !== null) {
      const reaction = activeReaction

      // Skip if destroyed
      if ((reaction.f & DESTROYED) === 0) {
        // Get or create subscribers set for this key
        let keySubscribers = subscribers.get(key)
        if (!keySubscribers) {
          keySubscribers = new Set()
          subscribers.set(key, keySubscribers)
        }

        // Add this reaction as a subscriber
        if (!keySubscribers.has(reaction)) {
          keySubscribers.add(reaction)

          // Track which keys this reaction is subscribed to
          let keys = reactionKeys.get(reaction)
          if (!keys) {
            keys = new Set()
            reactionKeys.set(reaction, keys)
          }
          keys.add(key)
        }
      }
    }

    return fn(key, currentValue)
  }
}

/**
 * Cleanup helper - call this to manually clean up a selector's subscriptions.
 * Usually not needed as destroyed reactions are automatically filtered.
 */
export function cleanupSelector<T, U>(
  selector: SelectorFn<T, U>,
  subscribers: Map<U, Set<Reaction>>
): void {
  for (const [key, reactions] of subscribers) {
    for (const reaction of reactions) {
      if ((reaction.f & DESTROYED) !== 0) {
        reactions.delete(reaction)
      }
    }
    if (reactions.size === 0) {
      subscribers.delete(key)
    }
  }
}
