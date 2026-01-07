// ============================================================================
// @rlabs-inc/signals - Linked Signal (Angular's killer feature)
//
// A writable signal that ALSO resets based on a source signal.
// Perfect for UI state that should reset when parent data changes,
// but can also be manually overridden.
// ============================================================================

import type { WritableSignal, Equals } from '../core/types.js'
import { LINKED_SYMBOL } from '../core/constants.js'
import { signal } from './signal.js'
import { derived } from './derived.js'
import { effect } from './effect.js'
import { untrack } from '../reactivity/batching.js'
import { flushSync } from '../reactivity/scheduling.js'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for linkedSignal with explicit source and computation.
 */
export interface LinkedSignalOptions<S, D> {
  source: () => S
  computation: (source: S, previous?: { source: S; value: D }) => D
  equal?: Equals<D>
}

/**
 * Short form: just a function that computes the value.
 * The function itself is both source and computation.
 */
export type LinkedSignalShortForm<D> = () => D

/**
 * Configuration can be either short form or full options.
 */
export type LinkedSignalConfig<S, D> = LinkedSignalShortForm<D> | LinkedSignalOptions<S, D>

// =============================================================================
// LINKED SIGNAL CREATION
// =============================================================================

/**
 * Create a linked signal that derives from a source but can be manually overridden.
 * When the source changes, the linked signal resets to the computed value.
 *
 * @example Simple form (derives directly from source)
 * ```ts
 * const options = signal(['a', 'b', 'c'])
 * const selected = linkedSignal(() => options.value[0])
 *
 * console.log(selected.value) // 'a'
 * selected.value = 'b' // Manual override
 * console.log(selected.value) // 'b'
 *
 * options.value = ['x', 'y', 'z'] // Source changes
 * console.log(selected.value) // 'x' (reset to new first item)
 * ```
 *
 * @example Advanced form (with previous value tracking)
 * ```ts
 * const options = signal(['a', 'b', 'c'])
 * const selected = linkedSignal({
 *   source: () => options.value,
 *   computation: (opts, prev) => {
 *     // Keep selection if still valid
 *     if (prev && opts.includes(prev.value)) {
 *       return prev.value
 *     }
 *     return opts[0]
 *   }
 * })
 * ```
 *
 * @example Form input with reset
 * ```ts
 * const user = signal({ name: 'Alice' })
 * const editName = linkedSignal(() => user.value.name)
 *
 * // User types in input
 * editName.value = 'Bob'
 *
 * // When user data reloads, form resets
 * user.value = { name: 'Charlie' }
 * console.log(editName.value) // 'Charlie'
 * ```
 */
export function linkedSignal<D>(config: LinkedSignalShortForm<D>): WritableSignal<D>
export function linkedSignal<S, D>(config: LinkedSignalOptions<S, D>): WritableSignal<D>
export function linkedSignal<S, D>(
  config: LinkedSignalConfig<S, D>
): WritableSignal<D> {
  // Parse configuration
  let sourceFn: () => S
  let computation: (source: S, previous?: { source: S; value: D }) => D
  let equalsFn: Equals<D> = Object.is

  if (typeof config === 'function') {
    // Short form: the function is both source and computation
    const fn = config as () => D
    sourceFn = fn as unknown as () => S
    computation = (s: S) => s as unknown as D
  } else {
    // Long form with explicit source and computation
    sourceFn = config.source
    computation = config.computation
    if (config.equal) {
      equalsFn = config.equal
    }
  }

  // Track previous source and value for computation
  let prevSource: S | undefined = undefined
  let prevValue: D | undefined = undefined
  let initialized = false

  // The internal value signal (holds the current value)
  const valueSignal = signal<D>(undefined as D, { equals: equalsFn })

  // Track source changes with a derived
  // This creates a dependency on the source
  const sourceTracker = derived(() => {
    const newSource = sourceFn()
    return newSource
  })

  // Sync effect to update value when source changes
  // Uses effect.pre for synchronous updates
  let manualOverride = false
  let lastKnownSource: S | undefined = undefined

  const dispose = effect.pre(() => {
    const currentSource = sourceTracker.value

    // Check if source actually changed (not just a re-read)
    const sourceChanged = initialized && !Object.is(lastKnownSource, currentSource)

    if (!initialized || sourceChanged) {
      // Source changed or first init - recompute
      const previous = initialized
        ? { source: prevSource!, value: prevValue! }
        : undefined

      const newValue = computation(currentSource, previous)

      // Update tracking
      prevSource = currentSource
      prevValue = newValue
      lastKnownSource = currentSource
      initialized = true
      manualOverride = false

      // Update the value signal (without tracking to avoid loops)
      untrack(() => {
        valueSignal.value = newValue
      })
    }
  })

  // Create the accessor object with proper getter for peek
  const accessor = {
    [LINKED_SYMBOL]: true as const,

    get value(): D {
      // Read the source tracker to establish dependency
      sourceTracker.value

      // Check if source changed since last read
      const currentSource = untrack(() => sourceTracker.value)
      if (initialized && !Object.is(lastKnownSource, currentSource)) {
        // Source changed - trigger sync update
        flushSync()
      }

      return valueSignal.value
    },

    set value(newValue: D) {
      // Manual override - update value directly
      manualOverride = true
      prevValue = newValue
      valueSignal.value = newValue
    },

    get peek(): D {
      return untrack(() => valueSignal.value)
    },
  }

  return accessor as WritableSignal<D>
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if a value is a LinkedSignal.
 */
export function isLinkedSignal(value: unknown): value is WritableSignal<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    LINKED_SYMBOL in value
  )
}
