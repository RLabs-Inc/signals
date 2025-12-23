// ============================================================================
// @rlabs-inc/signals - Dependency Tracking
// The core of the reactivity system - get() and set()
// ============================================================================

import type { Source, Reaction, Derived } from '../core/types.js'
import {
  DIRTY,
  MAYBE_DIRTY,
  CLEAN,
  DERIVED,
  EFFECT,
  REACTION_IS_UPDATING,
  STATUS_MASK,
} from '../core/constants.js'
import {
  activeReaction,
  activeEffect,
  untracking,
  readVersion,
  newDeps,
  skippedDeps,
  untrackedWrites,
  setNewDeps,
  setSkippedDeps,
  setUntrackedWrites,
  incrementReadVersion,
  incrementWriteVersion,
  batchDepth,
  addUntrackedWrite,
  addPendingReaction,
  setActiveReaction,
} from '../core/globals.js'
import { scheduleEffect } from './scheduling.js'

// =============================================================================
// GET - Read a signal value with dependency tracking
// =============================================================================

/**
 * Read a signal's value and track it as a dependency
 * This is the core of Svelte 5's fine-grained reactivity
 *
 * Key optimizations:
 * 1. Version-based deduplication (rv) prevents duplicate dependencies
 * 2. skippedDeps optimization reuses existing dependency arrays
 */
export function get<T>(signal: Source<T>): T {
  // If we're inside a reaction, track this signal as a dependency
  if (activeReaction !== null && !untracking) {
    // Check if we're in the reaction's init/update cycle
    if ((activeReaction.f & REACTION_IS_UPDATING) !== 0) {
      // Version-based deduplication: only add if not already tracked this cycle
      if (signal.rv < readVersion) {
        signal.rv = readVersion

        const deps = activeReaction.deps

        // Optimization: if dependencies are in the same order as last time,
        // we can reuse the existing array position
        if (newDeps === null && deps !== null && deps[skippedDeps] === signal) {
          setSkippedDeps(skippedDeps + 1)
        } else {
          // New or reordered dependency
          if (newDeps === null) {
            setNewDeps([signal])
          } else {
            newDeps.push(signal)
          }
        }
      }
    } else {
      // Outside init/update cycle (e.g., after await in async code)
      // Add dependency directly
      if (activeReaction.deps === null) {
        activeReaction.deps = [signal]
      } else if (!activeReaction.deps.includes(signal)) {
        activeReaction.deps.push(signal)
      }

      // Register reaction with signal
      if (signal.reactions === null) {
        signal.reactions = [activeReaction]
      } else if (!signal.reactions.includes(activeReaction)) {
        signal.reactions.push(activeReaction)
      }
    }
  }

  // If this is a derived signal, check if it needs to be updated
  if ((signal.f & DERIVED) !== 0) {
    const derived = signal as unknown as Derived
    if (isDirty(derived)) {
      updateDerived(derived)
    }
  }

  return signal.v
}

// =============================================================================
// SET - Write a signal value and trigger reactions
// =============================================================================

import { ROOT_EFFECT, BRANCH_EFFECT } from '../core/constants.js'

/**
 * Write a signal's value and trigger dependent reactions
 */
export function set<T>(signal: Source<T>, value: T): T {
  // Check for unsafe mutation inside a derived
  if (activeReaction !== null && (activeReaction.f & DERIVED) !== 0) {
    throw new Error(
      'Cannot write to signals inside a derived. ' +
      'Deriveds should be pure computations with no side effects.'
    )
  }

  // Only update if value actually changed
  if (!signal.equals.call(signal, value)) {
    signal.v = value
    signal.wv = incrementWriteVersion()

    // Mark all reactions as dirty and schedule them
    markReactions(signal, DIRTY)

    // Track writes inside effects for self-invalidation
    // If we're inside an effect that is CLEAN (not yet marked dirty)
    // and it's not a root/branch effect, track this write
    if (
      activeEffect !== null &&
      (activeEffect.f & CLEAN) !== 0 &&
      (activeEffect.f & (ROOT_EFFECT | BRANCH_EFFECT)) === 0
    ) {
      addUntrackedWrite(signal)
    }
  }

  return value
}

// =============================================================================
// MARK REACTIONS - Propagate dirty state
// =============================================================================

/**
 * Mark all reactions of a signal with the given status
 * For effects: schedule them for execution
 * For deriveds: cascade MAYBE_DIRTY to their reactions
 */
export function markReactions(signal: Source, status: number): void {
  const reactions = signal.reactions
  if (reactions === null) return

  for (let i = 0; i < reactions.length; i++) {
    const reaction = reactions[i]
    const flags = reaction.f

    // Skip if already DIRTY (don't downgrade to MAYBE_DIRTY)
    const notDirty = (flags & DIRTY) === 0

    if (notDirty) {
      setSignalStatus(reaction, status)
    }

    // For derived signals, cascade MAYBE_DIRTY to their dependents
    if ((flags & DERIVED) !== 0) {
      markReactions(reaction as unknown as Source, MAYBE_DIRTY)
    } else if (notDirty) {
      // For effects, schedule them for execution
      scheduleEffect(reaction)
    }
  }
}

// =============================================================================
// SET SIGNAL STATUS
// =============================================================================

/**
 * Set the status flags of a signal (CLEAN, DIRTY, MAYBE_DIRTY)
 */
export function setSignalStatus(signal: { f: number }, status: number): void {
  signal.f = (signal.f & STATUS_MASK) | status
}

// =============================================================================
// IS DIRTY - Check if a reaction needs to update
// =============================================================================

/**
 * Check if a reaction is dirty and needs to be updated
 *
 * DIRTY: definitely needs update
 * MAYBE_DIRTY: check dependencies to see if any actually changed
 * CLEAN: no update needed
 */
export function isDirty(reaction: Reaction): boolean {
  // Definitely dirty
  if ((reaction.f & DIRTY) !== 0) {
    return true
  }

  // Maybe dirty - check dependencies
  if ((reaction.f & MAYBE_DIRTY) !== 0) {
    const deps = reaction.deps

    if (deps !== null) {
      for (let i = 0; i < deps.length; i++) {
        const dep = deps[i]

        // If dependency is a dirty derived, update it first
        if ((dep.f & DERIVED) !== 0) {
          if (isDirty(dep as unknown as Reaction)) {
            updateDerived(dep as unknown as Derived)
          }
        }

        // Check if dependency's write version is newer than our last update
        if (dep.wv > reaction.wv) {
          return true
        }
      }
    }

    // All dependencies are clean, mark us as clean too
    setSignalStatus(reaction, CLEAN)
  }

  return false
}

// =============================================================================
// UPDATE DERIVED - Placeholder (implemented in derived.ts)
// =============================================================================

// Forward declaration - actual implementation in derived.ts
let updateDerivedImpl: (derived: Derived) => void = () => {
  throw new Error('updateDerived not initialized - import derived.ts first')
}

export function updateDerived(derived: Derived): void {
  updateDerivedImpl(derived)
}

export function setUpdateDerivedImpl(impl: (derived: Derived) => void): void {
  updateDerivedImpl = impl
}

// =============================================================================
// REMOVE REACTIONS - Clean up stale dependencies
// =============================================================================

/**
 * Remove a reaction from its dependencies, starting at the given index
 * Uses swap-and-pop for O(1) removal
 */
export function removeReactions(reaction: Reaction, start: number): void {
  const deps = reaction.deps
  if (deps === null) return

  for (let i = start; i < deps.length; i++) {
    removeReaction(reaction, deps[i])
  }
}

/**
 * Remove a single reaction from a dependency's reactions list
 * Uses swap-and-pop for O(1) removal
 */
function removeReaction(reaction: Reaction, dep: Source): void {
  const reactions = dep.reactions
  if (reactions === null) return

  const index = reactions.indexOf(reaction)
  if (index !== -1) {
    // Swap with last element, then pop
    const last = reactions.length - 1
    if (index !== last) {
      reactions[index] = reactions[last]
    }
    reactions.pop()

    // If no more reactions, null out the array
    if (reactions.length === 0) {
      dep.reactions = null
    }
  }
}

// =============================================================================
// UPDATE REACTION - Run a reaction with dependency tracking
// =============================================================================

/**
 * Run a reaction function and track its dependencies
 * This is the core algorithm for dynamic dependency tracking
 */
export function updateReaction(reaction: Reaction): unknown {
  // Save previous tracking state
  const prevNewDeps = newDeps
  const prevSkippedDeps = skippedDeps
  const prevReaction = activeReaction
  const prevUntrackedWrites = untrackedWrites

  // Set up tracking for this reaction
  setNewDeps(null)
  setSkippedDeps(0)
  setActiveReaction(reaction)
  setUntrackedWrites(null)

  // Increment read version for this cycle
  const prevReadVersion = readVersion
  incrementReadVersion()

  // Mark that we're updating
  reaction.f |= REACTION_IS_UPDATING

  try {
    // Run the reaction function
    const result = reaction.fn!()

    const deps = reaction.deps

    // Handle new dependencies
    if (newDeps !== null) {
      // Remove old dependencies that are no longer used
      removeReactions(reaction, skippedDeps)

      // Install new dependencies
      if (deps !== null && skippedDeps > 0) {
        // Reuse existing array, append new deps
        deps.length = skippedDeps + newDeps.length
        for (let i = 0; i < newDeps.length; i++) {
          deps[skippedDeps + i] = newDeps[i]
        }
      } else {
        // Replace entire deps array
        reaction.deps = newDeps
      }

      // Register with new dependencies
      const finalDeps = reaction.deps!
      for (let i = skippedDeps; i < finalDeps.length; i++) {
        const dep = finalDeps[i]
        if (dep.reactions === null) {
          dep.reactions = [reaction]
        } else {
          dep.reactions.push(reaction)
        }
      }
    } else if (deps !== null && skippedDeps < deps.length) {
      // Some old deps are no longer used
      removeReactions(reaction, skippedDeps)
      deps.length = skippedDeps
    }

    // Handle self-invalidation: if the effect wrote to signals that are now
    // dependencies, schedule it to run again
    if (
      untrackedWrites !== null &&
      reaction.deps !== null &&
      (reaction.f & EFFECT) !== 0 &&
      (reaction.f & DERIVED) === 0
    ) {
      for (const signal of untrackedWrites) {
        if (reaction.deps.includes(signal)) {
          // The effect wrote to a signal it depends on - schedule re-run
          setSignalStatus(reaction, DIRTY)
          scheduleEffect(reaction)
          break
        }
      }
    }

    return result
  } finally {
    // Clear updating flag
    reaction.f &= ~REACTION_IS_UPDATING

    // Restore previous tracking state
    setNewDeps(prevNewDeps)
    setSkippedDeps(prevSkippedDeps)
    setActiveReaction(prevReaction)

    // Merge untracked writes for nested reactions
    if (untrackedWrites !== null) {
      if (prevUntrackedWrites === null) {
        setUntrackedWrites(untrackedWrites)
      } else {
        prevUntrackedWrites.push(...untrackedWrites)
        setUntrackedWrites(prevUntrackedWrites)
      }
    } else {
      setUntrackedWrites(prevUntrackedWrites)
    }
  }
}
