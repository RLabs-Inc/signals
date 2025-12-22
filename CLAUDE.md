# CLAUDE.md - @rlabs-inc/signals

## What is this project?

A standalone fine-grained reactivity library for TypeScript, inspired by Svelte 5 runes. It provides reactive primitives (signals, effects, derived values) and reactive collections without any framework dependencies.

**Key characteristics:**
- Pure TypeScript, zero dependencies
- Fine-grained reactivity (only affected effects re-run)
- Deep reactivity via Proxy (nested objects/arrays are reactive)
- Lazy derived values (only compute when read)
- ~700 lines of code

## Architecture Overview

```
┌─────────────────────────────────────────┐
│           Global Tracking State          │
│  activeReaction, batchDepth, untracking │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│    Signals    │       │    Effects    │
│  { v, reactions }  ◄──────  { deps, fn }
└───────────────┘       └───────────────┘
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
            ┌───────────────┐
            │    Derived    │
            │ (lazy + cached)
            └───────────────┘
```

### Core Concepts

1. **Signal** - A reactive value container
   - Has a value (`v`) and a set of reactions that depend on it
   - When read, registers the current effect as a dependency
   - When written, triggers all dependent effects

2. **Effect** - A function that re-runs when dependencies change
   - Tracks which signals it reads during execution
   - Automatically re-runs when any tracked signal changes
   - Supports cleanup functions

3. **Derived** - A computed value that caches and updates lazily
   - Only recomputes when read AND dirty
   - Marks itself dirty when dependencies change
   - Can be a dependency of effects or other deriveds

4. **Deep Reactivity (state)** - Proxy-based deep reactivity
   - Wraps objects in Proxies to intercept property access/mutation
   - Each property has its own internal signal for fine-grained tracking
   - Nested objects are lazily wrapped when accessed

## File Structure

```
signals/
├── src/
│   ├── index.ts           # Everything in one file (~700 lines)
│   └── index.test.ts      # Comprehensive test suite
├── package.json
├── tsconfig.json
├── README.md
└── CLAUDE.md
```

## Key Implementation Details

### Tracking Mechanism

```typescript
// Global state
let activeReaction: Reaction | null = null

// When reading a signal
function track(signal) {
  if (activeReaction && !untracking) {
    activeReaction.deps.add(signal)
    signal.reactions.add(activeReaction)
  }
}

// When writing a signal
function trigger(signal) {
  for (const reaction of signal.reactions) {
    if (batchDepth > 0) {
      pendingReactions.add(reaction)
    } else {
      reaction.execute()
    }
  }
}
```

### Deep Reactivity (Proxy)

```typescript
const proxy = new Proxy(target, {
  get(target, prop) {
    const sig = getPropSignal(prop)
    track(sig)  // Track property access

    const value = target[prop]
    if (shouldProxy(value)) {
      return createDeepReactive(value)  // Recursively wrap
    }
    return value
  },

  set(target, prop, value) {
    target[prop] = value
    const sig = getPropSignal(prop)
    trigger(sig)  // Trigger property signal
    return true
  }
})
```

### Lazy Derived Values

```typescript
function derived(fn) {
  let dirty = true
  let cachedValue

  // Reaction that marks dirty (doesn't recompute)
  const markDirty = () => {
    if (!dirty) {
      dirty = true
      trigger(internal)  // Notify our dependents
    }
  }

  return {
    get value() {
      track(internal)
      if (dirty) {
        cachedValue = fn()  // Recompute only when read
        dirty = false
      }
      return cachedValue
    }
  }
}
```

## Building

```bash
bun install
bun run build
```

## Testing

```bash
bun test
```

## Common Tasks

### Adding a new utility

1. Add the function to `src/index.ts`
2. Export it from the module
3. Add tests in `src/index.test.ts`
4. Update README.md with documentation

### Debugging reactivity

Use `console.log` inside effects to see when they run:

```typescript
effect(() => {
  console.log('Effect running, value:', someSignal.value)
})
```

### Understanding the reaction cycle

1. Effect runs, sets `activeReaction = self`
2. Signal is read, calls `track(signal)`
3. Track adds effect to signal's reactions, adds signal to effect's deps
4. Effect finishes, resets `activeReaction`
5. Later: signal is written, calls `trigger(signal)`
6. Trigger iterates reactions and calls `execute()` on each
7. Effect re-runs from step 1

## Gotchas and Tips

1. **Signals need `.value`**: Unlike Svelte's compiler magic, you must use `.value` to read/write:
   ```typescript
   const count = signal(0)
   count.value++  // Correct
   count++        // Wrong - mutates the signal object itself
   ```

2. **Deep reactivity is Proxy-based**: Only plain objects and arrays are made reactive. Class instances, Maps, Sets, etc. are not wrapped.

3. **Derived is lazy**: A derived won't compute until read. If nothing reads it, it won't run.

4. **Effects run synchronously**: When you update a signal, effects run immediately (unless batched).

5. **Cleanup functions**: Effects can return a cleanup function that runs before the next execution:
   ```typescript
   effect(() => {
     const handler = () => {}
     window.addEventListener('click', handler)
     return () => window.removeEventListener('click', handler)
   })
   ```

6. **Batching**: Use `batch()` when making multiple updates to prevent multiple effect runs:
   ```typescript
   batch(() => {
     a.value = 1
     b.value = 2
     c.value = 3
   })  // Effects only run once after batch
   ```

## Performance Characteristics

| Operation | Complexity |
|-----------|------------|
| Signal read | O(1) + tracking overhead |
| Signal write | O(n) where n = number of reactions |
| Effect run | O(d) where d = number of dependencies |
| Derived read (cached) | O(1) |
| Derived read (dirty) | O(d) |

Memory: Each signal stores ~3 pointers, each effect stores a Set of deps.

## Future Improvements

Potential enhancements:
- `effectScope` for grouping effects (partial implementation exists)
- Debug/trace mode for development
- Computed with equality check (partial - via options.equals)
- Shallow reactive (currently only deep)
