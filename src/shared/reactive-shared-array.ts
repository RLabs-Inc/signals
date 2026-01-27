// ============================================================================
// @rlabs-inc/signals - Reactive Shared Arrays
//
// Arrays backed by SharedArrayBuffer that integrate with the reactive system.
// Designed for zero-copy FFI bridge between TypeScript and native code (Rust).
//
// Key features:
// - Direct TypedArray views over SharedArrayBuffer (no copying)
// - Per-index dirty tracking for sparse updates
// - Atomics-based notification to wake native threads
// - Full integration with reactive tracking (get/set trigger subscriptions)
// ============================================================================

import type { Source, Equals } from '../core/types.js'
import { get, set, markReactions } from '../reactivity/tracking.js'
import { DIRTY } from '../core/constants.js'
import { incrementWriteVersion } from '../core/globals.js'

// =============================================================================
// SHARED BUFFER CONTEXT
// =============================================================================

/**
 * Context for a shared buffer - holds the buffer and notification mechanism.
 */
export interface SharedBufferContext {
  /** The SharedArrayBuffer backing all arrays */
  buffer: SharedArrayBuffer
  /** Dirty flags array (Uint8Array view) - one byte per index */
  dirtyFlags: Uint8Array
  /** Wake flag for Atomics.notify (Int32Array view, length 1) */
  wakeFlag: Int32Array
  /** Maximum number of elements */
  maxElements: number
}

/**
 * Create a shared buffer context with dirty tracking and wake notification.
 *
 * @param maxElements - Maximum number of elements to track
 * @param wakeFlagOffset - Byte offset for the wake flag in the buffer
 * @param dirtyFlagsOffset - Byte offset for dirty flags in the buffer
 * @returns SharedBufferContext
 */
export function createSharedBufferContext(
  buffer: SharedArrayBuffer,
  maxElements: number,
  wakeFlagOffset: number,
  dirtyFlagsOffset: number
): SharedBufferContext {
  return {
    buffer,
    dirtyFlags: new Uint8Array(buffer, dirtyFlagsOffset, maxElements),
    wakeFlag: new Int32Array(buffer, wakeFlagOffset, 1),
    maxElements,
  }
}

// =============================================================================
// NOTIFICATION
// =============================================================================

// Batched notification state
let notifyPending = false
let pendingWakeFlag: Int32Array | null = null

/**
 * Notify the native side that changes are pending.
 * Uses Atomics.notify to wake any thread waiting on this memory location.
 */
export function notifyNative(wakeFlag: Int32Array): void {
  Atomics.store(wakeFlag, 0, 1)
  Atomics.notify(wakeFlag, 0)
}

/**
 * Schedule notification for the next microtask.
 * Multiple synchronous writes will batch into a single notification.
 */
export function scheduleNotify(wakeFlag: Int32Array): void {
  pendingWakeFlag = wakeFlag
  if (!notifyPending) {
    notifyPending = true
    queueMicrotask(() => {
      notifyPending = false
      if (pendingWakeFlag !== null) {
        notifyNative(pendingWakeFlag)
        pendingWakeFlag = null
      }
    })
  }
}

// =============================================================================
// REACTIVE SHARED ARRAY BASE
// =============================================================================

/**
 * Options for creating a ReactiveSharedArray.
 */
export interface ReactiveSharedArrayOptions {
  /** The SharedArrayBuffer backing this array */
  buffer: SharedArrayBuffer
  /** Byte offset into the buffer */
  byteOffset: number
  /** Number of elements */
  length: number
  /** The dirty flags array (from context) */
  dirtyFlags: Uint8Array
  /** The wake flag for notification (from context) */
  wakeFlag: Int32Array
  /** Whether to auto-notify on every write (default: true) */
  autoNotify?: boolean
}

/**
 * Internal source structure for reactive tracking.
 */
interface SharedArraySource<T> extends Source<T> {
  /** Version per index for fine-grained tracking */
  indexVersions: Uint32Array
}

// =============================================================================
// REACTIVE SHARED FLOAT32 ARRAY
// =============================================================================

/**
 * A reactive Float32Array backed by SharedArrayBuffer.
 *
 * Integrates with the signals reactive system:
 * - `get(index)` triggers dependency tracking
 * - `set(index, value)` marks dirty and notifies dependents
 *
 * Writes mark the index as dirty and optionally notify native code.
 */
export class ReactiveSharedFloat32Array {
  private readonly view: Float32Array
  private readonly dirtyFlags: Uint8Array
  private readonly wakeFlag: Int32Array
  private readonly autoNotify: boolean

  // Internal source for coarse-grained tracking (any index changed)
  private readonly source: SharedArraySource<Float32Array>

  // Per-index sources for fine-grained tracking
  private readonly indexSources: Map<number, Source<number>> = new Map()

  constructor(options: ReactiveSharedArrayOptions) {
    this.view = new Float32Array(
      options.buffer,
      options.byteOffset,
      options.length
    )
    this.dirtyFlags = options.dirtyFlags
    this.wakeFlag = options.wakeFlag
    this.autoNotify = options.autoNotify ?? true

    // Create coarse-grained source
    this.source = {
      f: 0,
      v: this.view,
      wv: 0,
      rv: 0,
      reactions: null,
      equals: () => false, // Always notify on any change
      indexVersions: new Uint32Array(options.length),
    }
  }

  /**
   * Get value at index with dependency tracking.
   */
  get(index: number): number {
    // Track coarse-grained dependency
    get(this.source)

    // Also track fine-grained if there's an index source
    const indexSource = this.indexSources.get(index)
    if (indexSource) {
      get(indexSource)
    }

    return this.view[index]
  }

  /**
   * Set value at index, mark dirty, and notify.
   */
  set(index: number, value: number): void {
    if (this.view[index] !== value) {
      this.view[index] = value
      this.dirtyFlags[index] = 1

      // Update versions
      this.source.wv = incrementWriteVersion()
      this.source.indexVersions[index]++

      // Mark coarse-grained reactions
      markReactions(this.source, DIRTY)

      // Mark fine-grained reactions if any
      const indexSource = this.indexSources.get(index)
      if (indexSource) {
        indexSource.wv = this.source.wv
        markReactions(indexSource, DIRTY)
      }

      if (this.autoNotify) {
        scheduleNotify(this.wakeFlag)
      }
    }
  }

  /**
   * Batch set multiple values, notify once.
   */
  setBatch(updates: Array<[index: number, value: number]>): void {
    let changed = false
    const wv = incrementWriteVersion()

    for (const [index, value] of updates) {
      if (this.view[index] !== value) {
        this.view[index] = value
        this.dirtyFlags[index] = 1
        this.source.indexVersions[index]++
        changed = true

        // Mark fine-grained reactions
        const indexSource = this.indexSources.get(index)
        if (indexSource) {
          indexSource.wv = wv
          markReactions(indexSource, DIRTY)
        }
      }
    }

    if (changed) {
      this.source.wv = wv
      markReactions(this.source, DIRTY)

      if (this.autoNotify) {
        scheduleNotify(this.wakeFlag)
      }
    }
  }

  /**
   * Get a source for fine-grained tracking of a specific index.
   * Deriveds can depend on just one index rather than the whole array.
   */
  getIndexSource(index: number): Source<number> {
    let source = this.indexSources.get(index)
    if (!source) {
      source = {
        f: 0,
        v: this.view[index],
        wv: 0,
        rv: 0,
        reactions: null,
        equals: Object.is,
      }
      this.indexSources.set(index, source)
    }
    return source
  }

  /**
   * Manual notification trigger.
   */
  notify(): void {
    notifyNative(this.wakeFlag)
  }

  /**
   * Direct access to underlying view (escape hatch).
   */
  get raw(): Float32Array {
    return this.view
  }

  get length(): number {
    return this.view.length
  }
}

// =============================================================================
// REACTIVE SHARED UINT8 ARRAY
// =============================================================================

/**
 * A reactive Uint8Array backed by SharedArrayBuffer.
 */
export class ReactiveSharedUint8Array {
  private readonly view: Uint8Array
  private readonly dirtyFlags: Uint8Array
  private readonly wakeFlag: Int32Array
  private readonly autoNotify: boolean
  private readonly source: SharedArraySource<Uint8Array>
  private readonly indexSources: Map<number, Source<number>> = new Map()

  constructor(options: ReactiveSharedArrayOptions) {
    this.view = new Uint8Array(
      options.buffer,
      options.byteOffset,
      options.length
    )
    this.dirtyFlags = options.dirtyFlags
    this.wakeFlag = options.wakeFlag
    this.autoNotify = options.autoNotify ?? true

    this.source = {
      f: 0,
      v: this.view,
      wv: 0,
      rv: 0,
      reactions: null,
      equals: () => false,
      indexVersions: new Uint32Array(options.length),
    }
  }

  get(index: number): number {
    get(this.source)
    const indexSource = this.indexSources.get(index)
    if (indexSource) get(indexSource)
    return this.view[index]
  }

  set(index: number, value: number): void {
    if (this.view[index] !== value) {
      this.view[index] = value
      this.dirtyFlags[index] = 1

      this.source.wv = incrementWriteVersion()
      this.source.indexVersions[index]++
      markReactions(this.source, DIRTY)

      const indexSource = this.indexSources.get(index)
      if (indexSource) {
        indexSource.wv = this.source.wv
        markReactions(indexSource, DIRTY)
      }

      if (this.autoNotify) {
        scheduleNotify(this.wakeFlag)
      }
    }
  }

  setBatch(updates: Array<[index: number, value: number]>): void {
    let changed = false
    const wv = incrementWriteVersion()

    for (const [index, value] of updates) {
      if (this.view[index] !== value) {
        this.view[index] = value
        this.dirtyFlags[index] = 1
        this.source.indexVersions[index]++
        changed = true

        const indexSource = this.indexSources.get(index)
        if (indexSource) {
          indexSource.wv = wv
          markReactions(indexSource, DIRTY)
        }
      }
    }

    if (changed) {
      this.source.wv = wv
      markReactions(this.source, DIRTY)
      if (this.autoNotify) scheduleNotify(this.wakeFlag)
    }
  }

  getIndexSource(index: number): Source<number> {
    let source = this.indexSources.get(index)
    if (!source) {
      source = {
        f: 0,
        v: this.view[index],
        wv: 0,
        rv: 0,
        reactions: null,
        equals: Object.is,
      }
      this.indexSources.set(index, source)
    }
    return source
  }

  notify(): void {
    notifyNative(this.wakeFlag)
  }

  get raw(): Uint8Array {
    return this.view
  }

  get length(): number {
    return this.view.length
  }
}

// =============================================================================
// REACTIVE SHARED INT32 ARRAY
// =============================================================================

/**
 * A reactive Int32Array backed by SharedArrayBuffer.
 */
export class ReactiveSharedInt32Array {
  private readonly view: Int32Array
  private readonly dirtyFlags: Uint8Array
  private readonly wakeFlag: Int32Array
  private readonly autoNotify: boolean
  private readonly source: SharedArraySource<Int32Array>
  private readonly indexSources: Map<number, Source<number>> = new Map()

  constructor(options: ReactiveSharedArrayOptions) {
    this.view = new Int32Array(
      options.buffer,
      options.byteOffset,
      options.length
    )
    this.dirtyFlags = options.dirtyFlags
    this.wakeFlag = options.wakeFlag
    this.autoNotify = options.autoNotify ?? true

    this.source = {
      f: 0,
      v: this.view,
      wv: 0,
      rv: 0,
      reactions: null,
      equals: () => false,
      indexVersions: new Uint32Array(options.length),
    }
  }

  get(index: number): number {
    get(this.source)
    const indexSource = this.indexSources.get(index)
    if (indexSource) get(indexSource)
    return this.view[index]
  }

  set(index: number, value: number): void {
    if (this.view[index] !== value) {
      this.view[index] = value
      this.dirtyFlags[index] = 1

      this.source.wv = incrementWriteVersion()
      this.source.indexVersions[index]++
      markReactions(this.source, DIRTY)

      const indexSource = this.indexSources.get(index)
      if (indexSource) {
        indexSource.wv = this.source.wv
        markReactions(indexSource, DIRTY)
      }

      if (this.autoNotify) {
        scheduleNotify(this.wakeFlag)
      }
    }
  }

  setBatch(updates: Array<[index: number, value: number]>): void {
    let changed = false
    const wv = incrementWriteVersion()

    for (const [index, value] of updates) {
      if (this.view[index] !== value) {
        this.view[index] = value
        this.dirtyFlags[index] = 1
        this.source.indexVersions[index]++
        changed = true

        const indexSource = this.indexSources.get(index)
        if (indexSource) {
          indexSource.wv = wv
          markReactions(indexSource, DIRTY)
        }
      }
    }

    if (changed) {
      this.source.wv = wv
      markReactions(this.source, DIRTY)
      if (this.autoNotify) scheduleNotify(this.wakeFlag)
    }
  }

  getIndexSource(index: number): Source<number> {
    let source = this.indexSources.get(index)
    if (!source) {
      source = {
        f: 0,
        v: this.view[index],
        wv: 0,
        rv: 0,
        reactions: null,
        equals: Object.is,
      }
      this.indexSources.set(index, source)
    }
    return source
  }

  notify(): void {
    notifyNative(this.wakeFlag)
  }

  get raw(): Int32Array {
    return this.view
  }

  get length(): number {
    return this.view.length
  }
}

// =============================================================================
// REACTIVE SHARED UINT32 ARRAY
// =============================================================================

/**
 * A reactive Uint32Array backed by SharedArrayBuffer.
 */
export class ReactiveSharedUint32Array {
  private readonly view: Uint32Array
  private readonly dirtyFlags: Uint8Array
  private readonly wakeFlag: Int32Array
  private readonly autoNotify: boolean
  private readonly source: SharedArraySource<Uint32Array>
  private readonly indexSources: Map<number, Source<number>> = new Map()

  constructor(options: ReactiveSharedArrayOptions) {
    this.view = new Uint32Array(
      options.buffer,
      options.byteOffset,
      options.length
    )
    this.dirtyFlags = options.dirtyFlags
    this.wakeFlag = options.wakeFlag
    this.autoNotify = options.autoNotify ?? true

    this.source = {
      f: 0,
      v: this.view,
      wv: 0,
      rv: 0,
      reactions: null,
      equals: () => false,
      indexVersions: new Uint32Array(options.length),
    }
  }

  get(index: number): number {
    get(this.source)
    const indexSource = this.indexSources.get(index)
    if (indexSource) get(indexSource)
    return this.view[index]
  }

  set(index: number, value: number): void {
    if (this.view[index] !== value) {
      this.view[index] = value
      this.dirtyFlags[index] = 1

      this.source.wv = incrementWriteVersion()
      this.source.indexVersions[index]++
      markReactions(this.source, DIRTY)

      const indexSource = this.indexSources.get(index)
      if (indexSource) {
        indexSource.wv = this.source.wv
        markReactions(indexSource, DIRTY)
      }

      if (this.autoNotify) {
        scheduleNotify(this.wakeFlag)
      }
    }
  }

  setBatch(updates: Array<[index: number, value: number]>): void {
    let changed = false
    const wv = incrementWriteVersion()

    for (const [index, value] of updates) {
      if (this.view[index] !== value) {
        this.view[index] = value
        this.dirtyFlags[index] = 1
        this.source.indexVersions[index]++
        changed = true

        const indexSource = this.indexSources.get(index)
        if (indexSource) {
          indexSource.wv = wv
          markReactions(indexSource, DIRTY)
        }
      }
    }

    if (changed) {
      this.source.wv = wv
      markReactions(this.source, DIRTY)
      if (this.autoNotify) scheduleNotify(this.wakeFlag)
    }
  }

  getIndexSource(index: number): Source<number> {
    let source = this.indexSources.get(index)
    if (!source) {
      source = {
        f: 0,
        v: this.view[index],
        wv: 0,
        rv: 0,
        reactions: null,
        equals: Object.is,
      }
      this.indexSources.set(index, source)
    }
    return source
  }

  notify(): void {
    notifyNative(this.wakeFlag)
  }

  get raw(): Uint32Array {
    return this.view
  }

  get length(): number {
    return this.view.length
  }
}
