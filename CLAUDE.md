# @rlabs-inc/signals - Development Guide

## Quick Reference

This is a **production-grade fine-grained reactivity library** mirroring Svelte 5's reactivity system as a standalone TypeScript package. No compiler needed, no DOM, works anywhere.

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

### File Structure

```
src/
├── core/           # Foundational types and state
│   ├── constants.ts  # All flags (DIRTY, CLEAN, EFFECT, etc.)
│   ├── types.ts      # TypeScript interfaces
│   └── globals.ts    # Mutable global tracking state
├── primitives/     # User-facing primitives
│   ├── signal.ts     # signal(), source(), state()
│   ├── derived.ts    # derived()
│   └── effect.ts     # effect(), effect.root(), effect.pre()
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

## Common Issues

1. **"state() requires proxy"** - Import from `index.ts`, not individual files
2. **Effect not re-running** - Check if you're reading signals inside `untrack()`
3. **Memory leaks** - Always dispose effects when done: `const dispose = effect(...); dispose()`

## Testing

The "nightmare test" validates fine-grained reactivity at 7 levels deep:
```typescript
it('THE NIGHTMARE TEST - 7 levels deep', () => {
  // Mutating the deepest path should ONLY trigger effects
  // reading that exact path, not other paths
})
```
