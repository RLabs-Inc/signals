import { describe, it, expect } from 'bun:test'
import { signal, effect, effectScope, getCurrentScope, onScopeDispose, flushSync } from '../../src/index.js'

describe('effectScope', () => {
  describe('basic functionality', () => {
    it('creates an active scope', () => {
      const scope = effectScope()
      expect(scope.active).toBe(true)
      expect(scope.paused).toBe(false)
    })

    it('runs function within scope', () => {
      const scope = effectScope()
      let ran = false

      const result = scope.run(() => {
        ran = true
        return 42
      })

      expect(ran).toBe(true)
      expect(result).toBe(42)
    })

    it('tracks effects created within run()', () => {
      const count = signal(0)
      let effectRuns = 0

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          count.value
          effectRuns++
        })
      })
      flushSync()
      expect(effectRuns).toBe(1)

      count.value = 1
      flushSync()
      expect(effectRuns).toBe(2)

      scope.stop()

      count.value = 2
      flushSync()
      // Effect should not run after stop
      expect(effectRuns).toBe(2)
    })

    it('returns undefined when running on stopped scope', () => {
      const scope = effectScope()
      scope.stop()

      const result = scope.run(() => 42)
      expect(result).toBeUndefined()
    })
  })

  describe('stop()', () => {
    it('disposes all tracked effects', () => {
      const count = signal(0)
      const runs: string[] = []

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          count.value
          runs.push('effect1')
        })
        effect(() => {
          count.value
          runs.push('effect2')
        })
      })
      flushSync()
      expect(runs).toEqual(['effect1', 'effect2'])
      runs.length = 0

      scope.stop()

      count.value = 1
      flushSync()
      // No effects should run
      expect(runs).toEqual([])
    })

    it('marks scope as inactive', () => {
      const scope = effectScope()
      expect(scope.active).toBe(true)

      scope.stop()
      expect(scope.active).toBe(false)
    })

    it('is idempotent (can be called multiple times)', () => {
      const scope = effectScope()
      scope.stop()
      scope.stop() // Should not throw
      expect(scope.active).toBe(false)
    })
  })

  describe('pause() and resume()', () => {
    it('pauses effects from running', () => {
      const count = signal(0)
      let effectRuns = 0

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          count.value
          effectRuns++
        })
      })
      flushSync()
      expect(effectRuns).toBe(1)

      scope.pause()
      expect(scope.paused).toBe(true)

      count.value = 1
      flushSync()
      // Effect should not run while paused
      expect(effectRuns).toBe(1)
    })

    it('resumes effects and runs pending updates', () => {
      const count = signal(0)
      let effectRuns = 0
      let lastSeen = -1

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          lastSeen = count.value
          effectRuns++
        })
      })
      flushSync()
      expect(effectRuns).toBe(1)
      expect(lastSeen).toBe(0)

      scope.pause()

      count.value = 1
      count.value = 2
      count.value = 3
      flushSync()
      expect(effectRuns).toBe(1) // Still paused

      scope.resume()
      flushSync()
      expect(effectRuns).toBe(2) // Ran once after resume
      expect(lastSeen).toBe(3) // Sees latest value
    })

    it('pause/resume is idempotent', () => {
      const scope = effectScope()

      scope.pause()
      scope.pause() // Should not throw
      expect(scope.paused).toBe(true)

      scope.resume()
      scope.resume() // Should not throw
      expect(scope.paused).toBe(false)
    })

    it('cannot pause/resume stopped scope', () => {
      const count = signal(0)
      let effectRuns = 0

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          count.value
          effectRuns++
        })
      })
      flushSync()

      scope.stop()
      scope.pause() // Should have no effect
      scope.resume() // Should have no effect

      count.value = 1
      flushSync()
      expect(effectRuns).toBe(1) // Still just initial run
    })
  })

  describe('onScopeDispose()', () => {
    it('runs cleanup when scope stops', () => {
      let cleanedUp = false

      const scope = effectScope()
      scope.run(() => {
        onScopeDispose(() => {
          cleanedUp = true
        })
      })

      expect(cleanedUp).toBe(false)
      scope.stop()
      expect(cleanedUp).toBe(true)
    })

    it('runs multiple cleanups in order', () => {
      const order: number[] = []

      const scope = effectScope()
      scope.run(() => {
        onScopeDispose(() => order.push(1))
        onScopeDispose(() => order.push(2))
        onScopeDispose(() => order.push(3))
      })

      scope.stop()
      expect(order).toEqual([1, 2, 3])
    })

    it('silently ignores cleanup errors', () => {
      let secondRan = false

      const scope = effectScope()
      scope.run(() => {
        onScopeDispose(() => {
          throw new Error('Cleanup error')
        })
        onScopeDispose(() => {
          secondRan = true
        })
      })

      // Should not throw
      scope.stop()
      expect(secondRan).toBe(true)
    })

    it('warns when called outside scope', () => {
      const originalWarn = console.warn
      let warnCalled = false
      console.warn = () => { warnCalled = true }

      onScopeDispose(() => {})

      expect(warnCalled).toBe(true)
      console.warn = originalWarn
    })
  })

  describe('getCurrentScope()', () => {
    it('returns null outside scope', () => {
      expect(getCurrentScope()).toBeNull()
    })

    it('returns current scope inside run()', () => {
      const scope = effectScope()
      let insideScope: ReturnType<typeof getCurrentScope> = null

      scope.run(() => {
        insideScope = getCurrentScope()
      })

      expect(insideScope).toBe(scope)
    })

    it('returns null after run() completes', () => {
      const scope = effectScope()
      scope.run(() => {})

      expect(getCurrentScope()).toBeNull()
    })
  })

  describe('nested scopes', () => {
    it('child scope is collected by parent', () => {
      const count = signal(0)
      let parentEffectRuns = 0
      let childEffectRuns = 0

      const parent = effectScope()
      parent.run(() => {
        effect(() => {
          count.value
          parentEffectRuns++
        })

        const child = effectScope()
        child.run(() => {
          effect(() => {
            count.value
            childEffectRuns++
          })
        })
      })
      flushSync()

      expect(parentEffectRuns).toBe(1)
      expect(childEffectRuns).toBe(1)

      // Stopping parent should also stop child
      parent.stop()

      count.value = 1
      flushSync()

      expect(parentEffectRuns).toBe(1)
      expect(childEffectRuns).toBe(1)
    })

    it('detached scope is not collected by parent', () => {
      const count = signal(0)
      let childEffectRuns = 0

      const parent = effectScope()
      let child: ReturnType<typeof effectScope>

      parent.run(() => {
        child = effectScope(true) // Detached
        child.run(() => {
          effect(() => {
            count.value
            childEffectRuns++
          })
        })
      })
      flushSync()

      expect(childEffectRuns).toBe(1)

      // Stopping parent should NOT stop detached child
      parent.stop()

      count.value = 1
      flushSync()

      expect(childEffectRuns).toBe(2)

      // Must stop detached child manually
      child!.stop()
    })

    it('pausing parent pauses children', () => {
      const count = signal(0)
      let childEffectRuns = 0

      const parent = effectScope()
      parent.run(() => {
        const child = effectScope()
        child.run(() => {
          effect(() => {
            count.value
            childEffectRuns++
          })
        })
      })
      flushSync()
      expect(childEffectRuns).toBe(1)

      parent.pause()

      count.value = 1
      flushSync()
      expect(childEffectRuns).toBe(1) // Child also paused

      parent.resume()
      flushSync()
      expect(childEffectRuns).toBe(2) // Child also resumed
    })
  })

  describe('integration', () => {
    it('works with complex reactive chains', () => {
      const a = signal(1)
      const b = signal(2)
      let effectRuns = 0
      let lastSum = 0

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          lastSum = a.value + b.value
          effectRuns++
        })
      })
      flushSync()

      expect(effectRuns).toBe(1)
      expect(lastSum).toBe(3)

      a.value = 10
      flushSync()
      expect(effectRuns).toBe(2)
      expect(lastSum).toBe(12)

      scope.pause()
      a.value = 20
      b.value = 30
      flushSync()
      expect(effectRuns).toBe(2) // Paused

      scope.resume()
      flushSync()
      expect(effectRuns).toBe(3)
      expect(lastSum).toBe(50)

      scope.stop()
      a.value = 100
      flushSync()
      expect(effectRuns).toBe(3) // Stopped
    })

    it('cleanup runs before effect re-runs', () => {
      const count = signal(0)
      const order: string[] = []

      const scope = effectScope()
      scope.run(() => {
        effect(() => {
          const val = count.value
          order.push(`effect:${val}`)
          return () => order.push(`cleanup:${val}`)
        })
      })
      flushSync()

      expect(order).toEqual(['effect:0'])

      count.value = 1
      flushSync()

      expect(order).toEqual(['effect:0', 'cleanup:0', 'effect:1'])

      scope.stop()
      expect(order).toEqual(['effect:0', 'cleanup:0', 'effect:1', 'cleanup:1'])
    })
  })
})
