// ============================================================================
// @rlabs-inc/signals - Reactive Slot
//
// A Slot is a reactive cell that can point to different sources.
// Unlike bind(), a Slot is STABLE - you mutate its source, not replace it.
//
// This solves the "binding replacement" problem where deriveds track
// the binding object itself, missing updates when it's replaced.
//
// Think of it as "bind() on steroids" with bulletproof tracking.
// ============================================================================

import type { Source, WritableSignal, ReadableSignal, Equals } from '../core/types.js'
import { SLOT_SYMBOL } from '../core/constants.js'
import { signal, getSource } from './signal.js'
import { get, set, markReactions, disconnectSource } from '../reactivity/tracking.js'
import { DIRTY } from '../core/constants.js'

// =============================================================================
// SOURCE TYPE CONSTANTS
// =============================================================================

const SOURCE_STATIC = 0   // Holds a static value
const SOURCE_SIGNAL = 1   // Points to a signal/source
const SOURCE_GETTER = 2   // Points to a getter function

// =============================================================================
// SLOT INTERFACE
// =============================================================================

/**
 * A Slot is a reactive cell that can hold any value or point to a reactive source.
 *
 * Key features:
 * - Stable identity (never replaced, only mutated)
 * - Tracks BOTH the slot version AND underlying source
 * - Supports two-way binding (read and write through)
 * - Memory efficient (~80 bytes per slot)
 *
 * @example
 * ```ts
 * const mySlot = slot<string>('initial')
 *
 * // Static value
 * mySlot.source = 'hello'
 *
 * // Point to a signal
 * const name = signal('world')
 * mySlot.source = name
 * console.log(mySlot.value)  // 'world'
 *
 * // Write through to signal
 * mySlot.value = 'universe'
 * console.log(name.value)    // 'universe'
 *
 * // Point to a getter (read-only, auto-tracks)
 * const count = signal(5)
 * mySlot.source = () => `Count: ${count.value}`
 * ```
 */
export interface Slot<T> {
  /** Symbol marker for slot identification */
  readonly [SLOT_SYMBOL]: true

  /** Read the current value - auto-unwraps, auto-tracks all dependencies */
  readonly value: T

  /** Set what this slot points to (static value, signal, or getter) */
  source: T | WritableSignal<T> | ReadableSignal<T> | (() => T)

  /** Write a value - writes through if pointing to writable source */
  set(value: T): void

  /** Read without tracking (peek) */
  peek(): T
}

/**
 * Internal slot structure - extends Source for direct tracking
 */
interface SlotInternal<T> extends Source<T> {
  /** Source type: 0=static, 1=signal, 2=getter */
  st: 0 | 1 | 2
  /** Source reference: null | Source | Function */
  sr: Source<T> | (() => T) | null
}

// =============================================================================
// SLOT CREATION
// =============================================================================

/**
 * Check if a value is a signal (has .value accessor)
 */
function isSignalLike<T>(value: unknown): value is WritableSignal<T> | ReadableSignal<T> {
  return value !== null && typeof value === 'object' && 'value' in value
}

/**
 * Check if a value is a slot
 */
export function isSlot(value: unknown): value is Slot<unknown> {
  return value !== null && typeof value === 'object' && SLOT_SYMBOL in value
}

/**
 * Create a reactive slot.
 *
 * A Slot is a stable reactive cell that can point to different sources:
 * - Static values (primitives or objects)
 * - Signals (one-way or two-way binding)
 * - Getter functions (computed, auto-tracks)
 *
 * When you read `slot.value`:
 * 1. Tracks the slot itself (notified when source changes)
 * 2. Tracks through to the underlying source (notified when value changes)
 *
 * This ensures deriveds ALWAYS get notified, solving the bind() tracking bug.
 *
 * @param initial - Optional initial value
 * @returns A new Slot
 *
 * @example
 * ```ts
 * // Create with static value
 * const text = slot('hello')
 *
 * // Create empty, set source later
 * const input = slot<string>()
 * input.source = userSignal
 * ```
 */
export function slot<T>(initial?: T): Slot<T> {
  // Create the internal source for version tracking
  // This is what deriveds track when they read from the slot
  const internalSource: SlotInternal<T> = {
    f: 0,                           // flags
    v: initial as T,                // value (for static)
    wv: 0,                          // write version
    rv: 0,                          // read version
    reactions: null,                // dependents
    equals: Object.is as Equals<T>, // equality check
    st: SOURCE_STATIC,              // source type
    sr: null,                       // source reference
  }

  const slotObj: Slot<T> = {
    [SLOT_SYMBOL]: true,

    get value(): T {
      // Track the slot itself
      get(internalSource)

      // Read from appropriate source
      switch (internalSource.st) {
        case SOURCE_STATIC:
          return internalSource.v

        case SOURCE_SIGNAL:
          // Read through to signal - this creates dependency on the signal too!
          return get(internalSource.sr as Source<T>)

        case SOURCE_GETTER:
          // Call getter - dependencies tracked inside the getter
          return (internalSource.sr as () => T)()

        default:
          return internalSource.v
      }
    },

    set source(src: T | WritableSignal<T> | ReadableSignal<T> | (() => T)) {
      // Determine source type and store reference
      if (typeof src === 'function') {
        // Getter function
        internalSource.st = SOURCE_GETTER
        internalSource.sr = src as () => T
      } else if (isSignalLike<T>(src)) {
        // Signal - get its internal source if possible
        const srcSource = getSource(src as WritableSignal<T>)
        if (srcSource) {
          internalSource.st = SOURCE_SIGNAL
          internalSource.sr = srcSource
        } else {
          // Fallback: wrap in getter
          internalSource.st = SOURCE_GETTER
          internalSource.sr = () => (src as ReadableSignal<T>).value
        }
      } else if (isSlot(src)) {
        // Another slot - chain to it
        const otherSlot = src as Slot<T>
        internalSource.st = SOURCE_GETTER
        internalSource.sr = () => otherSlot.value
      } else {
        // Static value
        internalSource.st = SOURCE_STATIC
        internalSource.v = src as T
        internalSource.sr = null
      }

      // Notify all dependents that the slot's source changed
      // This is the key! Even if value is same, source changed.
      internalSource.wv++
      markReactions(internalSource, DIRTY)
    },

    set(value: T): void {
      switch (internalSource.st) {
        case SOURCE_STATIC:
          // Update static value
          if (!Object.is(internalSource.v, value)) {
            internalSource.v = value
            internalSource.wv++
            markReactions(internalSource, DIRTY)
          }
          break

        case SOURCE_SIGNAL:
          // Write through to signal
          set(internalSource.sr as Source<T>, value)
          break

        case SOURCE_GETTER:
          // Can't write to getter - throw helpful error
          throw new Error(
            'Cannot write to a slot pointing to a getter function. ' +
            'Use a signal for two-way binding.'
          )
      }
    },

    peek(): T {
      // Read without tracking
      switch (internalSource.st) {
        case SOURCE_STATIC:
          return internalSource.v
        case SOURCE_SIGNAL:
          return (internalSource.sr as Source<T>).v
        case SOURCE_GETTER:
          return (internalSource.sr as () => T)()
        default:
          return internalSource.v
      }
    },
  }

  return slotObj as Slot<T>
}

// =============================================================================
// SLOT ARRAY
// =============================================================================

/**
 * A SlotArray is an array of slots with convenient access patterns.
 *
 * Features:
 * - Auto-expands when accessing indices
 * - `array[i]` reads value (auto-unwraps, auto-tracks)
 * - `array.setSource(i, src)` sets what slot i points to
 * - `array.setValue(i, val)` writes through to slot i's source
 * - `array.slot(i)` gets the raw slot for advanced use
 */
export interface SlotArray<T> {
  /** Read value at index (auto-unwraps, auto-tracks) */
  readonly [index: number]: T

  /** Number of slots */
  readonly length: number

  /** Set what slot at index points to */
  setSource(index: number, source: T | WritableSignal<T> | ReadableSignal<T> | (() => T)): void

  /** Write value through to slot at index */
  setValue(index: number, value: T): void

  /** Get the raw slot at index */
  slot(index: number): Slot<T>

  /** Ensure capacity for at least n slots */
  ensureCapacity(n: number): void

  /** Clear slot at index (reset to default) */
  clear(index: number): void

  /** Disconnect slot at index from reactive graph */
  disconnect(index: number): void
}

/**
 * Create a reactive slot array.
 *
 * A SlotArray provides array-like access to slots with automatic
 * expansion and convenient methods for setting sources and values.
 *
 * @param defaultValue - Default value for new slots
 * @returns A new SlotArray
 *
 * @example
 * ```ts
 * const textContent = slotArray<string>('')
 *
 * // Set source (component setup)
 * textContent.setSource(0, props.content)
 *
 * // Read value (pipeline)
 * const content = textContent[0]  // Auto-unwraps, auto-tracks!
 *
 * // Write value (input handler)
 * textContent.setValue(0, 'new text')
 *
 * // Get raw slot for advanced use
 * const rawSlot = textContent.slot(0)
 * ```
 */
export function slotArray<T>(defaultValue?: T): SlotArray<T> {
  const slots: Slot<T>[] = []

  const ensureCapacity = (index: number): void => {
    while (slots.length <= index) {
      slots.push(slot(defaultValue))
    }
  }

  // Create proxy for array-like access
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
          }

        case 'setValue':
          return (index: number, value: T) => {
            ensureCapacity(index)
            slots[index].set(value)
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
            // Slots don't need explicit disconnect - they're stable.
            // Just clear to default.
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
      // Return numeric indices + named properties
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

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if a SlotArray has a slot at the given index
 */
export function hasSlot<T>(array: SlotArray<T>, index: number): boolean {
  return index in array && index < array.length
}
