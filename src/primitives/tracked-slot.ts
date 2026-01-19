// ============================================================================
// @rlabs-inc/signals - TrackedSlotArray
// A SlotArray variant that tracks writes via ReactiveSet
// ============================================================================

import { slot, type Slot, type SlotArray } from './slot.js'
import { ReactiveSet } from '../collections/set.js'
import { SLOT_SYMBOL } from '../core/constants.js'
import type { WritableSignal, ReadableSignal } from '../core/types.js'

/**
 * A SlotArray that automatically tracks which indices have been written to.
 * 
 * When setSource() or setValue() is called, the index is automatically
 * added to the provided ReactiveSet. This enables incremental computation
 * patterns where deriveds can check the dirty set to skip unchanged work.
 * 
 * @param defaultValue - Default value for new slots
 * @param dirtySet - ReactiveSet that will track dirty indices
 * @returns Enhanced SlotArray with dirty tracking
 * 
 * @example
 * ```ts
 * import { trackedSlotArray, ReactiveSet, derived } from '@rlabs-inc/signals'
 * 
 * const dirtyIndices = new ReactiveSet<number>()
 * const values = trackedSlotArray(0, dirtyIndices)
 * 
 * // Setting a value marks it dirty
 * values.setSource(5, signal(42))  // dirtyIndices now has 5
 * 
 * // Check dirty set in derived
 * const result = derived(() => {
 *   const dirty = Array.from(dirtyIndices)
 *   
 *   if (dirty.length === 0) {
 *     return cachedResult  // O(1) skip!
 *   }
 *   
 *   // Process only dirty indices
 *   for (const idx of dirty) {
 *     processValue(values[idx])
 *   }
 *   
 *   dirtyIndices.clear()  // Clear for next frame
 *   return newResult
 * })
 * ```
 */
export function trackedSlotArray<T>(
  defaultValue: T,
  dirtySet: ReactiveSet<number>
): SlotArray<T> {
  const slots: Slot<T>[] = []

  const ensureCapacity = (index: number): void => {
    while (slots.length <= index) {
      slots.push(slot(defaultValue))
    }
  }

  // Create proxy - nearly identical to slotArray, but with dirty tracking
  const proxy = new Proxy({} as SlotArray<T>, {
    get(_, prop) {
      // Numeric index - read value
      if (typeof prop === 'string') {
        const index = Number(prop)
        if (!isNaN(index) && index >= 0) {
          ensureCapacity(index)
          return slots[index].value
        }
      }

      // Named properties
      switch (prop) {
        case 'length':
          return slots.length

        case 'setSource':
          return (index: number, source: T | WritableSignal<T> | ReadableSignal<T> | (() => T)) => {
            ensureCapacity(index)
            slots[index].source = source
            dirtySet.add(index)  // ← DIRTY TRACKING
          }

        case 'setValue':
          return (index: number, value: T) => {
            ensureCapacity(index)
            slots[index].set(value)
            dirtySet.add(index)  // ← DIRTY TRACKING
          }

        case 'slot':
          return (index: number) => {
            ensureCapacity(index)
            return slots[index]
          }

        case 'ensureCapacity':
          return ensureCapacity

        case 'clear':
          return (index: number) => {
            if (index < slots.length) {
              slots[index].source = defaultValue as T
            }
          }

        case 'disconnect':
          return (index: number) => {
            if (index < slots.length) {
              slots[index].source = defaultValue as T
            }
          }

        case SLOT_SYMBOL:
          return true

        default:
          return undefined
      }
    },

    set(_, prop, value) {
      // Numeric index - set source (convenient shorthand)
      if (typeof prop === 'string') {
        const index = Number(prop)
        if (!isNaN(index) && index >= 0) {
          ensureCapacity(index)
          slots[index].source = value
          dirtySet.add(index)  // ← DIRTY TRACKING
          return true
        }
      }
      return false
    },

    has(_, prop) {
      if (typeof prop === 'string') {
        const index = Number(prop)
        if (!isNaN(index) && index >= 0) {
          return index < slots.length
        }
      }
      return prop === 'length' || prop === 'setSource' || prop === 'setValue' ||
             prop === 'slot' || prop === 'ensureCapacity' || prop === 'clear' ||
             prop === 'disconnect' || prop === SLOT_SYMBOL
    },

    ownKeys() {
      const keys: (string | symbol)[] = []
      for (let i = 0; i < slots.length; i++) {
        keys.push(String(i))
      }
      keys.push('length', 'setSource', 'setValue', 'slot', 'ensureCapacity', 'clear', 'disconnect')
      return keys
    },

    getOwnPropertyDescriptor(_, prop) {
      if (typeof prop === 'string') {
        const index = Number(prop)
        if (!isNaN(index) && index >= 0 && index < slots.length) {
          return { configurable: true, enumerable: true, value: slots[index].value }
        }
      }
      if (prop === 'length') {
        return { configurable: true, enumerable: false, value: slots.length }
      }
      return undefined
    },
  })

  return proxy
}
