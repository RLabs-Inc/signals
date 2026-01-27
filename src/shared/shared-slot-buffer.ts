// ============================================================================
// @rlabs-inc/signals - SharedSlotBuffer
//
// Reactive typed arrays backed by shared memory. get() tracks dependencies,
// set() writes to shared memory + notifies reactive graph + notifies cross-side.
//
// This is Layer 1 of the Cross-Language Reactive Shared Memory architecture.
// No source binding here - the buffer is just a reactive read/write array.
// ============================================================================

import type { Source } from '../core/types.js'
import { get, markReactions, setSignalStatus } from '../reactivity/tracking.js'
import { DIRTY, CLEAN, SOURCE } from '../core/constants.js'
import { incrementWriteVersion } from '../core/globals.js'
import type { Notifier } from './notifier.js'

// =============================================================================
// TYPES
// =============================================================================

export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Uint8ClampedArray

export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | Uint8ClampedArrayConstructor

// =============================================================================
// SHARED SLOT BUFFER INTERFACE
// =============================================================================

export interface SharedSlotBuffer {
  /** Maximum number of elements */
  readonly capacity: number
  /** Direct access to underlying typed array (for FFI pointer passing) */
  readonly raw: TypedArray
  /** Reactive read - tracks dependency */
  get(index: number): number
  /** Non-reactive read */
  peek(index: number): number
  /** Write + markReactions + dirty flag + notify */
  set(index: number, value: number): void
  /** Batch write - single notification at end */
  setBatch(updates: [number, number][]): void
  /** Get fine-grained per-index source for tracking */
  getIndexSource(index: number): Source<number>
  /** Notify TS reactive graph that other side changed data */
  notifyChanged(): void
  /** Notify specific indices changed from other side */
  notifyIndicesChanged(indices: number[]): void
  /** Reset index to default value */
  clear(index: number): void
  /** Clean up */
  dispose(): void
}

// =============================================================================
// OPTIONS
// =============================================================================

export interface SharedSlotBufferOptions {
  /** External TypedArray view (fixed capacity, e.g., over SharedArrayBuffer) */
  buffer?: TypedArray
  /** OR: allocate internally with this constructor */
  type?: TypedArrayConstructor
  /** Capacity (required if type is provided, ignored if buffer is provided) */
  capacity?: number
  /** Default value for clear() */
  defaultValue?: number
  /** Cross-side notifier */
  notifier?: Notifier
  /** Per-index dirty flags (external, e.g., from SharedArrayBuffer) */
  dirtyFlags?: Uint8Array
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a reactive typed array backed by shared memory.
 *
 * The buffer is "just" a reactive read/write array - no source binding.
 * Use `repeat()` from the repeater module to wire signals to buffer positions.
 */
export function sharedSlotBuffer(options: SharedSlotBufferOptions): SharedSlotBuffer {
  // Resolve the backing buffer
  let buffer: TypedArray
  if (options.buffer) {
    buffer = options.buffer
  } else if (options.type && options.capacity != null) {
    buffer = new options.type(options.capacity)
  } else {
    throw new Error('sharedSlotBuffer: provide either buffer or type+capacity')
  }

  const capacity = buffer.length
  const defaultValue = options.defaultValue ?? 0
  const notifier = options.notifier ?? null
  const dirtyFlags = options.dirtyFlags ?? null

  // Coarse-grained source: any index changed
  const source: Source<number> = {
    f: SOURCE | CLEAN,
    v: 0,
    wv: 0,
    rv: 0,
    reactions: null,
    equals: () => false, // always propagate
  }

  // Fine-grained per-index sources (lazily created)
  const indexSources = new Map<number, Source<number>>()

  // Internal set (used by both set() and repeater forwarding)
  function _set(index: number, value: number): void {
    if (buffer[index] === value) return // equality check

    buffer[index] = value

    // Mark dirty flag if available
    if (dirtyFlags) dirtyFlags[index] = 1

    // Update coarse-grained source
    source.wv = incrementWriteVersion()
    markReactions(source, DIRTY)

    // Update fine-grained source if it exists
    const idx = indexSources.get(index)
    if (idx) {
      idx.v = value
      idx.wv = source.wv
      markReactions(idx, DIRTY)
    }

    // Notify cross-side
    notifier?.notify()
  }

  return {
    get capacity() {
      return capacity
    },

    get raw() {
      return buffer
    },

    get(index: number): number {
      // Track coarse-grained dependency
      get(source)
      // Track fine-grained if source exists
      const idx = indexSources.get(index)
      if (idx) get(idx)
      return buffer[index]
    },

    peek(index: number): number {
      return buffer[index]
    },

    set: _set,

    setBatch(updates: [number, number][]): void {
      let changed = false
      const wv = incrementWriteVersion()

      for (let i = 0; i < updates.length; i++) {
        const [index, value] = updates[i]
        if (buffer[index] !== value) {
          buffer[index] = value
          if (dirtyFlags) dirtyFlags[index] = 1
          changed = true

          // Fine-grained notification
          const idx = indexSources.get(index)
          if (idx) {
            idx.v = value
            idx.wv = wv
            markReactions(idx, DIRTY)
          }
        }
      }

      if (changed) {
        source.wv = wv
        markReactions(source, DIRTY)
        notifier?.notify()
      }
    },

    getIndexSource(index: number): Source<number> {
      let src = indexSources.get(index)
      if (!src) {
        src = {
          f: SOURCE | CLEAN,
          v: buffer[index],
          wv: 0,
          rv: 0,
          reactions: null,
          equals: Object.is,
        }
        indexSources.set(index, src)
      }
      return src
    },

    notifyChanged(): void {
      source.wv = incrementWriteVersion()
      markReactions(source, DIRTY)
    },

    notifyIndicesChanged(indices: number[]): void {
      const wv = incrementWriteVersion()
      for (let i = 0; i < indices.length; i++) {
        const idx = indexSources.get(indices[i])
        if (idx) {
          idx.v = buffer[indices[i]]
          idx.wv = wv
          markReactions(idx, DIRTY)
        }
      }
      source.wv = wv
      markReactions(source, DIRTY)
    },

    clear(index: number): void {
      _set(index, defaultValue)
    },

    dispose(): void {
      source.reactions = null
      indexSources.forEach(src => { src.reactions = null })
      indexSources.clear()
    },
  }
}

// =============================================================================
// GROUP FACTORY
// =============================================================================

export type SharedSlotBufferGroupConfig = Record<string, {
  type: TypedArrayConstructor
  capacity: number
  defaultValue?: number
}>

/**
 * Create multiple SharedSlotBuffers sharing a single notifier and dirty flags.
 */
export function sharedSlotBufferGroup<T extends SharedSlotBufferGroupConfig>(
  config: T,
  options?: { notifier?: Notifier; dirtyFlags?: Uint8Array }
): { arrays: { [K in keyof T]: SharedSlotBuffer }; dispose(): void } {
  const notifier = options?.notifier
  const dirtyFlags = options?.dirtyFlags
  const arrays = {} as { [K in keyof T]: SharedSlotBuffer }
  const buffers: SharedSlotBuffer[] = []

  for (const key in config) {
    const cfg = config[key]
    const buf = sharedSlotBuffer({
      type: cfg.type,
      capacity: cfg.capacity,
      defaultValue: cfg.defaultValue,
      notifier,
      dirtyFlags,
    })
    arrays[key as keyof T] = buf
    buffers.push(buf)
  }

  return {
    arrays,
    dispose(): void {
      for (let i = 0; i < buffers.length; i++) {
        buffers[i].dispose()
      }
    },
  }
}
