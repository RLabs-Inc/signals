// ============================================================================
// @rlabs-inc/signals - Signal Tests
// ============================================================================

import { describe, it, expect } from 'bun:test'
import { signal, effect, derived, batch, flushSync, untrack } from '../../src/index.js'

describe('signal', () => {
  it('creates a signal with initial value', () => {
    const count = signal(0)
    expect(count.value).toBe(0)
  })

  it('updates value', () => {
    const count = signal(0)
    count.value = 10
    expect(count.value).toBe(10)
  })

  it('tracks dependencies in effects', () => {
    const count = signal(0)
    let observed = 0
    let runs = 0

    effect(() => {
      observed = count.value
      runs++
    })

    flushSync()
    expect(runs).toBe(1)
    expect(observed).toBe(0)

    count.value = 5
    flushSync()
    expect(runs).toBe(2)
    expect(observed).toBe(5)
  })

  it('uses equality function', () => {
    const count = signal(0)
    let runs = 0

    effect(() => {
      count.value
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    // Same value - should NOT trigger
    count.value = 0
    flushSync()
    expect(runs).toBe(1)

    // Different value - should trigger
    count.value = 1
    flushSync()
    expect(runs).toBe(2)
  })
})

describe('derived', () => {
  it('computes derived value', () => {
    const count = signal(1)
    const doubled = derived(() => count.value * 2)

    expect(doubled.value).toBe(2)
  })

  it('updates when dependency changes', () => {
    const count = signal(1)
    const doubled = derived(() => count.value * 2)

    expect(doubled.value).toBe(2)

    count.value = 5
    expect(doubled.value).toBe(10)
  })

  it('is lazy - only computes when read', () => {
    const count = signal(1)
    let computations = 0

    const doubled = derived(() => {
      computations++
      return count.value * 2
    })

    expect(computations).toBe(0)

    doubled.value // First read
    expect(computations).toBe(1)

    doubled.value // Cached
    expect(computations).toBe(1)

    count.value = 5 // Marks dirty

    doubled.value // Recomputes
    expect(computations).toBe(2)
  })

  it('handles derived chain', () => {
    const a = signal(1)
    const b = derived(() => a.value * 2)
    const c = derived(() => b.value + 1)

    expect(c.value).toBe(3)

    a.value = 5
    expect(c.value).toBe(11)
  })

  it('handles diamond dependency', () => {
    const a = signal(1)
    const b = derived(() => a.value * 2)
    const c = derived(() => a.value + 1)
    const d = derived(() => b.value + c.value)

    expect(d.value).toBe(4) // 2 + 2

    a.value = 2
    expect(d.value).toBe(7) // 4 + 3
  })
})

describe('effect', () => {
  it('runs immediately (async)', async () => {
    const count = signal(0)
    let observed = 0

    effect(() => {
      observed = count.value
    })

    // Before flush
    expect(observed).toBe(0)

    flushSync()
    expect(observed).toBe(0)
  })

  it('re-runs when dependencies change', () => {
    const count = signal(0)
    let observed = 0

    effect(() => {
      observed = count.value
    })

    flushSync()
    expect(observed).toBe(0)

    count.value = 5
    flushSync()
    expect(observed).toBe(5)
  })

  it('supports cleanup function', () => {
    const count = signal(0)
    let cleanups = 0

    effect(() => {
      count.value
      return () => {
        cleanups++
      }
    })

    flushSync()
    expect(cleanups).toBe(0)

    count.value = 1
    flushSync()
    expect(cleanups).toBe(1)

    count.value = 2
    flushSync()
    expect(cleanups).toBe(2)
  })

  it('can be disposed', () => {
    const count = signal(0)
    let runs = 0

    const dispose = effect(() => {
      count.value
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    count.value = 1
    flushSync()
    expect(runs).toBe(2)

    dispose()

    count.value = 2
    flushSync()
    expect(runs).toBe(2) // No more runs
  })

  it('handles conditional dependencies', () => {
    const toggle = signal(true)
    const a = signal(1)
    const b = signal(2)
    let runs = 0

    effect(() => {
      runs++
      toggle.value ? a.value : b.value
    })

    flushSync()
    expect(runs).toBe(1)

    a.value = 10 // Tracked
    flushSync()
    expect(runs).toBe(2)

    b.value = 20 // NOT tracked
    flushSync()
    expect(runs).toBe(2)

    toggle.value = false
    flushSync()
    expect(runs).toBe(3)

    a.value = 100 // No longer tracked
    flushSync()
    expect(runs).toBe(3)

    b.value = 200 // Now tracked
    flushSync()
    expect(runs).toBe(4)
  })
})

describe('batch', () => {
  it('batches multiple updates', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0

    effect(() => {
      a.value
      b.value
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    batch(() => {
      a.value = 10
      b.value = 20
    })

    flushSync()
    expect(runs).toBe(2) // Only one more run, not two
  })

  it('supports nested batches', () => {
    const count = signal(0)
    let runs = 0

    effect(() => {
      count.value
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    batch(() => {
      count.value = 1
      batch(() => {
        count.value = 2
        count.value = 3
      })
      count.value = 4
    })

    flushSync()
    expect(runs).toBe(2)
    expect(count.value).toBe(4)
  })
})

describe('untrack', () => {
  it('reads without creating dependency', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0

    effect(() => {
      a.value // Tracked
      untrack(() => b.value) // NOT tracked
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    a.value = 10
    flushSync()
    expect(runs).toBe(2)

    b.value = 20
    flushSync()
    expect(runs).toBe(2) // Didn't re-run
  })
})

describe('effect.root', () => {
  it('creates independent effect scope', () => {
    const count = signal(0)
    let runs = 0

    const dispose = effect.root(() => {
      effect(() => {
        count.value
        runs++
      })
    })

    flushSync()
    expect(runs).toBe(1)

    count.value = 1
    flushSync()
    expect(runs).toBe(2)

    dispose()

    count.value = 2
    flushSync()
    expect(runs).toBe(2) // Disposed
  })
})

describe('effect.pre', () => {
  it('runs synchronously', () => {
    const count = signal(0)
    let observed = 0

    effect.pre(() => {
      observed = count.value
    })

    // Runs immediately, no need for flushSync
    expect(observed).toBe(0)

    count.value = 5
    flushSync()
    expect(observed).toBe(5)
  })
})

describe('self-referencing effects', () => {
  it('handles effect that writes to its dependency', () => {
    const count = signal(0)
    let runs = 0

    effect(() => {
      runs++
      const v = count.value
      if (runs < 5) {
        count.value = v + 1
      }
    })

    flushSync()
    expect(runs).toBe(5)
    expect(count.value).toBe(4)
  })

  it('throws on infinite loop', () => {
    const count = signal(0)

    effect(() => {
      count.value = count.value + 1
    })

    expect(() => flushSync()).toThrow('Maximum update depth exceeded')
  })
})

describe('derived mutation protection', () => {
  it('throws when writing to signal inside derived', () => {
    const a = signal(1)
    const b = signal(2)

    const sum = derived(() => {
      b.value = 10 // This should throw!
      return a.value
    })

    expect(() => sum.value).toThrow('Cannot write to signals inside a derived')
  })
})
