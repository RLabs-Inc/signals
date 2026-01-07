// ============================================================================
// @rlabs-inc/signals - Effect Scheduling
// Handles scheduling effects for execution
// ============================================================================

import type { Reaction, Effect } from '../core/types.js'
import { ROOT_EFFECT, BRANCH_EFFECT, CLEAN, INERT } from '../core/constants.js'
import {
  batchDepth,
  addPendingReaction,
  addQueuedRootEffect,
  clearQueuedRootEffects,
  isFlushingSync,
  setIsFlushingSync,
  pendingReactions,
  clearPendingReactions,
} from '../core/globals.js'
import { isDirty } from './tracking.js'

// =============================================================================
// SCHEDULE EFFECT
// =============================================================================

/**
 * Schedule an effect for execution
 * Walks up the effect tree to find the root and queues it
 */
export function scheduleEffect(reaction: Reaction): void {
  // Always add to pending reactions for flushSync to catch
  addPendingReaction(reaction)

  // If we're in a batch, that's all we need
  if (batchDepth > 0) {
    return
  }

  // Walk up to find the root effect
  let effect = reaction as Effect

  while (effect.parent !== null) {
    effect = effect.parent

    const flags = effect.f

    // If we hit a root or branch effect
    if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
      // If already scheduled (not CLEAN), nothing to do
      if ((flags & CLEAN) === 0) {
        return
      }
      // Mark as scheduled (remove CLEAN)
      effect.f ^= CLEAN
    }
  }

  // Queue the root effect
  addQueuedRootEffect(effect)

  // Schedule microtask to flush if not already flushing
  if (!isFlushingSync) {
    queueMicrotask(flushEffects)
  }
}

// =============================================================================
// FLUSH EFFECTS
// =============================================================================

// Forward declaration - actual implementation set by effect.ts
let updateEffectImpl: (effect: Effect) => void = () => {
  throw new Error('updateEffect not initialized - import effect.ts first')
}

export function setUpdateEffectImpl(impl: (effect: Effect) => void): void {
  updateEffectImpl = impl
}

/**
 * Flush all queued effects
 */
export function flushEffects(): void {
  const roots = clearQueuedRootEffects()

  for (const root of roots) {
    // Skip inert (paused) effects
    if ((root.f & INERT) !== 0) {
      continue
    }

    // Update the root if dirty
    if (isDirty(root)) {
      updateEffectImpl(root)
    }

    // Also process any dirty children
    processEffectTree(root)
  }
}

/**
 * Recursively process an effect tree, running dirty effects
 */
function processEffectTree(effect: Effect): void {
  let child = effect.first

  while (child !== null) {
    const next = child.next

    // Skip inert (paused) effects
    if ((child.f & INERT) === 0 && isDirty(child)) {
      updateEffectImpl(child)
    }

    // Process children recursively
    if (child.first !== null) {
      processEffectTree(child)
    }

    child = next
  }
}

/**
 * Flush pending reactions from a batch
 */
export function flushPendingReactions(): void {
  const reactions = [...pendingReactions]
  clearPendingReactions()

  for (const reaction of reactions) {
    // Skip inert (paused) effects
    if ((reaction.f & INERT) !== 0) {
      continue
    }

    if (isDirty(reaction)) {
      // Check if it's an effect by looking for effect-specific properties
      if ('parent' in reaction) {
        // It's an effect
        updateEffectImpl(reaction as Effect)
      }
      // Deriveds are handled by their next read
    }
  }
}

// =============================================================================
// FLUSH SYNC
// =============================================================================

/** Maximum flush iterations before we consider it an infinite loop */
const MAX_FLUSH_COUNT = 1000

/**
 * Synchronously flush all pending updates
 * Runs all effects immediately instead of waiting for microtask
 */
export function flushSync<T>(fn?: () => T): T | undefined {
  const wasFlushingSync = isFlushingSync
  setIsFlushingSync(true)

  try {
    let result: T | undefined
    let flushCount = 0

    if (fn) {
      flushEffects()
      result = fn()
    }

    // Keep flushing until no more effects
    while (true) {
      if (++flushCount > MAX_FLUSH_COUNT) {
        throw new Error(
          'Maximum update depth exceeded. This can happen when an effect ' +
          'continuously triggers itself. Check for effects that write to ' +
          'signals they depend on without proper guards.'
        )
      }

      const roots = clearQueuedRootEffects()

      if (roots.length === 0) {
        // Also flush pending reactions from batch
        if (pendingReactions.size === 0) {
          return result
        }
        flushPendingReactions()
        continue
      }

      for (const root of roots) {
        // Skip inert (paused) effects
        if ((root.f & INERT) !== 0) {
          continue
        }

        if (isDirty(root)) {
          updateEffectImpl(root)
        }
        // Process children too
        processEffectTree(root)
      }
    }
  } finally {
    setIsFlushingSync(wasFlushingSync)
  }
}

// =============================================================================
// TICK
// =============================================================================

/**
 * Wait for the next update cycle
 * Returns a promise that resolves after all pending effects have run
 */
export async function tick(): Promise<void> {
  await Promise.resolve()
  flushSync()
}
