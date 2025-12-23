// ============================================================================
// @rlabs-inc/signals - Global State
// Mutable global state for tracking the current reaction context
// ============================================================================

import type { Reaction, Effect, Source } from './types.js'

// =============================================================================
// REACTION TRACKING
// =============================================================================

/** Currently executing reaction (effect or derived) */
export let activeReaction: Reaction | null = null

/** Currently executing effect */
export let activeEffect: Effect | null = null

/** Whether we're currently untracking (reading without creating dependencies) */
export let untracking = false

// =============================================================================
// VERSION COUNTERS
// =============================================================================

/** Global write version - incremented on every signal write */
export let writeVersion = 1

/** Global read version - incremented on every reaction run */
export let readVersion = 0

// =============================================================================
// DEPENDENCY TRACKING (during reaction execution)
// =============================================================================

/** New dependencies collected during current reaction execution */
export let newDeps: Source[] | null = null

/** Number of existing dependencies that matched (optimization) */
export let skippedDeps = 0

/** Signals written to during current reaction (for self-invalidation) */
export let untrackedWrites: Source[] | null = null

// =============================================================================
// BATCHING
// =============================================================================

/** Current batch depth (for nested batches) */
export let batchDepth = 0

/** Pending reactions to run after batch completes */
export let pendingReactions: Set<Reaction> = new Set()

/** Queued root effects to process */
export let queuedRootEffects: Effect[] = []

/** Whether we're currently flushing synchronously */
export let isFlushingSync = false

// =============================================================================
// SETTERS (for internal use)
// =============================================================================

export function setActiveReaction(reaction: Reaction | null): Reaction | null {
  const prev = activeReaction
  activeReaction = reaction
  return prev
}

export function setActiveEffect(effect: Effect | null): Effect | null {
  const prev = activeEffect
  activeEffect = effect
  return prev
}

export function setUntracking(value: boolean): boolean {
  const prev = untracking
  untracking = value
  return prev
}

export function incrementWriteVersion(): number {
  return ++writeVersion
}

export function incrementReadVersion(): number {
  return ++readVersion
}

export function setNewDeps(deps: Source[] | null): Source[] | null {
  const prev = newDeps
  newDeps = deps
  return prev
}

export function setSkippedDeps(count: number): number {
  const prev = skippedDeps
  skippedDeps = count
  return prev
}

export function setUntrackedWrites(writes: Source[] | null): Source[] | null {
  const prev = untrackedWrites
  untrackedWrites = writes
  return prev
}

export function addUntrackedWrite(signal: Source): void {
  if (untrackedWrites === null) {
    untrackedWrites = [signal]
  } else {
    untrackedWrites.push(signal)
  }
}

export function incrementBatchDepth(): number {
  return ++batchDepth
}

export function decrementBatchDepth(): number {
  return --batchDepth
}

export function setIsFlushingSync(value: boolean): boolean {
  const prev = isFlushingSync
  isFlushingSync = value
  return prev
}

export function clearPendingReactions(): void {
  pendingReactions = new Set()
}

export function addPendingReaction(reaction: Reaction): void {
  pendingReactions.add(reaction)
}

export function clearQueuedRootEffects(): Effect[] {
  const prev = queuedRootEffects
  queuedRootEffects = []
  return prev
}

export function addQueuedRootEffect(effect: Effect): void {
  queuedRootEffects.push(effect)
}

// =============================================================================
// GETTERS (for external access when needed)
// =============================================================================

export function getReadVersion(): number {
  return readVersion
}

export function getWriteVersion(): number {
  return writeVersion
}

export function getBatchDepth(): number {
  return batchDepth
}
