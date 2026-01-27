// ============================================================================
// @rlabs-inc/signals - TypedSlotArray
// A SlotArray variant backed by TypedArray for zero-copy FFI integration
// ============================================================================

import { signal } from './signal.js'
import { derived } from './derived.js'
import { ReactiveSet } from '../collections/set.js'
import type { WritableSignal, ReadableSignal, DerivedSignal } from '../core/types.js'

// =============================================================================
// TYPED ARRAY CONSTRUCTORS
// =============================================================================

export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor

export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array

type ArrayElementType<T extends TypedArrayConstructor> =
  T extends Float32ArrayConstructor ? number :
  T extends Float64ArrayConstructor ? number :
  T extends Int8ArrayConstructor ? number :
  T extends Int16ArrayConstructor ? number :
  T extends Int32ArrayConstructor ? number :
  T extends Uint8ArrayConstructor ? number :
  T extends Uint16ArrayConstructor ? number :
  T extends Uint32ArrayConstructor ? number :
  never

type ArrayInstanceType<T extends TypedArrayConstructor> =
  T extends Float32ArrayConstructor ? Float32Array :
  T extends Float64ArrayConstructor ? Float64Array :
  T extends Int8ArrayConstructor ? Int8Array :
  T extends Int16ArrayConstructor ? Int16Array :
  T extends Int32ArrayConstructor ? Int32Array :
  T extends Uint8ArrayConstructor ? Uint8Array :
  T extends Uint16ArrayConstructor ? Uint16Array :
  T extends Uint32ArrayConstructor ? Uint32Array :
  never

// =============================================================================
// TYPED SLOT ARRAY INTERFACE
// =============================================================================

/**
 * A reactive array backed by a TypedArray for zero-copy FFI integration.
 *
 * Combines:
 * - TypedArray backing (Float32Array, Int32Array, etc.) for FFI compatibility
 * - Per-index reactive tracking via internal signals
 * - Dirty tracking via ReactiveSet for incremental updates
 *
 * The `buffer` property provides direct access to the TypedArray
 * for passing to FFI calls via `ptr()`.
 *
 * @example
 * ```ts
 * import { typedSlotArray, ReactiveSet } from '@rlabs-inc/signals'
 * import { ptr } from 'bun:ffi'
 *
 * const dirtySet = new ReactiveSet<number>()
 * const widths = typedSlotArray(Float32Array, 1024, dirtySet)
 *
 * // Bind a signal to an index
 * widths.setSource(5, myWidthSignal)
 *
 * // Read value (reactive)
 * const w = widths.get(5)  // Tracks dependency!
 *
 * // Direct buffer access for FFI
 * nativeCall(ptr(widths.buffer))
 *
 * // Sync reactive sources to buffer before FFI call
 * widths.sync()
 * ```
 */
export interface TypedSlotArray<T extends TypedArrayConstructor> {
  /** The underlying TypedArray - pass to FFI via ptr() */
  readonly buffer: ArrayInstanceType<T>

  /** Current capacity */
  readonly capacity: number

  /** Number of active indices */
  readonly length: number

  /** The dirty set tracking which indices changed */
  readonly dirtySet: ReactiveSet<number>

  /**
   * Get value at index (reactive - creates dependency).
   * Reads from internal signal if bound, otherwise from buffer.
   */
  get(index: number): number

  /**
   * Peek value at index (non-reactive - no dependency tracking).
   * Reads directly from buffer.
   */
  peek(index: number): number

  /**
   * Set a static value at index.
   * Writes directly to buffer and marks dirty.
   */
  set(index: number, value: number): void

  /**
   * Bind a reactive source to an index.
   * When the source changes, the buffer will be updated on next sync().
   */
  setSource(index: number, source: number | WritableSignal<number> | ReadableSignal<number> | (() => number)): void

  /**
   * Get the derived signal for an index (for reading reactively).
   * Creates one if it doesn't exist.
   */
  getSignal(index: number): DerivedSignal<number>

  /**
   * Sync all bound reactive sources to the buffer.
   * Call this before passing buffer to FFI.
   * Only syncs dirty indices for efficiency.
   */
  sync(): void

  /**
   * Sync and return dirty indices.
   * Clears the dirty set after returning.
   */
  syncAndGetDirty(): number[]

  /**
   * Ensure capacity for at least n indices.
   * May reallocate the buffer (invalidates FFI pointers!).
   */
  ensureCapacity(n: number): void

  /**
   * Clear the dirty set.
   */
  clearDirty(): void

  /**
   * Mark an index as dirty.
   */
  markDirty(index: number): void

  /**
   * Check if an index has a bound source.
   */
  hasBoundSource(index: number): boolean

  /**
   * Unbind the source at index (reverts to static value).
   */
  unbind(index: number): void

  /**
   * Reset the array (clear all bindings, reset buffer to default).
   */
  reset(): void
}

// =============================================================================
// SOURCE BINDING
// =============================================================================

interface SourceBinding {
  /** The source signal or getter */
  source: WritableSignal<number> | ReadableSignal<number> | (() => number) | null
  /** Derived that reads the source and updates buffer */
  derived: DerivedSignal<number> | null
  /** Whether this is a getter (vs signal) */
  isGetter: boolean
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Create a reactive TypedArray with per-index binding support.
 *
 * @param ArrayType - The TypedArray constructor (Float32Array, Int32Array, etc.)
 * @param initialCapacity - Initial capacity (default 256)
 * @param dirtySet - ReactiveSet for dirty tracking (optional, created if not provided)
 * @param defaultValue - Default value for new slots (default 0)
 *
 * @example
 * ```ts
 * const dirtySet = new ReactiveSet<number>()
 *
 * // Layout properties as typed arrays
 * const widths = typedSlotArray(Float32Array, 1024, dirtySet)
 * const heights = typedSlotArray(Float32Array, 1024, dirtySet)
 * const flexDirs = typedSlotArray(Uint8Array, 1024, dirtySet)
 *
 * // Bind component props
 * widths.setSource(componentIndex, props.width)
 * heights.setSource(componentIndex, props.height)
 * flexDirs.set(componentIndex, FLEX_DIRECTION_ROW)
 *
 * // Before FFI call
 * widths.sync()
 * heights.sync()
 *
 * // Pass to native
 * nativeLayout(ptr(widths.buffer), ptr(heights.buffer), ...)
 * ```
 */
export function typedSlotArray<T extends TypedArrayConstructor>(
  ArrayType: T,
  initialCapacity: number = 256,
  dirtySet?: ReactiveSet<number>,
  defaultValue: number = 0
): TypedSlotArray<T> {
  // Create the underlying buffer
  let buffer = new ArrayType(initialCapacity) as ArrayInstanceType<T>
  if (defaultValue !== 0) {
    buffer.fill(defaultValue)
  }

  // Dirty tracking
  const dirty = dirtySet ?? new ReactiveSet<number>()

  // Per-index source bindings (sparse - only for bound indices)
  const bindings = new Map<number, SourceBinding>()

  // Per-index read signals (sparse - created on demand for reactive reads)
  const readSignals = new Map<number, WritableSignal<number>>()

  // Track highest used index for length
  let maxIndex = -1

  const ensureCapacity = (index: number): void => {
    if (index >= buffer.length) {
      // Grow by 2x or to fit index, whichever is larger
      const newCapacity = Math.max(buffer.length * 2, index + 1)
      const newBuffer = new ArrayType(newCapacity) as ArrayInstanceType<T>
      newBuffer.set(buffer)
      if (defaultValue !== 0) {
        newBuffer.fill(defaultValue, buffer.length)
      }
      buffer = newBuffer
    }
    if (index > maxIndex) {
      maxIndex = index
    }
  }

  const getOrCreateReadSignal = (index: number): WritableSignal<number> => {
    let sig = readSignals.get(index)
    if (!sig) {
      sig = signal(buffer[index] ?? defaultValue)
      readSignals.set(index, sig)
    }
    return sig
  }

  const updateReadSignal = (index: number, value: number): void => {
    const sig = readSignals.get(index)
    if (sig) {
      sig.value = value
    }
  }

  const result: TypedSlotArray<T> = {
    get buffer() {
      return buffer
    },

    get capacity() {
      return buffer.length
    },

    get length() {
      return maxIndex + 1
    },

    get dirtySet() {
      return dirty
    },

    get(index: number): number {
      ensureCapacity(index)
      // Create/use read signal for reactive tracking
      const sig = getOrCreateReadSignal(index)
      return sig.value
    },

    peek(index: number): number {
      if (index >= buffer.length) return defaultValue
      return buffer[index]
    },

    set(index: number, value: number): void {
      ensureCapacity(index)
      buffer[index] = value
      dirty.add(index)
      updateReadSignal(index, value)
    },

    setSource(
      index: number,
      source: number | WritableSignal<number> | ReadableSignal<number> | (() => number)
    ): void {
      ensureCapacity(index)

      // Clean up existing binding
      const existing = bindings.get(index)
      if (existing?.derived) {
        // TODO: Dispose derived when we have that API
      }

      // Static value - just set directly
      if (typeof source === 'number') {
        buffer[index] = source
        dirty.add(index)
        updateReadSignal(index, source)
        bindings.delete(index)
        return
      }

      // Getter or signal
      const isGetter = typeof source === 'function'
      const getValue = isGetter
        ? source as () => number
        : () => (source as ReadableSignal<number>).value

      // Create derived that syncs to buffer when source changes
      const syncDerived = derived(() => {
        const val = getValue()
        buffer[index] = val
        dirty.add(index)
        updateReadSignal(index, val)
        return val
      })

      bindings.set(index, {
        source: isGetter ? null : source as WritableSignal<number> | ReadableSignal<number>,
        derived: syncDerived,
        isGetter,
      })

      // Trigger initial sync
      const initialValue = syncDerived.value
      buffer[index] = initialValue
      dirty.add(index)
      updateReadSignal(index, initialValue)
    },

    getSignal(index: number): DerivedSignal<number> {
      ensureCapacity(index)
      const sig = getOrCreateReadSignal(index)
      // Wrap in derived for consistent return type
      return derived(() => sig.value)
    },

    sync(): void {
      // Trigger all bound deriveds to update
      for (const [, binding] of bindings) {
        if (binding.derived) {
          // Reading .value triggers the derived to update if dirty
          void binding.derived.value
        }
      }
    },

    syncAndGetDirty(): number[] {
      this.sync()
      const indices = Array.from(dirty)
      dirty.clear()
      return indices
    },

    ensureCapacity(n: number): void {
      ensureCapacity(n - 1)
    },

    clearDirty(): void {
      dirty.clear()
    },

    markDirty(index: number): void {
      dirty.add(index)
    },

    hasBoundSource(index: number): boolean {
      return bindings.has(index)
    },

    unbind(index: number): void {
      const existing = bindings.get(index)
      if (existing?.derived) {
        // TODO: Dispose derived
      }
      bindings.delete(index)
    },

    reset(): void {
      // Clear all bindings
      bindings.clear()
      readSignals.clear()
      dirty.clear()
      maxIndex = -1
      buffer.fill(defaultValue)
    },
  }

  return result
}

// =============================================================================
// ARRAY GROUP - Multiple typed arrays sharing dirty tracking
// =============================================================================

/**
 * Configuration for a typed array in a group.
 */
export interface TypedArrayConfig<T extends TypedArrayConstructor = TypedArrayConstructor> {
  type: T
  defaultValue?: number
}

/**
 * A group of TypedSlotArrays that share dirty tracking.
 * Useful for ECS-style parallel arrays where each array is a different component.
 *
 * @example
 * ```ts
 * const layout = typedSlotArrayGroup({
 *   width: { type: Float32Array, defaultValue: 0 },
 *   height: { type: Float32Array, defaultValue: 0 },
 *   x: { type: Float32Array, defaultValue: 0 },
 *   y: { type: Float32Array, defaultValue: 0 },
 *   flexDirection: { type: Uint8Array, defaultValue: 0 },
 *   visible: { type: Uint8Array, defaultValue: 1 },
 * }, 1024)
 *
 * // All arrays share the same dirty set
 * layout.arrays.width.set(5, 100)
 * layout.arrays.height.set(5, 50)
 *
 * // Sync all and get dirty indices once
 * const dirty = layout.syncAndGetDirty()
 * ```
 */
export interface TypedSlotArrayGroup<T extends Record<string, TypedArrayConfig>> {
  /** Individual typed arrays by name */
  arrays: { [K in keyof T]: TypedSlotArray<T[K]['type']> }

  /** Shared dirty set */
  dirtySet: ReactiveSet<number>

  /** Sync all arrays */
  sync(): void

  /** Sync all and return dirty indices (clears dirty set) */
  syncAndGetDirty(): number[]

  /** Ensure all arrays have capacity for n indices */
  ensureCapacity(n: number): void

  /** Reset all arrays */
  reset(): void
}

/**
 * Create a group of typed arrays sharing dirty tracking.
 */
export function typedSlotArrayGroup<T extends Record<string, TypedArrayConfig>>(
  config: T,
  initialCapacity: number = 256
): TypedSlotArrayGroup<T> {
  const dirtySet = new ReactiveSet<number>()

  const arrays = {} as { [K in keyof T]: TypedSlotArray<T[K]['type']> }

  for (const [name, cfg] of Object.entries(config)) {
    (arrays as Record<string, TypedSlotArray<TypedArrayConstructor>>)[name] = typedSlotArray(
      cfg.type,
      initialCapacity,
      dirtySet,
      cfg.defaultValue ?? 0
    )
  }

  return {
    arrays,
    dirtySet,

    sync(): void {
      for (const arr of Object.values(arrays)) {
        arr.sync()
      }
    },

    syncAndGetDirty(): number[] {
      this.sync()
      const indices = Array.from(dirtySet)
      dirtySet.clear()
      return indices
    },

    ensureCapacity(n: number): void {
      for (const arr of Object.values(arrays)) {
        arr.ensureCapacity(n)
      }
    },

    reset(): void {
      for (const arr of Object.values(arrays)) {
        arr.reset()
      }
    },
  }
}
