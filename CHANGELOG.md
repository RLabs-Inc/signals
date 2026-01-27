# Changelog

All notable changes to @rlabs-inc/signals will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.0] - 2026-01-27

### Added

- **`SharedSlotBuffer`** - Reactive typed arrays backed by shared memory (Layer 1)
  - `get(index)` tracks reactive dependencies automatically
  - `set(index, value)` writes to shared memory + marks reactions dirty + notifies cross-side
  - `peek(index)` for non-reactive reads
  - `setBatch(updates)` for bulk writes with single notification
  - Per-index fine-grained source via `getSource(index)`
  - Coarse-grained source via `source` (any-index-changed tracking)
  - Optional dirty flags for per-index change tracking
  - Factory: `sharedSlotBuffer()` and `sharedSlotBufferGroup()`

- **`Repeater`** - New reactive graph primitive (Layer 2)
  - NOT an effect, NOT a derived — a purpose-built forwarding node
  - Runs INLINE during `markReactions` — zero scheduling overhead
  - ~40-50 bytes per binding (vs ~200+ for Effect)
  - Connects any reactive source (signal/derived/getter) to a SharedSlotBuffer position
  - `repeat(source, target, index)` — binds source to buffer position
  - `forwardRepeater(reaction)` — called by markReactions when REPEATER flag is detected
  - New `REPEATER = 1 << 19` flag in reactive constants

- **`Notifier`** - Pluggable cross-side notification (Layer 3)
  - `Notifier` interface — decouple reactive system from transport
  - `AtomicsNotifier` — uses `Atomics.store` + `Atomics.notify` with microtask batching
  - `NoopNotifier` — silent, for testing
  - Multiple synchronous writes result in a single notification

### Changed

- `markReactions` in `tracking.ts` now has a REPEATER branch that calls `forwardRepeater()` inline and marks the reaction CLEAN

## [1.12.0] - 2026-01-27

### Added

- **`ReactiveSharedArray`** - SharedArrayBuffer-backed reactive arrays for zero-copy FFI
  - `ReactiveSharedFloat32Array`, `ReactiveSharedUint8Array`, `ReactiveSharedInt32Array`, `ReactiveSharedUint32Array`
  - Per-index dirty tracking for sparse updates
  - Atomics-based notification (`notifyNative`, `scheduleNotify`)
  - Full reactive graph integration (get/set trigger subscriptions)
  - Fine-grained and coarse-grained reactivity via `getIndexSource()`

## [1.11.0] - 2026-01-26

### Added

- **`typedSlotArray`** - TypedArray-backed reactive slots for zero-copy FFI integration
  - Direct TypedArray buffer access via `.buffer` property
  - Per-index reactive tracking via signals
  - Automatic dirty tracking via shared ReactiveSet
  - `sync()` method flushes reactive sources to buffer
  - Perfect for native FFI (Rust NAPI, Zig FFI, WebAssembly)
  - Supports all TypedArray types: Float32Array, Int32Array, Uint8Array, etc.

- **`typedSlotArrayGroup`** - Create multiple typedSlotArrays with shared dirty tracking
  - Single ReactiveSet tracks changes across all arrays
  - `syncAndGetDirty()` returns changed indices and clears dirty set
  - Ideal for ECS-style parallel arrays with native layout engines
  - Example usage:
    ```typescript
    const dirtySet = new ReactiveSet<number>()
    const layout = typedSlotArrayGroup({
      width: { type: Float32Array, defaultValue: 0 },
      height: { type: Float32Array, defaultValue: 0 },
      visible: { type: Uint8Array, defaultValue: 1 },
    }, 1024, dirtySet)

    // Bind reactive props
    layout.arrays.width.setSource(0, widthSignal)

    // In derived: sync and get dirty indices
    const dirty = layout.syncAndGetDirty()
    nativeLayoutEngine(dirty, layout.arrays.width.buffer, ...)
    ```

## [1.10.0] - 2026-01-19

### Added

- **`trackedSlotArray`** - New primitive for automatic dirty tracking in reactive arrays
  - Wraps SlotArray behavior with automatic mutation tracking via ReactiveSet
  - When `setSource()` or `setValue()` is called, automatically adds index to provided ReactiveSet
  - Enables O(1) skip optimizations: check if `dirtySet.size === 0` before recomputation
  - Perfect for ECS-style architectures and incremental computation patterns
  - Drop-in replacement for `slotArray` when you need change tracking
  - Example usage:
    ```typescript
    const dirty = new ReactiveSet<number>()
    const arr = trackedSlotArray(0, dirty)
    
    arr.setSource(5, signal(42))  // Automatically marks dirty.add(5)
    
    derived(() => {
      if (dirty.size === 0) return cached  // O(1) skip!
      // Process only dirty indices...
    })
    ```

### Documentation

- Added comprehensive documentation for `trackedSlotArray` in README
- Added 19 unit tests covering all edge cases and reactive behavior
- Documented three-level reactivity pattern: per-index tracking, size tracking, and version tracking

## [1.9.0] - 2026-01-16

Initial published version with complete Svelte 5-style reactivity system.

### Features

- Core primitives: signal, derived, state, stateRaw
- Effects: async effects, sync effects, root effects
- Advanced primitives: linkedSignal, createSelector, effectScope
- Bindings & slots: bind, slot, slotArray, reactiveProps
- Deep reactivity with proxy-based tracking
- Reactive collections: ReactiveMap, ReactiveSet, ReactiveWeakMap
- Zero dependencies, ~8KB minified
- Full TypeScript support
