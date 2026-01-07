# Signals v3 - The Clean Implementation

**Date**: January 6, 2026
**Status**: Architecture document for next session
**Goal**: Production-grade signals with v1 speed + unlimited chain depth

---

## Executive Summary

We built v1 (organic growth, fast but crashes at 10K chains) and v2 (parallel arrays, robust but slower). Neither is right. v3 takes the lessons from both:

- **Object-based architecture** (v1's speed)
- **Iterative update algorithm** (v2's robustness)
- **Unified API** (v2's clean design)
- **Lazy computation** (v1's efficiency)
- **Clean code from day one** (no organic growth)

---

## What We Learned

### v1 Analysis
**Fast because:**
- Direct object property access (`signal.v`, `signal.deps`)
- Lazy derived computation (only compute when first read)
- Simple data structures

**Crashes because:**
- Recursive `updateDerived()` - 10K chain = 10K stack frames
- That's the ONLY problem

### v2 Analysis
**Robust because:**
- Iterative update algorithm (no stack overflow)

**Slower because:**
- Array index lookups (`VALUES[id]`) instead of direct property access
- Eager computation (deriveds compute on creation, even if never read)
- Parallel arrays were unnecessary overhead

### The Key Insight
**Parallel arrays were the wrong solution.** The recursion problem only needed an **iterative algorithm**, not a data structure change. We over-engineered.

---

## v3 Architecture

### Core Principle
Keep v1's object-based speed, add v2's iterative robustness.

### Data Structures

```typescript
// Simple, direct, fast
interface Source<T> {
  v: T                          // Value - direct access
  wv: number                    // Write version
  reactions: Set<Reaction>      // What depends on this
  equals: (a: T, b: T) => boolean
}

interface Derived<T> {
  v: T                          // Cached value
  fn: () => T                   // Computation function
  flags: number                 // CLEAN | DIRTY | MAYBE_DIRTY
  wv: number                    // Write version
  deps: Source<any>[] | null    // What this depends on (null = never computed)
  reactions: Set<Reaction>      // What depends on this
  equals: (a: T, b: T) => boolean
}

interface Effect {
  fn: () => void | (() => void)
  teardown: (() => void) | null
  flags: number
  deps: Source<any>[] | null
  parent: Effect | null         // For nested effects
  children: Set<Effect>
}

type Reaction = Derived<any> | Effect
```

### The Iterative Update (The Critical Part)

```typescript
function updateDerivedIterative<T>(target: Derived<T>): T {
  // If clean, return cached value
  if (target.flags === CLEAN) {
    return target.v
  }

  // If never computed (deps === null), compute once (lazy)
  if (target.deps === null) {
    computeDerived(target)
    return target.v
  }

  // ITERATIVE UPDATE - no recursion
  const stack: Derived<any>[] = [target]

  while (stack.length > 0) {
    const node = stack[stack.length - 1]

    // Skip if already clean (processed by earlier iteration)
    if (node.flags === CLEAN) {
      stack.pop()
      continue
    }

    // Check if any dependency needs updating first
    let pendingDep: Derived<any> | null = null

    if (node.deps !== null) {
      for (const dep of node.deps) {
        if ('fn' in dep && dep.flags !== CLEAN) {
          // It's a dirty derived - needs update first
          pendingDep = dep as Derived<any>
          break
        }
      }
    }

    if (pendingDep !== null) {
      // Push dependency to process first, come back to node later
      stack.push(pendingDep)
    } else {
      // All deps are clean - safe to compute this node
      stack.pop()

      if (node.flags === DIRTY) {
        computeDerived(node)
      } else {
        // MAYBE_DIRTY - check if deps actually changed
        if (depsChanged(node)) {
          computeDerived(node)
        } else {
          node.flags = CLEAN
        }
      }
    }
  }

  return target.v
}

function depsChanged(node: Derived<any>): boolean {
  if (node.deps === null) return true

  for (const dep of node.deps) {
    if (dep.wv > node.wv) return true
  }
  return false
}
```

### Dirty Propagation (Also Iterative)

```typescript
function markDirty(source: Source<any>): void {
  const stack: Reaction[] = [...source.reactions]

  while (stack.length > 0) {
    const reaction = stack.pop()!

    if (reaction.flags === DIRTY) continue  // Already dirty

    if ('fn' in reaction && 'v' in reaction) {
      // It's a Derived
      if (reaction.flags === CLEAN) {
        reaction.flags = MAYBE_DIRTY
        // Cascade to its dependents
        for (const r of reaction.reactions) {
          stack.push(r)
        }
      }
    } else {
      // It's an Effect
      reaction.flags = DIRTY
      scheduleEffect(reaction)
    }
  }
}
```

---

## API Design

### Public API (Clean, Unified)

```typescript
// Unified signal - handles primitives and objects
function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>

// Backwards compatibility alias
const state = signal

// Computed values
function derived<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T>

// Side effects
function effect(fn: () => void | (() => void)): () => void

// Utilities
function batch<T>(fn: () => T): T
function untrack<T>(fn: () => T): T
function flushSync(): void

// Bindings (for UI frameworks)
function bind<T>(source: Signal<T>): Binding<T>
function bindReadonly<T>(source: Signal<T> | ReadonlySignal<T>): ReadonlyBinding<T>
```

### Signal Wrapper

```typescript
function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const equals = options?.equals ?? Object.is

  // Objects get deep reactivity via proxy
  if (isObject(initial)) {
    const proxy = createDeepProxy(initial)
    const source = createSource(proxy, equals)

    return {
      get value() {
        trackRead(source)
        return proxy
      },
      set value(v: T) {
        if (isObject(v)) {
          const newProxy = createDeepProxy(v)
          writeSource(source, newProxy)
        } else {
          writeSource(source, v)
        }
      }
    }
  }

  // Primitives get simple wrapper
  const source = createSource(initial, equals)

  return {
    get value() { return readSource(source) },
    set value(v: T) { writeSource(source, v) }
  }
}
```

---

## Deep Proxy Strategy

### Per-Property Signals (Fine-Grained)

```typescript
function createDeepProxy<T extends object>(target: T): T {
  const signals = new Map<PropertyKey, Source<any>>()

  return new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === RAW_SYMBOL) return target

      const value = Reflect.get(target, prop, receiver)

      // Get or create signal for this property
      let signal = signals.get(prop)
      if (!signal) {
        const proxiedValue = shouldProxy(value) ? createDeepProxy(value) : value
        signal = createSource(proxiedValue, Object.is)
        signals.set(prop, signal)
      }

      return readSource(signal)
    },

    set(target, prop, value, receiver) {
      let signal = signals.get(prop)
      if (!signal) {
        signal = createSource(undefined, Object.is)
        signals.set(prop, signal)
      }

      const proxiedValue = shouldProxy(value) ? createDeepProxy(value) : value
      Reflect.set(target, prop, value, receiver)
      writeSource(signal, proxiedValue)

      return true
    },

    // Array methods need special handling
    // ... (update length signal, keys signal for iteration)
  })
}
```

---

## File Structure

```
src/
├── core.ts           # Source, Derived, Effect types and creation
├── tracking.ts       # Read/write with dependency tracking
├── update.ts         # THE KEY: Iterative update algorithm
├── scheduling.ts     # Effect batching and flushing
├── proxy.ts          # Deep reactivity for objects/arrays
├── collections.ts    # ReactiveMap, ReactiveSet, ReactiveDate
├── bind.ts           # Bindings for UI frameworks
├── index.ts          # Public API exports
└── test/
    ├── signals.test.ts
    ├── derived.test.ts
    ├── effects.test.ts
    ├── proxy.test.ts
    ├── chains.test.ts      # 100K chain tests
    ├── stress.test.ts      # Performance limits
    └── edge-cases.test.ts  # All the weird stuff
```

---

## Implementation Order

1. **core.ts** - Data structures, creation functions
2. **tracking.ts** - Global state, read/write tracking
3. **update.ts** - Iterative derived update (THE CRITICAL PART)
4. **scheduling.ts** - Effect scheduling, batch, flush
5. **proxy.ts** - Deep reactivity
6. **Tests after each file** - No moving forward without tests
7. **bind.ts** - Bindings
8. **collections.ts** - Map, Set, Date

---

## Test Requirements

### Must Pass
- All 82 tests from v2 test suite
- All v1 tests
- 100K derived chain (no crash)
- Diamond dependency (glitch-free)
- Conditional dependencies
- Fine-grained proxy (7 levels deep)
- Array mutations (push, pop, splice, shift, unshift)
- Self-referencing effects (bounded)
- Infinite loop detection

### Performance Targets
- Signal creation: ≤ v1 speed (100ns)
- Signal read: ≤ v1 speed (11ns)
- Signal write: ≤ v1 speed (29ns)
- Derived read (cached): ≤ v1 speed (23ns)
- 1000-chain propagation: < 1ms
- Deep object access: ≤ v1 speed

---

## Critical Implementation Notes

### 1. Lazy Deriveds (NOT Eager)
Deriveds should NOT compute on creation. Compute on first read.
- `deps === null` means "never computed"
- First read triggers computation and populates deps
- This avoids wasted work for deriveds that are never read

### 2. Iterative Update is the Key
The ONLY thing v1 couldn't do was unlimited chain depth.
The ONLY thing needed to fix it is iterative update.
Everything else should stay v1-like.

### 3. Version-Based Dirty Checking
Use write versions (wv) to check if deps actually changed:
```typescript
function depsChanged(node: Derived<any>): boolean {
  for (const dep of node.deps) {
    if (dep.wv > node.wv) return true
  }
  return false
}
```

### 4. Three-State Dirty Tracking
- CLEAN (0): Value is current
- MAYBE_DIRTY (1): A dependency might have changed
- DIRTY (2): Definitely needs recomputation

### 5. Effect Self-Invalidation
Effects that write to their own dependencies need special handling:
```typescript
// After effect runs, check if any writes were to tracked deps
// If so, re-schedule the effect
```

---

## Commands

```bash
# Run tests
bun test

# Run specific test file
bun test test/chains.test.ts

# Type check
bun run typecheck

# Benchmark vs v1
bun bench/compare.ts

# Stress test
bun test/stress.test.ts
```

---

## Context for Future Self

**What we tried:**
1. v1: Object-based, lazy, fast - but recursive update crashes at 10K chains
2. v2: Parallel arrays, eager, iterative - robust but slower than v1

**What we learned:**
- Parallel arrays add overhead, not speed
- Eager computation wastes work
- The ONLY problem was recursion
- The ONLY solution needed was iterative update

**What v3 should be:**
- v1's object-based architecture (direct property access)
- v1's lazy computation (compute on first read)
- v2's iterative update algorithm (no recursion)
- v2's unified API (signal handles everything, state is alias)
- Clean code from scratch (no organic growth)

**The goal:** v1 speed + unlimited depth + clean codebase

---

*Written with the hard lessons of v1 and v2. Don't repeat the mistakes.*
