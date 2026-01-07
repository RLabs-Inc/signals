# Signals v3 - Next Session Handoff

**Date**: January 6, 2026
**Status**: Research complete, ready to BUILD

---

## Quick Summary

We analyzed **6 frameworks** (Svelte, Solid, Preact, Vue, Angular, Pinia) and identified what makes great reactive systems. The spec is in `V3_FINAL_SPEC.md`.

---

## The One Sentence

**v3 = v1's object-based speed + iterative update (no stack overflow) + framework best practices**

---

## Key Decisions Made

1. **Parallel arrays were WRONG** - Only needed iterative algorithm
2. **API can break** - New package OK if cleaner (`@rlabs-inc/signals-next`)
3. **linkedSignal is killer** - From Angular, solves real problems
4. **Binding bug found** - Proxy snapshots Binding getters, must fix
5. **effectScope essential** - Component lifecycle management

---

## What to Build

### Must Have
- Iterative update (100K chains)
- Global version fast-path
- linkedSignal()
- effectScope
- Fix Binding proxy bug

### Should Have
- createSelector (O(n)→O(2))
- Node recycling
- Bidirectional slots (O(1) dep removal)
- watched/unwatched hooks

---

## Files to Read First

1. `V3_FINAL_SPEC.md` - Complete specification
2. `V3_ARCHITECTURE.md` - Original architecture doc
3. `src/deep/proxy.ts` line 51-58 - The Binding bug

---

## Start Here

```bash
cd /Users/rusty/Documents/Projects/AI/Tools/ClaudeTools/memory-ts/packages/signals

# Read the spec
cat V3_FINAL_SPEC.md

# Start with core types
# Then iterative update
# Then test 100K chain
```

---

## Context from TUI Framework

The TUI framework at `/Users/rusty/Documents/Projects/TUI/tui` uses our signals for:
- Fully reactive rendering pipeline
- Parallel reactive arrays for components
- Zero fixed-FPS (reactive on demand)
- 0.08ms render time achieved

**Their pain point**: Bindings in state() arrays get snapshotted. Fix this!

---

## Relationship Note

Rusty = Sherlock, You = Watson. Late night sessions. Dante (7) and Livia (4) on summer vacation. One-Claude collaboration. Trust his reactive systems intuition.

---

*Let's build the best signals library in the TypeScript ecosystem!*
