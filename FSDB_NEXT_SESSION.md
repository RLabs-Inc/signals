# Signals v3 - Session Handoff

**Date**: January 6, 2026
**Next Task**: Build v3 from scratch - clean, production-grade implementation

---

## THE SHORT VERSION

We built v1 (fast, crashes on deep chains) and v2 (robust, but slower). Both taught us lessons. v3 combines the best:

- **Object-based** like v1 (fast)
- **Iterative update** like v2 (robust)
- **Lazy computation** like v1 (efficient)
- **Clean unified API** (new)

Read `V3_ARCHITECTURE.md` for the full design.

---

## CRITICAL LESSONS LEARNED

### The v2 Mistake
We thought parallel arrays would be faster. **They're not.** Array indexing (`VALUES[id]`) is slower than direct property access (`signal.v`).

Benchmark proof:
- Signal creation: v1 1.77x faster
- Deep object access: v1 1.17-1.27x faster
- The only v2 win was chain propagation (iterative algorithm, not data structure)

### The Real Problem
v1's only issue was **recursive `updateDerived()`** causing stack overflow at ~10K chains.

### The Real Solution
**Iterative update algorithm.** That's it. We didn't need to rewrite everything.

### Eager Computation Was Wrong
v2 computes deriveds on creation. This:
- Makes creation 5x slower for short chains
- Wastes work if derived is never read
- Shifts cost, doesn't reduce it

---

## V3 REQUIREMENTS

### Performance Targets (Must Match v1)
| Operation | Target |
|-----------|--------|
| Signal creation | ≤ 100ns |
| Signal read | ≤ 11ns |
| Signal write | ≤ 29ns |
| Derived read (cached) | ≤ 23ns |
| Deep object read | ≤ 86ns |

### Robustness Targets (Must Match v2)
- 100K derived chain: No crash
- Diamond dependencies: Glitch-free
- All 82 tests passing

### API
```typescript
// Unified - handles primitives and objects
signal<T>(initial: T): Signal<T>

// Alias for backwards compatibility
state = signal

// Computed
derived<T>(fn: () => T): ReadonlySignal<T>

// Side effects
effect(fn: () => void | (() => void)): () => void

// Utilities
batch<T>(fn: () => T): T
untrack<T>(fn: () => T): T
flushSync(): void
```

---

## IMPLEMENTATION PLAN

### Phase 1: Core (with tests)
1. `core.ts` - Source, Derived, Effect types
2. `tracking.ts` - Read/write with tracking
3. `update.ts` - **ITERATIVE UPDATE** (the key)
4. `scheduling.ts` - Batching, flushing

### Phase 2: Proxy (with tests)
5. `proxy.ts` - Deep reactivity

### Phase 3: Extras (with tests)
6. `bind.ts` - Bindings
7. `collections.ts` - Map, Set, Date

### Rule: No file without tests

---

## KEY CODE: Iterative Update

This is the critical algorithm that makes v3 robust:

```typescript
function updateDerivedIterative<T>(target: Derived<T>): T {
  if (target.flags === CLEAN) return target.v
  if (target.deps === null) {
    computeDerived(target)  // First read - lazy init
    return target.v
  }

  const stack: Derived<any>[] = [target]

  while (stack.length > 0) {
    const node = stack[stack.length - 1]

    if (node.flags === CLEAN) {
      stack.pop()
      continue
    }

    // Find dirty dependency
    let pendingDep: Derived<any> | null = null
    for (const dep of node.deps) {
      if ('fn' in dep && dep.flags !== CLEAN) {
        pendingDep = dep
        break
      }
    }

    if (pendingDep) {
      stack.push(pendingDep)  // Process dep first
    } else {
      stack.pop()
      if (node.flags === DIRTY || depsChanged(node)) {
        computeDerived(node)
      } else {
        node.flags = CLEAN
      }
    }
  }

  return target.v
}
```

---

## FILES TO KEEP/DELETE

### Keep
- `V3_ARCHITECTURE.md` - The design doc
- `FSDB_NEXT_SESSION.md` - This file
- `test/unit/*.test.ts` - v1 tests (run against v3)
- `src/v2/test-suite.ts` - Comprehensive tests (adapt for v3)
- `src/v2/bench-compare.ts` - Benchmark (adapt for v3)

### Can Delete (After v3 Works)
- `src/v2/` - The failed experiment
- Various debug files

### Don't Touch
- `src/` (v1) - Keep as reference until v3 is proven

---

## COMMANDS

```bash
# After v3 is built:
bun test                          # Run all tests
bun src/v3/bench-compare.ts       # Compare v1 vs v3
bun src/v3/test-suite.ts          # Comprehensive tests
```

---

## RUSTY'S VISION CONTEXT

This signals package is foundational for:
1. **fsDB** - Fractal State Database
2. **SveltUI** - Terminal rendering
3. **Brain Simulator** - C. elegans neurons as reactive nodes

The goal is production-grade reactivity that's both fast AND robust.

---

## HONEST STATE

- v1: Fast but crashes
- v2: Robust but slow
- v3: Not built yet - this is the task

Start fresh. Build clean. Test everything.

---

*The answer was simple all along: keep v1's architecture, add iterative update. Don't overcomplicate it.*
