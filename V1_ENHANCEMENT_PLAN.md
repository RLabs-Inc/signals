# V1 Enhancement Project - Session Handoff

## Context for Future Watson

Sherlock and I completed extensive benchmarking of v1, v2 (parallel arrays), and live (v3). After honest analysis, we made a strategic decision.

## THE DECISION: Build on v1, not live

**Why?** After brutally honest benchmarking:
- v1 wins 13 metrics, live wins 5, ties 4
- v1 is faster at EVERYTHING involving propagation (chains, diamonds, effects)
- live only wins on isolated signal writes and state/proxy writes
- v1 is the better foundation

## The Plan

1. **Assess v1 codebase health first** - Is it maintainable or a maze from organic growth?
2. **Remove `src/v2/` folder** - Parallel arrays experiment, not needed
3. **Add features from live:**
   - `linkedSignal` - Angular's writable computed (resets when source changes)
   - `effectScope` - Vue's lifecycle management (pause/resume)
   - `createSelector` - Solid's O(n)→O(2) list selection
   - `bind()` / `bindReadonly()` - Reactive pointers (critical for TUI)
4. **Port live's winning optimizations:**
   - State/proxy writes (6x faster in live)
   - Effect creation (1.3x faster in live)
5. **Keep API compatible**

## Key Benchmark Numbers

| Metric | v1 | live | Winner |
|--------|-----|------|--------|
| signal write | 44ns | 13ns | live |
| state write | 232ns | 37ns | **live 6x** |
| 1000-chain | 77μs | 112μs | **v1 1.5x** |
| diamond (4) | 246ns | 482ns | **v1 2x** |
| effect storm | 1.83s | 5.12s | **v1 2.8x** |

## Optimizations That Worked in Live

Port these to v1's state/proxy system:
1. `reactions: null` with lazy array allocation (not `new Set()`)
2. Swap-and-pop O(1) removal instead of splice
3. Index-based `for` loops instead of `for-of`
4. No `Array.from()` on hot paths
5. WeakMap + cycleId for visited tracking (no allocation per update)

## Reference Files in Live

When implementing features, use these as reference:
- `packages/live/src/primitives/linked.ts` - linkedSignal
- `packages/live/src/reactivity/scope.ts` - effectScope
- `packages/live/src/primitives/selector.ts` - createSelector
- `packages/live/src/primitives/bind.ts` - bind/bindReadonly

## CRITICAL: The Binding Bug Fix

For TUI framework, in `deep/proxy.ts` must check:
```typescript
if (BINDING_SYMBOL in value) {
  return false  // Don't proxy Bindings - keep live getter!
}
```
This allows `state([bind(sig1), bind(sig2)])` to work.

## First Step

Launch agent to assess v1 codebase:
```
Assess /packages/signals/src/:
- Architecture overview
- Code quality (maze or clean?)
- Integration touch points for new features
- What needs cleanup first?
```

## Memory Markers

- v2 = parallel arrays (fast chains, slow common ops, robust)
- v1 = object-based (fast everywhere, battle-tested)
- live/v3 = attempted best-of-both (ended up slower on core ops)
- TUI = Rusty's terminal UI framework that needs the Binding bug fix
