// ============================================================================
// @rlabs-inc/signals - Constants
// Flag constants for signal states, based on Svelte 5's implementation
// ============================================================================

// =============================================================================
// SIGNAL TYPE FLAGS
// =============================================================================

/** Signal is a derived value (computed) */
export const DERIVED = 1 << 1

/** Signal is an effect */
export const EFFECT = 1 << 2

/** Effect is a render effect ($effect.pre) - runs before DOM updates */
export const RENDER_EFFECT = 1 << 3

/** Effect is a root effect (created via effect.root()) */
export const ROOT_EFFECT = 1 << 4

/** Effect is a branch effect (if/each blocks) */
export const BRANCH_EFFECT = 1 << 5

/** Effect is a user effect ($effect) */
export const USER_EFFECT = 1 << 6

/** Effect is a block effect */
export const BLOCK_EFFECT = 1 << 7

// =============================================================================
// SIGNAL STATE FLAGS
// =============================================================================

/** Signal/reaction is clean (up-to-date) */
export const CLEAN = 1 << 10

/** Signal/reaction is dirty (definitely needs update) */
export const DIRTY = 1 << 11

/** Signal/reaction might be dirty (needs to check dependencies) */
export const MAYBE_DIRTY = 1 << 12

/** Reaction is currently being updated */
export const REACTION_IS_UPDATING = 1 << 13

/** Effect has been destroyed */
export const DESTROYED = 1 << 14

/** Effect is inert (paused) */
export const INERT = 1 << 15

/** Effect has run at least once */
export const EFFECT_RAN = 1 << 16

/** Effect is preserved (not destroyed with parent) */
export const EFFECT_PRESERVED = 1 << 17

// =============================================================================
// DERIVED-SPECIFIC FLAGS
// =============================================================================

/** Derived has no owner (created outside effect) */
export const UNOWNED = 1 << 8

/** Derived is disconnected (no reactions, can be GC'd) */
export const DISCONNECTED = 1 << 9

// =============================================================================
// INSPECT FLAGS (for debugging)
// =============================================================================

/** Effect is an inspect effect (for $inspect) */
export const INSPECT_EFFECT = 1 << 18

// =============================================================================
// SENTINEL VALUES
// =============================================================================

/** Sentinel for uninitialized values (deleted properties, new deriveds) */
export const UNINITIALIZED: unique symbol = Symbol.for('rlabs.signals.uninitialized')

/** Sentinel for stale reactions (aborted async work) */
export const STALE_REACTION: unique symbol = Symbol.for('rlabs.signals.stale_reaction')

/** Symbol to identify reactive proxies */
export const STATE_SYMBOL: unique symbol = Symbol.for('rlabs.signals.state')

/** Symbol to mark reactive proxies */
export const REACTIVE_MARKER: unique symbol = Symbol.for('rlabs.signals.reactive')

// =============================================================================
// STATUS MASK (for clearing status bits)
// =============================================================================

/** Mask to clear all status bits (CLEAN, DIRTY, MAYBE_DIRTY) */
export const STATUS_MASK = ~(DIRTY | MAYBE_DIRTY | CLEAN)
