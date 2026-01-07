import { describe, it, expect } from 'bun:test'
import { signal, linkedSignal, isLinkedSignal, effect, derived, flushSync } from '../../src/index.js'

describe('linkedSignal', () => {
  describe('short form', () => {
    it('computes initial value from source', () => {
      const source = signal(10)
      const linked = linkedSignal(() => source.value * 2)

      expect(linked.value).toBe(20)
    })

    it('allows manual override', () => {
      const source = signal(10)
      const linked = linkedSignal(() => source.value * 2)

      linked.value = 100
      expect(linked.value).toBe(100)
    })

    it('resets when source changes', () => {
      const source = signal(10)
      const linked = linkedSignal(() => source.value * 2)

      linked.value = 100 // Manual override
      expect(linked.value).toBe(100)

      source.value = 20 // Source changes
      flushSync()
      expect(linked.value).toBe(40) // Reset to computed value
    })

    it('tracks source as dependency in effects', () => {
      const source = signal(1)
      const linked = linkedSignal(() => source.value)

      let effectRuns = 0
      effect(() => {
        linked.value
        effectRuns++
      })
      flushSync()
      expect(effectRuns).toBe(1)

      source.value = 2
      flushSync()
      expect(effectRuns).toBe(2)
    })

    it('triggers effects on manual write', () => {
      const source = signal(1)
      const linked = linkedSignal(() => source.value)

      let effectRuns = 0
      let lastValue = 0
      effect(() => {
        lastValue = linked.value
        effectRuns++
      })
      flushSync()
      expect(effectRuns).toBe(1)

      linked.value = 99
      flushSync()
      expect(effectRuns).toBe(2)
      expect(lastValue).toBe(99)
    })
  })

  describe('long form with source and computation', () => {
    it('provides previous value to computation', () => {
      const options = signal(['a', 'b', 'c'])
      const selected = linkedSignal({
        source: () => options.value,
        computation: (opts, prev) => {
          // Keep selection if still valid
          if (prev && opts.includes(prev.value)) {
            return prev.value
          }
          return opts[0]
        }
      })

      expect(selected.value).toBe('a')

      selected.value = 'b'
      expect(selected.value).toBe('b')

      // Change options but keep 'b' valid
      options.value = ['b', 'c', 'd']
      flushSync()
      expect(selected.value).toBe('b') // Kept because still valid

      // Change options, 'b' no longer valid
      options.value = ['x', 'y', 'z']
      flushSync()
      expect(selected.value).toBe('x') // Reset to first
    })

    it('provides previous source value', () => {
      const source = signal(1)
      let prevSourceSeen: number | undefined

      const linked = linkedSignal({
        source: () => source.value,
        computation: (src, prev) => {
          prevSourceSeen = prev?.source
          return src * 10
        }
      })

      expect(linked.value).toBe(10)
      expect(prevSourceSeen).toBeUndefined()

      source.value = 2
      flushSync()
      expect(linked.value).toBe(20)
      expect(prevSourceSeen).toBe(1)

      source.value = 3
      flushSync()
      expect(linked.value).toBe(30)
      expect(prevSourceSeen).toBe(2)
    })

    it('supports custom equality function', () => {
      const source = signal({ id: 1, name: 'Alice' })
      let computeCount = 0

      const linked = linkedSignal({
        source: () => source.value,
        computation: (src) => {
          computeCount++
          return src.name
        },
        equal: (a, b) => a === b // String equality
      })

      expect(linked.value).toBe('Alice')
      expect(computeCount).toBe(1)

      // Same name, different object - should not trigger effects
      linked.value = 'Alice'
      // Value unchanged due to equality check
    })
  })

  describe('integration with reactive system', () => {
    it('works in derived computations', () => {
      const source = signal(5)
      const linked = linkedSignal(() => source.value)
      const doubled = derived(() => linked.value * 2)

      expect(doubled.value).toBe(10)

      linked.value = 10
      expect(doubled.value).toBe(20)

      source.value = 7
      flushSync()
      expect(doubled.value).toBe(14)
    })

    it('handles nested linkedSignals', () => {
      const root = signal(1)
      const linked1 = linkedSignal(() => root.value * 2)
      const linked2 = linkedSignal(() => linked1.value * 3)

      expect(linked2.value).toBe(6) // 1 * 2 * 3

      root.value = 2
      flushSync()
      expect(linked2.value).toBe(12) // 2 * 2 * 3
    })

    it('peek returns value without tracking', () => {
      const source = signal(10)
      const linked = linkedSignal(() => source.value)

      let effectRuns = 0
      effect(() => {
        linked.peek // Peek without tracking
        effectRuns++
      })
      flushSync()
      expect(effectRuns).toBe(1)

      source.value = 20
      flushSync()
      // Effect should NOT re-run since we used peek
      expect(effectRuns).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('handles rapid source changes', () => {
      const source = signal(0)
      const linked = linkedSignal(() => source.value)

      for (let i = 1; i <= 100; i++) {
        source.value = i
      }
      flushSync()
      expect(linked.value).toBe(100)
    })

    it('handles source changing to same value', () => {
      const source = signal(5)
      const linked = linkedSignal(() => source.value)

      let effectRuns = 0
      effect(() => {
        linked.value
        effectRuns++
      })
      flushSync()
      expect(effectRuns).toBe(1)

      source.value = 5 // Same value
      flushSync()
      // Should not trigger extra effect run due to equality check
      expect(effectRuns).toBe(1)
    })

    it('manual override persists until source actually changes', () => {
      const source = signal({ id: 1 })
      const linked = linkedSignal(() => source.value.id)

      linked.value = 999
      expect(linked.value).toBe(999)

      // Mutate same object (no actual source change detected by Object.is)
      const obj = source.value
      obj.id = 2
      source.value = obj
      flushSync()

      // Since Object.is sees same reference, linked keeps override
      // This is expected behavior - use state() for deep reactivity
    })
  })

  describe('isLinkedSignal', () => {
    it('returns true for linkedSignal', () => {
      const source = signal(1)
      const linked = linkedSignal(() => source.value)

      expect(isLinkedSignal(linked)).toBe(true)
    })

    it('returns false for regular signal', () => {
      const s = signal(1)
      expect(isLinkedSignal(s)).toBe(false)
    })

    it('returns false for non-signals', () => {
      expect(isLinkedSignal(null)).toBe(false)
      expect(isLinkedSignal(undefined)).toBe(false)
      expect(isLinkedSignal(42)).toBe(false)
      expect(isLinkedSignal({ value: 1 })).toBe(false)
    })
  })
})
