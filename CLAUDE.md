# @rlabs-inc/signals - Development Guide

## Quick Reference

This is a **production-grade fine-grained reactivity library** combining the best of Svelte 5, Angular, Solid, and Vue reactivity systems. No compiler needed, no DOM, works anywhere.

## Commands

```bash
# Run tests
bun test

# Run single test file
bun test test/unit/signal.test.ts

# Type check
bun run typecheck  # or: tsc --noEmit

# Build
bun run build
```

## Architecture

### Core Concepts

1. **Signals** (`Source<T>`) - Reactive values with version tracking
2. **Deriveds** (`Derived<T>`) - Computed values that cache and auto-update
3. **Effects** (`Effect`) - Side effects that re-run when dependencies change
4. **Proxies** - Deep reactivity for objects/arrays with per-property granularity
5. **Bindings** - Two-way reactive pointers for connecting signals

### File Structure

```
src/
├── core/           # Foundational types and state
│   ├── constants.ts  # All flags (DIRTY, CLEAN, EFFECT, etc.)
│   ├── types.ts      # TypeScript interfaces
│   └── globals.ts    # Mutable global tracking state
├── primitives/     # User-facing primitives
│   ├── signal.ts     # signal(), signals(), source(), state(), stateRaw()
│   ├── derived.ts    # derived()
│   ├── effect.ts     # effect(), effect.root(), effect.pre(), effect.tracking()
│   ├── bind.ts       # bind(), bindReadonly(), isBinding(), unwrap()
│   ├── linked.ts     # linkedSignal() - Angular's killer feature
│   ├── selector.ts   # createSelector() - Solid's O(n)→O(2) optimization
│   └── scope.ts      # effectScope(), onScopeDispose(), getCurrentScope()
├── reactivity/     # Core algorithms
│   ├── tracking.ts   # get(), set(), updateReaction()
│   ├── scheduling.ts # scheduleEffect(), flushSync()
│   ├── batching.ts   # batch()
│   └── equality.ts   # Equality functions
├── deep/           # Deep reactivity
│   └── proxy.ts      # Per-property proxy signals
├── collections/    # Reactive collections
│   ├── map.ts        # ReactiveMap
│   ├── set.ts        # ReactiveSet
│   └── date.ts       # ReactiveDate
└── index.ts        # Public exports + initialization
```

### Key Patterns

#### Three-State Dirty Tracking
- `CLEAN` - No update needed
- `MAYBE_DIRTY` - Check dependencies before updating
- `DIRTY` - Definitely needs update

#### Version-Based Deduplication
- `rv` (read version) - Prevents duplicate dependency registration
- `wv` (write version) - Tracks when signal was last written

#### Effect Tree Structure
Effects form a tree via linked list: `parent`, `first`, `last`, `prev`, `next`

## Critical Implementation Details

### Fine-Grained Proxy
The key innovation: per-property signals via lazy creation. When you mutate `obj.a.b.c`, ONLY effects reading that exact path re-run.

```typescript
// In proxy.ts
const sources = new Map<PropertyKey, Source<unknown>>()

// Each property gets its own signal
get(target, prop) {
  const s = getOrCreateSource(prop)
  return get(s)  // Only tracks THIS property
}
```

### Self-Referencing Effects
Effects that write to their own dependencies (like `effect(() => count.value++)`) are handled via `untrackedWrites` tracking. After effect runs, we check if any writes are now dependencies and re-schedule.

### Infinite Loop Protection
`flushSync` has a 1000 iteration limit before throwing `Maximum update depth exceeded`.

### Derived Mutation Protection
Writing to signals inside a derived throws an error immediately.

### linkedSignal Implementation
Uses `derived` + `effect.pre` internally. The derived computes the value, while `effect.pre` handles synchronous reset when source changes. Manual writes go to an internal signal that gets reset.

### createSelector Optimization
Maintains a Map of key→Set<Reaction>. When source changes, only reactions for the old and new value are notified (O(2) instead of O(n)).

### effectScope Pause/Resume
When paused, effects are still marked dirty but not scheduled. On resume, all dirty effects in the scope are flushed.

## Common Issues

1. **"state() requires proxy"** - Import from `index.ts`, not individual files
2. **Effect not re-running** - Check if you're reading signals inside `untrack()`
3. **Memory leaks** - Always dispose effects when done: `const dispose = effect(...); dispose()`
4. **Binding to proxy objects** - Don't bind() to state() objects directly; bind to individual properties or use signals()

## Testing

The "nightmare test" validates fine-grained reactivity at 7 levels deep:
```typescript
it('THE NIGHTMARE TEST - 7 levels deep', () => {
  // Mutating the deepest path should ONLY trigger effects
  // reading that exact path, not other paths
})
```

## API Quick Reference

### Core
- `signal(value)` - Writable reactive value
- `signals({...})` - Create multiple signals
- `state(obj)` - Deep reactive object
- `stateRaw(obj)` - Reference-only tracking
- `derived(() => ...)` - Computed value

### Effects
- `effect(() => ...)` - Side effect
- `effect.pre(() => ...)` - Synchronous effect
- `effect.root(() => ...)` - Scoped effects
- `effect.tracking()` - Check tracking context

### Bindings
- `bind(source)` - Two-way binding
- `bindReadonly(source)` - Read-only binding
- `isBinding(v)` / `unwrap(v)` - Utilities

### Advanced
- `linkedSignal(() => ...)` - Reset on source change (Angular)
- `createSelector(() => ...)` - O(2) list selection (Solid)
- `effectScope()` - Batch disposal with pause/resume (Vue)

### Utilities
- `batch(() => ...)` - Group updates
- `untrack(() => ...)` / `peek()` - Disable tracking
- `flushSync()` / `tick()` - Synchronization
