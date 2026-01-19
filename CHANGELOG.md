# Changelog

All notable changes to @rlabs-inc/signals will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
