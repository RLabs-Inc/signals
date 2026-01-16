import { describe, it, expect } from 'bun:test'
import { signal, createSelector, effect, derived, flushSync, batch } from '../../src/index.js'

describe('createSelector', () => {
  describe('basic functionality', () => {
    it('returns correct selection state', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      expect(isSelected(1)).toBe(true)
      expect(isSelected(2)).toBe(false)
      expect(isSelected(3)).toBe(false)
    })

    it('updates when selection changes', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      expect(isSelected(1)).toBe(true)
      expect(isSelected(2)).toBe(false)

      selectedId.value = 2
      flushSync()

      expect(isSelected(1)).toBe(false)
      expect(isSelected(2)).toBe(true)
    })
  })

  describe('O(2) optimization', () => {
    it('only runs affected effects when selection changes', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []

      // Create effects for items 1-5
      const disposers = [1, 2, 3, 4, 5].map(id =>
        effect(() => {
          isSelected(id)
          runs.push(id)
        })
      )
      flushSync()

      // All 5 should run initially
      expect(runs).toEqual([1, 2, 3, 4, 5])
      runs.length = 0

      // Change selection 1 -> 2
      selectedId.value = 2
      flushSync()

      // Only items 1 and 2 should run (O(2) not O(n))
      expect(runs.sort()).toEqual([1, 2])
      runs.length = 0

      // Change selection 2 -> 3
      selectedId.value = 3
      flushSync()

      // Only items 2 and 3 should run
      expect(runs.sort()).toEqual([2, 3])

      // Cleanup
      disposers.forEach(d => d())
    })

    it('does not run any effects when value unchanged', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []

      const disposers = [1, 2, 3].map(id =>
        effect(() => {
          isSelected(id)
          runs.push(id)
        })
      )
      flushSync()
      runs.length = 0

      // Set to same value
      selectedId.value = 1
      flushSync()

      // No effects should run
      expect(runs).toEqual([])

      disposers.forEach(d => d())
    })

    it('handles selecting previously unsubscribed key', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []

      // Only subscribe to items 1-3
      const disposers = [1, 2, 3].map(id =>
        effect(() => {
          isSelected(id)
          runs.push(id)
        })
      )
      flushSync()
      runs.length = 0

      // Select item 5 (not subscribed)
      selectedId.value = 5
      flushSync()

      // Only item 1 should run (was selected, now not)
      expect(runs).toEqual([1])

      disposers.forEach(d => d())
    })
  })

  describe('custom comparison function', () => {
    it('uses custom function for matching', () => {
      const selected = signal({ type: 'user', id: 1 })
      const isSelected = createSelector(
        () => selected.value,
        (key: number, value) => value.id === key
      )

      expect(isSelected(1)).toBe(true)
      expect(isSelected(2)).toBe(false)

      selected.value = { type: 'user', id: 2 }
      flushSync()

      expect(isSelected(1)).toBe(false)
      expect(isSelected(2)).toBe(true)
    })

    it('handles complex key types', () => {
      interface Item {
        category: string
        id: number
      }

      const selected = signal<Item>({ category: 'A', id: 1 })
      const isSelected = createSelector(
        () => selected.value,
        (key: string, value) => `${value.category}-${value.id}` === key
      )

      expect(isSelected('A-1')).toBe(true)
      expect(isSelected('B-2')).toBe(false)

      selected.value = { category: 'B', id: 2 }
      flushSync()

      expect(isSelected('A-1')).toBe(false)
      expect(isSelected('B-2')).toBe(true)
    })
  })

  describe('with deriveds', () => {
    it('works inside derived computations', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      const status1 = derived(() => isSelected(1) ? 'selected' : 'not')
      const status2 = derived(() => isSelected(2) ? 'selected' : 'not')

      expect(status1.value).toBe('selected')
      expect(status2.value).toBe('not')

      selectedId.value = 2
      flushSync()

      expect(status1.value).toBe('not')
      expect(status2.value).toBe('selected')
    })
  })

  describe('cleanup and memory', () => {
    it('cleans up destroyed effects', () => {
      const selectedId = signal(1)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []

      // Create and immediately dispose effect for item 1
      const dispose1 = effect(() => {
        isSelected(1)
        runs.push(1)
      })
      flushSync()
      dispose1()

      // Create effect for item 2
      const dispose2 = effect(() => {
        isSelected(2)
        runs.push(2)
      })
      flushSync()
      runs.length = 0

      // Change selection - destroyed effect should not run
      selectedId.value = 2
      flushSync()

      // Only item 2's effect should run (item 1's was destroyed)
      expect(runs).toEqual([2])

      dispose2()
    })

    it('handles many subscribers efficiently', () => {
      const selectedId = signal(0)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []

      // Create 100 effects
      const disposers = Array.from({ length: 100 }, (_, i) =>
        effect(() => {
          isSelected(i)
          runs.push(i)
        })
      )
      flushSync()
      runs.length = 0

      // Select item 50
      selectedId.value = 50
      flushSync()

      // Only items 0 and 50 should run
      expect(runs.sort((a, b) => a - b)).toEqual([0, 50])

      disposers.forEach(d => d())
    })
  })

  describe('edge cases', () => {
    it('handles null/undefined selection', () => {
      const selected = signal<number | null>(null)
      const isSelected = createSelector(() => selected.value)

      expect(isSelected(null)).toBe(true)
      expect(isSelected(1)).toBe(false)

      selected.value = 1
      flushSync()

      expect(isSelected(null)).toBe(false)
      expect(isSelected(1)).toBe(true)
    })

    it('runs effects synchronously for each selection change', () => {
      const selectedId = signal(0)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []
      const disposers = [0, 1, 2, 3].map(id =>
        effect(() => {
          isSelected(id)
          runs.push(id)
        })
      )
      flushSync()
      runs.length = 0

      // Each write triggers effects synchronously (createSelector uses effect.sync internally)
      selectedId.value = 1  // 0 deselected, 1 selected
      selectedId.value = 2  // 1 deselected, 2 selected
      selectedId.value = 3  // 2 deselected, 3 selected

      // All affected effects ran
      expect(runs.sort()).toEqual([0, 1, 1, 2, 2, 3])

      disposers.forEach(d => d())
    })

    it('coalesces rapid changes with batch()', () => {
      const selectedId = signal(0)
      const isSelected = createSelector(() => selectedId.value)

      const runs: number[] = []
      const disposers = [0, 1, 2, 3].map(id =>
        effect(() => {
          isSelected(id)
          runs.push(id)
        })
      )
      flushSync()
      runs.length = 0

      // Batch coalesces writes - only final state triggers effects
      batch(() => {
        selectedId.value = 1
        selectedId.value = 2
        selectedId.value = 3
      })
      flushSync()  // Flush deferred effects

      // Only effects for 0 (was selected) and 3 (now selected) run
      expect(runs.sort()).toEqual([0, 3])

      disposers.forEach(d => d())
    })
  })
})
