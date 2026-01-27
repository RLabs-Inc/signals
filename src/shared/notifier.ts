// ============================================================================
// @rlabs-inc/signals - Notifier
//
// Pluggable cross-side notification mechanism.
// Decouples the reactive system from the transport layer.
// ============================================================================

// =============================================================================
// NOTIFIER INTERFACE
// =============================================================================

/**
 * A notification mechanism for cross-side communication.
 *
 * When a SharedSlotBuffer is written to, the notifier is called to inform
 * the other side (e.g., Rust) that changes are pending.
 *
 * Implementations can batch notifications (e.g., via microtask) to avoid
 * redundant wake-ups during a synchronous update burst.
 */
export interface Notifier {
  /** Notify the other side that changes are pending. */
  notify(): void
}

// =============================================================================
// ATOMICS NOTIFIER
// =============================================================================

/**
 * Notifier that uses Atomics.store + Atomics.notify to wake a thread
 * waiting on a shared memory location.
 *
 * Notifications are batched via microtask: multiple synchronous writes
 * result in a single Atomics.notify call.
 */
export class AtomicsNotifier implements Notifier {
  private readonly wakeFlag: Int32Array
  private readonly index: number
  private pending = false

  constructor(wakeFlag: Int32Array, index = 0) {
    this.wakeFlag = wakeFlag
    this.index = index
  }

  notify(): void {
    if (!this.pending) {
      this.pending = true
      queueMicrotask(() => {
        this.pending = false
        Atomics.store(this.wakeFlag, this.index, 1)
        Atomics.notify(this.wakeFlag, this.index)
      })
    }
  }
}

// =============================================================================
// NOOP NOTIFIER
// =============================================================================

/**
 * A no-op notifier for testing or local-only usage.
 */
export class NoopNotifier implements Notifier {
  notify(): void {
    // intentionally empty
  }
}
