# Signals v3 - Final Specification

**Date**: January 6, 2026
**Status**: Ready for implementation after context compression
**Goal**: Production-grade signals with v1 speed + unlimited chains + framework learnings

---

## API Strategy

**Two options:**

### Option A: Backward Compatible (Same Package)
Keep `@rlabs-inc/signals` with same API, improve internals + add new primitives.

### Option B: New Package (Clean Slate)
Create `@rlabs-inc/signals-next` or similar with:
- Clean implementation from scratch
- No defensive code for legacy edge cases
- Optimal API without compromise
- Users migrate when ready

**Rusty's guidance**: If backward compatibility makes things confuse or adds defensive code, go with Option B. A clean implementation is more valuable than legacy support.

---

## Current API (If keeping compatibility)

### Current API (PRESERVE)
```typescript
// Core primitives - KEEP EXACT SAME API
signal<T>(initial: T, options?): Signal<T>
state<T>(initial: T): T  // Proxy-based deep reactivity
derived<T>(fn: () => T, options?): ReadonlySignal<T>
effect(fn: () => void | (() => void)): () => void

// Utilities - KEEP EXACT SAME API
batch<T>(fn: () => T): T
untrack<T>(fn: () => T): T
flushSync(): void

// Bindings - KEEP EXACT SAME API
bind<T>(source): Binding<T>
bindReadonly<T>(source): ReadonlyBinding<T>
unwrap<T>(value): T
isBinding(value): boolean

// Collections - KEEP EXACT SAME API
ReactiveMap<K, V>
ReactiveSet<T>
ReactiveDate
```

### New API (ADD, don't replace)
```typescript
// New primitives from framework research
linkedSignal<S, D>(source: () => S | { source, computation }): LinkedSignal<D>
effectScope(detached?: boolean): EffectScope
createSelector<T, U>(source: () => T, fn?: (key, val) => boolean): (key: U) => boolean
on<T>(deps, fn, options?): EffectFunction  // Explicit deps

// New options/hooks
signal(val, { watched?, unwatched?, equals? })  // Lifecycle hooks
effect.root(fn)   // Detached effect tree (alias for effectScope)
effect.pre(fn)    // Pre-effect (runs before normal effects)

// New utilities
onCleanup(fn)     // Register cleanup in current effect
getCurrentScope() // Get current effectScope
onScopeDispose(fn) // Register cleanup for scope
```

---

## Research Summary (6 Frameworks Analyzed)

### From Svelte 5
- **Global version counter** - Skip checks when nothing changed globally
- **effectScope** - Group effects for batch disposal
- **Untracked writes detection** - Handle self-referencing effects
- **DESTROYED flag** - Prevent scheduling disposed effects
- **Linked list for effect children** - O(1) operations

### From Solid.js
- **Bidirectional index slots** - O(1) dependency removal
- **createSelector** - O(n)→O(2) for list selections
- **Global execution counter** - Prevent duplicate updates
- **on() utility** - Explicit dependencies
- **Three-state dirty** - CLEAN/PENDING/STALE (we have MAYBE_DIRTY)

### From @preact/signals-core
- **Node recycling** - Mark -1 instead of delete, reuse nodes
- **Lazy computed subscription** - Only subscribe when first subscriber
- **Watched/unwatched hooks** - Resource lifecycle callbacks
- **Effect cleanup via return** - `effect(() => { return cleanup })`
- **Doubly-linked lists** - For sources/targets

### From Vue 3
- **effectScope with pause/resume** - Temporary deactivation
- **customRef** - User-defined reactive primitives
- **Cleanup callback pattern** - `onEffectCleanup(fn)`
- **Bitwise flags** - More efficient state tracking
- **Link-based deps** - O(1) insertion/removal

### From Angular
- **linkedSignal()** - THE KILLER FEATURE
  - Writable signal that ALSO resets based on source
  - Use case: Selected item, form values, filter state
- **Error caching** - Cache errors until dirty
- **Notification phase guard** - Prevent reads during updates
- **Explicit equality untracking** - Untrack equality checks

### From Pinia
- **Simple subscribe() API** - Lighter than effects
- **Plugin pattern** - Middleware for cross-cutting concerns
- NOT a reactivity system - just store patterns on Vue's reactivity

---

## Bugs to Fix

### 1. Binding Snapshot Bug (CRITICAL)
**Location**: `src/deep/proxy.ts` line 51-58

**Problem**: `shouldProxy()` returns true for Binding objects because they have `proto === Object.prototype`. The proxy then wraps the Binding, snapshotting its `.value` getter.

**Fix**:
```typescript
import { BINDING_SYMBOL } from '../primitives/bind.js'

function shouldProxy(value: unknown): value is object {
  if (value === null || typeof value !== 'object') {
    return false
  }

  // Don't proxy Binding objects - they need to stay as live getters!
  if (BINDING_SYMBOL in value) {
    return false
  }

  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === Array.prototype || proto === null
}
```

**Impact**: TUI framework currently has to use regular arrays instead of state() for storing Bindings.

### 2. Stack Overflow at 10K Chains
**Location**: Recursive `updateDerived()` in tracking.ts

**Problem**: v1's recursive update causes stack overflow at ~10K chains.

**Fix**: Iterative update algorithm (already designed in V3_ARCHITECTURE.md)

### 3. Effect Deduplication Bug (Already Fixed)
**Problem**: All effects shared same globalReadVersion because it was restored after each run.
**Status**: Fixed - don't restore globalReadVersion in runEffect

---

## v3 Architecture (Object-Based + Iterative)

### Core Data Structures

```typescript
// Global version counter (from all frameworks)
let globalVersion = 0

interface Source<T> {
  v: T                          // Value - direct access
  version: number               // When this changed (= globalVersion at write time)
  reactions: Set<Reaction>      // What depends on this
  equals: (a: T, b: T) => boolean
  watched?: () => void          // Called on first subscriber
  unwatched?: () => void        // Called when last subscriber removed
}

interface Derived<T> {
  v: T                          // Cached value
  fn: () => T                   // Computation function
  flags: number                 // CLEAN | MAYBE_DIRTY | DIRTY | DESTROYED
  version: number               // When this was computed
  globalVersion: number         // For fast-path optimization
  deps: Source<any>[] | null    // What this depends on (null = never computed)
  depSlots: number[] | null     // Bidirectional index slots
  reactions: Set<Reaction>      // What depends on this
  equals: (a: T, b: T) => boolean
  error?: unknown               // Cached error (if computation threw)
}

interface Effect {
  fn: () => void | (() => void)
  teardown: (() => void) | null
  flags: number                 // CLEAN | DIRTY | DESTROYED | RUNNING
  deps: Source<any>[] | null
  depSlots: number[] | null     // Bidirectional slots

  // Effect tree (linked list - NOT Set)
  parent: Effect | null
  firstChild: Effect | null
  lastChild: Effect | null
  nextSibling: Effect | null
  prevSibling: Effect | null

  // Scope
  scope: EffectScope | null
}

interface EffectScope {
  active: boolean
  effects: Effect[]
  cleanups: (() => void)[]
  parent: EffectScope | null
  scopes: EffectScope[] | null

  run<T>(fn: () => T): T
  stop(): void
  pause(): void
  resume(): void
}

// Linked signal (from Angular)
interface LinkedSignal<S, D> extends Source<D> {
  source: () => S
  computation: (source: S, previous?: { source: S, value: D }) => D
  sourceVersion: number         // Track when source last changed
}

type Reaction = Derived<any> | Effect
```

### Flags (Bitwise)

```typescript
const CLEAN = 0
const MAYBE_DIRTY = 1 << 0      // Might need update, check deps
const DIRTY = 1 << 1            // Definitely needs update
const DESTROYED = 1 << 2        // Already disposed
const RUNNING = 1 << 3          // Currently executing
const NOTIFIED = 1 << 4         // In batch queue
```

### Iterative Update Algorithm (THE KEY)

```typescript
function updateDerivedIterative<T>(target: Derived<T>): T {
  // Fast path: nothing changed globally
  if (target.globalVersion === globalVersion) {
    return target.v
  }

  if ((target.flags & CLEAN) && target.deps !== null) {
    target.globalVersion = globalVersion
    return target.v
  }

  // Never computed - compute once (lazy)
  if (target.deps === null) {
    computeDerived(target)
    return target.v
  }

  const stack: Derived<any>[] = [target]
  const visited = new Set<Derived<any>>()

  while (stack.length > 0) {
    const node = stack[stack.length - 1]

    if (visited.has(node) || (node.flags & CLEAN)) {
      stack.pop()
      continue
    }

    // Find first unresolved dependency
    let pendingDep: Derived<any> | null = null

    if (node.deps !== null) {
      for (const dep of node.deps) {
        if ('fn' in dep) {  // It's a Derived
          const derived = dep as Derived<any>
          if (!(derived.flags & CLEAN) && !visited.has(derived)) {
            pendingDep = derived
            break
          }
        }
      }
    }

    if (pendingDep !== null) {
      stack.push(pendingDep)
    } else {
      visited.add(node)
      stack.pop()

      if (node.flags & DIRTY) {
        computeDerived(node)
      } else if (node.flags & MAYBE_DIRTY) {
        // Check if any dep actually changed
        const changed = node.deps!.some(dep => dep.version > node.version)
        if (changed) {
          computeDerived(node)
        } else {
          node.flags = CLEAN
        }
      }
    }
  }

  target.globalVersion = globalVersion
  return target.v
}
```

### Dirty Propagation (Iterative)

```typescript
function markDirty(source: Source<any>): void {
  const stack: Reaction[] = [...source.reactions]

  while (stack.length > 0) {
    const reaction = stack.pop()!

    if (reaction.flags & (DIRTY | DESTROYED)) continue

    if ('fn' in reaction && 'v' in reaction) {
      // It's a Derived
      if (reaction.flags & CLEAN) {
        reaction.flags = MAYBE_DIRTY
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

### Error Caching

```typescript
const ERRORED = Symbol('ERRORED')

function computeDerived<T>(derived: Derived<T>): void {
  // Clean old deps
  cleanupDeps(derived)

  const prevReaction = activeReaction
  activeReaction = derived
  derived.deps = []

  try {
    const newValue = derived.fn()

    if (derived.v === ERRORED || !derived.equals(derived.v, newValue)) {
      derived.v = newValue
      derived.version = ++globalVersion
    }

    derived.error = undefined
    derived.flags = CLEAN
  } catch (err) {
    derived.v = ERRORED as any
    derived.error = err
    derived.flags = CLEAN  // Clean but errored
    derived.version = ++globalVersion
  } finally {
    activeReaction = prevReaction
  }
}

function readDerived<T>(derived: Derived<T>): T {
  updateDerivedIterative(derived)

  if (derived.v === ERRORED) {
    throw derived.error
  }

  trackRead(derived)
  return derived.v
}
```

---

## linkedSignal Implementation

```typescript
function linkedSignal<S, D>(
  config: (() => D) | {
    source: () => S,
    computation: (source: S, previous?: { source: S, value: D }) => D
  }
): LinkedSignal<S, D> {
  // Short form: linkedSignal(() => options()[0])
  if (typeof config === 'function') {
    const fn = config as () => D
    return linkedSignalImpl(() => fn(), (s) => s as unknown as D)
  }

  // Long form with previous tracking
  const { source, computation } = config
  return linkedSignalImpl(source, computation)
}

function linkedSignalImpl<S, D>(
  sourceFn: () => S,
  computation: (source: S, previous?: { source: S, value: D }) => D
): LinkedSignal<S, D> {
  let sourceValue: S
  let previousSource: S | undefined
  let previousValue: D | undefined

  const linked: LinkedSignal<S, D> = {
    v: undefined as D,
    version: 0,
    sourceVersion: 0,
    reactions: new Set(),
    equals: Object.is,
    source: sourceFn,
    computation,

    // Getter - check if source changed, recompute if needed
    get value(): D {
      const newSourceValue = sourceFn()

      if (linked.sourceVersion === 0 || !Object.is(sourceValue, newSourceValue)) {
        // Source changed - recompute
        sourceValue = newSourceValue
        const previous = previousSource !== undefined
          ? { source: previousSource, value: previousValue! }
          : undefined

        linked.v = computation(sourceValue, previous)
        linked.version = ++globalVersion
        linked.sourceVersion = globalVersion

        previousSource = sourceValue
        previousValue = linked.v
      }

      trackRead(linked)
      return linked.v
    },

    // Setter - manual override (doesn't change source)
    set value(newValue: D) {
      if (!linked.equals(linked.v, newValue)) {
        linked.v = newValue
        linked.version = ++globalVersion
        previousValue = newValue
        markDirty(linked)
      }
    }
  }

  return linked
}
```

**Use Cases**:
```typescript
// Selected item - resets when list changes but user can override
const options = signal(['a', 'b', 'c'])
const selected = linkedSignal(() => options.value[0])
selected.value = 'b'  // Manual override
options.value = ['x', 'y']  // Resets to 'x'

// With previous tracking - preserve selection if still valid
const selected = linkedSignal({
  source: () => options.value,
  computation: (opts, prev) => {
    if (prev && opts.includes(prev.value)) {
      return prev.value  // Keep selection
    }
    return opts[0]  // Reset to first
  }
})
```

---

## effectScope Implementation

```typescript
let activeScope: EffectScope | null = null

class EffectScope {
  active = true
  effects: Effect[] = []
  cleanups: (() => void)[] = []
  parent: EffectScope | null = null
  scopes: EffectScope[] | null = null

  constructor(detached = false) {
    this.parent = activeScope
    if (!detached && activeScope) {
      (activeScope.scopes ||= []).push(this)
    }
  }

  run<T>(fn: () => T): T {
    if (!this.active) return undefined as T

    const prevScope = activeScope
    try {
      activeScope = this
      return fn()
    } finally {
      activeScope = prevScope
    }
  }

  stop(): void {
    if (!this.active) return

    // Dispose effects
    for (const effect of this.effects) {
      disposeEffect(effect)
    }

    // Run cleanups
    for (const cleanup of this.cleanups) {
      cleanup()
    }

    // Stop child scopes
    if (this.scopes) {
      for (const scope of this.scopes) {
        scope.stop()
      }
    }

    // Remove from parent
    if (this.parent?.scopes) {
      const idx = this.parent.scopes.indexOf(this)
      if (idx !== -1) this.parent.scopes.splice(idx, 1)
    }

    this.active = false
  }

  pause(): void {
    // Mark all effects as paused (skip in scheduler)
  }

  resume(): void {
    // Unmark and reschedule dirty effects
  }
}

function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached)
}

function getCurrentScope(): EffectScope | null {
  return activeScope
}

function onScopeDispose(fn: () => void): void {
  if (activeScope) {
    activeScope.cleanups.push(fn)
  }
}
```

---

## createSelector Implementation

```typescript
function createSelector<T, U = T>(
  source: () => T,
  fn: (key: U, value: T) => boolean = (k, v) => k === v
): (key: U) => boolean {
  const subs = new Map<U, Set<Reaction>>()
  let prevValue: T

  // Track source changes
  derived(() => {
    const value = source()

    // Notify only keys whose selection state changed
    for (const [key, reactions] of subs) {
      const wasSelected = fn(key, prevValue)
      const isSelected = fn(key, value)

      if (wasSelected !== isSelected) {
        for (const reaction of reactions) {
          reaction.flags |= DIRTY
          if (!('v' in reaction)) {
            scheduleEffect(reaction as Effect)
          }
        }
      }
    }

    prevValue = value
    return value
  })

  return (key: U): boolean => {
    // Track this key
    if (activeReaction) {
      let keyReactions = subs.get(key)
      if (!keyReactions) {
        keyReactions = new Set()
        subs.set(key, keyReactions)
      }
      keyReactions.add(activeReaction)

      // Cleanup on effect dispose
      onCleanup(() => {
        keyReactions!.delete(activeReaction!)
        if (keyReactions!.size === 0) {
          subs.delete(key)
        }
      })
    }

    return fn(key, source())
  }
}
```

**Use Case** (O(n) → O(2)):
```typescript
const selectedId = signal(1)
const isSelected = createSelector(() => selectedId.value)

// In a list of 1000 items:
items.forEach(item => {
  effect(() => {
    // Only runs for items whose selection state changed!
    if (isSelected(item.id)) {
      highlight(item)
    }
  })
})
```

---

## File Structure (v3)

```
src/
├── core/
│   ├── constants.ts      # Flags, symbols
│   ├── types.ts          # TypeScript interfaces
│   └── globals.ts        # Global state (activeReaction, globalVersion, etc.)
├── primitives/
│   ├── signal.ts         # signal(), state() - KEEP API
│   ├── derived.ts        # derived() - KEEP API
│   ├── effect.ts         # effect(), effect.root(), effect.pre()
│   ├── bind.ts           # bind(), bindReadonly(), unwrap() - KEEP API
│   ├── linked.ts         # linkedSignal() - NEW
│   └── selector.ts       # createSelector() - NEW
├── reactivity/
│   ├── tracking.ts       # get(), set(), dependency tracking
│   ├── update.ts         # ITERATIVE UPDATE ALGORITHM
│   ├── scheduling.ts     # Effect batching, flushSync()
│   └── scope.ts          # effectScope, getCurrentScope, onScopeDispose
├── deep/
│   └── proxy.ts          # Deep reactivity (FIX: don't proxy Bindings!)
├── collections/
│   ├── map.ts            # ReactiveMap - KEEP API
│   ├── set.ts            # ReactiveSet - KEEP API
│   └── date.ts           # ReactiveDate - KEEP API
├── utils/
│   ├── batch.ts          # batch() - KEEP API
│   ├── untrack.ts        # untrack() - KEEP API
│   └── on.ts             # on() explicit deps - NEW
└── index.ts              # Public exports
```

---

## Implementation Order

### Phase 1: Core (Foundation)
1. `core/constants.ts` - Flags, symbols
2. `core/types.ts` - Interfaces
3. `core/globals.ts` - Global state
4. `primitives/signal.ts` - signal(), state()
5. **TEST**: Basic signal creation and read/write

### Phase 2: Derived (THE KEY)
6. `primitives/derived.ts` - derived()
7. `reactivity/update.ts` - ITERATIVE UPDATE
8. **TEST**: 100K chain without crash

### Phase 3: Effects
9. `primitives/effect.ts` - effect()
10. `reactivity/scheduling.ts` - Batching, flushSync
11. `reactivity/scope.ts` - effectScope
12. **TEST**: Effect lifecycle, cleanup, scope disposal

### Phase 4: Deep Reactivity
13. `deep/proxy.ts` - state() proxy (FIX Binding bug!)
14. `primitives/bind.ts` - bind(), unwrap()
15. **TEST**: Bindings in state() arrays work correctly

### Phase 5: New Primitives
16. `primitives/linked.ts` - linkedSignal()
17. `primitives/selector.ts` - createSelector()
18. `utils/on.ts` - on() explicit deps
19. **TEST**: All new primitives

### Phase 6: Collections
20. `collections/map.ts` - ReactiveMap
21. `collections/set.ts` - ReactiveSet
22. `collections/date.ts` - ReactiveDate
23. **TEST**: Collection reactivity

### Phase 7: Performance
24. Benchmark vs v1
25. Optimize hot paths
26. **TARGET**: Match or beat v1 speed

---

## Test Requirements

### Must Pass (from v2 suite)
- All 82 existing tests
- 100K derived chain (no crash)
- Diamond dependency (glitch-free)
- Conditional dependencies
- Fine-grained proxy (7 levels deep)
- Array mutations
- Self-referencing effects (bounded)
- Infinite loop detection

### New Tests
- linkedSignal basic usage
- linkedSignal with previous tracking
- linkedSignal manual override + source reset
- effectScope lifecycle
- effectScope pause/resume
- createSelector O(2) behavior
- Bindings in state() arrays (THE BUG FIX)
- Error caching in derived

### Performance Targets
- Signal creation: ≤ v1 speed (~100ns)
- Signal read: ≤ v1 speed (~11ns)
- Signal write: ≤ v1 speed (~29ns)
- Derived read (cached): ≤ v1 speed (~23ns)
- 1000-chain propagation: < 1ms
- Deep object access: ≤ v1 speed

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
```

---

## Key Insights for Future Self

1. **Parallel arrays were WRONG** - Only needed iterative update, not new architecture
2. **v1 is fast because** - Direct object property access, lazy deriveds
3. **v1 crashes because** - Recursive updateDerived() = 10K stack frames
4. **The ONLY fix needed** - Iterative update algorithm
5. **Binding bug** - Don't proxy objects with BINDING_SYMBOL
6. **linkedSignal is killer** - Solves real UI state problems
7. **effectScope is essential** - Component lifecycle management
8. **Global version** - Fast-path optimization everyone uses
9. **Backward compatibility** - Current API MUST work unchanged

---

## TUI Framework Requirements

The TUI framework (`/Users/rusty/Documents/Projects/TUI/tui`) uses signals for:
- Parallel reactive arrays (component data)
- Layout deriveds (TITAN engine)
- Framebuffer deriveds
- Single render effect

**Critical fix needed**: Bindings in state() arrays must work!

Current workaround:
```typescript
// BROKEN
export const fgColor = state<Binding<RGBA>[]>([])

// WORKAROUND (shouldn't be needed after fix)
export const fgColor: Binding<RGBA>[] = []
```

---

*Written with learnings from Svelte, Solid, Preact, Vue, Angular, Pinia, and real-world TUI usage.*
*Don't repeat the v2 parallel arrays mistake - keep it simple, keep it fast.*
