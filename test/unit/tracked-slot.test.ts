// ============================================================================
// @rlabs-inc/signals - TrackedSlotArray Tests
// ============================================================================

import { describe, test, expect } from 'bun:test'
import {
  trackedSlotArray,
  ReactiveSet,
  signal,
  effect,
  flushSync,
} from '../../src/index.js'

describe('trackedSlotArray', () => {
  describe('dirty tracking', () => {
    test('marks index dirty on setSource', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      expect(dirty.size).toBe(0)
      
      arr.setSource(5, signal(42))
      
      expect(dirty.size).toBe(1)
      expect(dirty.has(5)).toBe(true)
    })

    test('marks index dirty on setValue', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      arr.setValue(3, 99)
      
      expect(dirty.size).toBe(1)
      expect(dirty.has(3)).toBe(true)
    })

    test('does not duplicate dirty indices', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      arr.setSource(0, 1)
      arr.setSource(0, 2)
      arr.setSource(0, 3)
      
      expect(dirty.size).toBe(1)  // Still just one entry
      expect(dirty.has(0)).toBe(true)
    })

    test('tracks multiple indices', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray('', dirty)
      
      arr.setSource(0, 'a')
      arr.setSource(5, 'b')
      arr.setSource(10, 'c')
      
      expect(dirty.size).toBe(3)
      expect(Array.from(dirty).sort((a, b) => a - b)).toEqual([0, 5, 10])
    })

    test('can clear dirty set', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      arr.setSource(0, 1)
      arr.setSource(1, 2)
      expect(dirty.size).toBe(2)
      
      dirty.clear()
      expect(dirty.size).toBe(0)
    })
  })

  describe('reactivity', () => {
    test('dirty set is reactive', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      const sizes: number[] = []
      
      effect(() => {
        sizes.push(dirty.size)
      })
      
      flushSync()
      expect(sizes).toEqual([0])
      
      arr.setSource(0, 42)
      flushSync()
      expect(sizes).toEqual([0, 1])
      
      arr.setSource(1, 99)
      flushSync()
      expect(sizes).toEqual([0, 1, 2])
      
      dirty.clear()
      flushSync()
      expect(sizes).toEqual([0, 1, 2, 0])
    })

    test('can iterate dirty indices', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      let indices: number[] = []
      
      effect(() => {
        indices = Array.from(dirty).sort((a, b) => a - b)
      })
      
      flushSync()
      expect(indices).toEqual([])
      
      arr.setSource(5, 1)
      arr.setSource(3, 2)
      arr.setSource(1, 3)
      
      flushSync()
      expect(indices).toEqual([1, 3, 5])
    })

    test('per-index dirty tracking', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      let has5 = false
      
      effect(() => {
        has5 = dirty.has(5)
      })
      
      flushSync()
      expect(has5).toBe(false)
      
      arr.setSource(5, 42)
      flushSync()
      expect(has5).toBe(true)
      
      // Different index shouldn't affect
      arr.setSource(10, 99)
      flushSync()
      expect(has5).toBe(true)  // Still true
    })
  })

  describe('SlotArray behavior', () => {
    test('still works as normal SlotArray', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray('default', dirty)
      
      expect(arr[0]).toBe('default')
      expect(arr.length).toBe(1)
      
      arr.setSource(5, 'hello')
      expect(arr[5]).toBe('hello')
      expect(arr.length).toBe(6)
    })

    test('tracks signal changes', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      const sig = signal(42)
      
      arr.setSource(0, sig)
      
      const values: number[] = []
      effect(() => {
        values.push(arr[0])
      })
      
      flushSync()
      expect(values).toEqual([42])
      
      sig.value = 99
      flushSync()
      expect(values).toEqual([42, 99])
    })

    test('supports getters', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray('', dirty)
      const count = signal(5)
      
      arr.setSource(0, () => `Count: ${count.value}`)
      
      expect(arr[0]).toBe('Count: 5')
      
      count.value = 10
      expect(arr[0]).toBe('Count: 10')
    })

    test('setValue writes through to signal', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      const sig = signal(42)
      
      arr.setSource(0, sig)
      
      arr.setValue(0, 99)
      
      expect(sig.value).toBe(99)
      expect(arr[0]).toBe(99)
      expect(dirty.has(0)).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('works with undefined default', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray<string | undefined>(undefined, dirty)
      
      expect(arr[0]).toBe(undefined)
      
      arr.setSource(0, 'value')
      expect(arr[0]).toBe('value')
      expect(dirty.has(0)).toBe(true)
    })

    test('works with null default', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray<string | null>(null, dirty)
      
      expect(arr[0]).toBe(null)
      
      arr.setSource(0, 'value')
      expect(arr[0]).toBe('value')
    })

    test('works with 0 default', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(0, dirty)
      
      expect(arr[0]).toBe(0)
      
      arr.setValue(0, 42)
      expect(arr[0]).toBe(42)
    })

    test('works with empty string default', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray('', dirty)
      
      expect(arr[0]).toBe('')
      
      arr.setValue(0, 'hello')
      expect(arr[0]).toBe('hello')
    })

    test('works with false default', () => {
      const dirty = new ReactiveSet<number>()
      const arr = trackedSlotArray(false, dirty)
      
      expect(arr[0]).toBe(false)
      
      arr.setValue(0, true)
      expect(arr[0]).toBe(true)
    })
  })

  describe('typical use case - incremental computation', () => {
    test('skip computation when nothing changed', () => {
      const dirty = new ReactiveSet<number>()
      const values = trackedSlotArray(0, dirty)
      
      let computeCount = 0
      let totalSum = 0  // Accumulated total
      
      const result = signal(0)
      
      effect(() => {
        const changed = Array.from(dirty)
        
        if (changed.length === 0) {
          // Fast path: nothing changed, return cached
          result.value = totalSum
          return
        }
        
        // Slow path: process dirty indices and add to total
        computeCount++
        for (const idx of changed) {
          totalSum += values[idx]
        }
        result.value = totalSum
        
        dirty.clear()
      })
      
      flushSync()
      expect(computeCount).toBe(0)  // No dirty indices, no computation
      
      // Make a change
      values.setSource(0, 5)
      flushSync()
      expect(computeCount).toBe(1)
      expect(result.value).toBe(5)
      
      // No change - should skip computation
      flushSync()
      expect(computeCount).toBe(1)  // Still 1, didn't run again
      
      // Another change
      values.setSource(1, 10)
      flushSync()
      expect(computeCount).toBe(2)
      expect(result.value).toBe(15)  // 5 + 10
    })

    test('process only dirty subset', () => {
      const dirty = new ReactiveSet<number>()
      const values = trackedSlotArray(0, dirty)
      
      // Set up 1000 values
      for (let i = 0; i < 1000; i++) {
        values.setSource(i, i)
      }
      dirty.clear()  // Clear initial dirty state
      
      const processedIndices: number[] = []
      
      effect(() => {
        const changed = Array.from(dirty)
        
        for (const idx of changed) {
          processedIndices.push(idx)
          // Process values[idx]
        }
        
        dirty.clear()
      })
      
      flushSync()
      expect(processedIndices).toEqual([])
      
      // Change only 3 values
      values.setValue(5, 555)
      values.setValue(100, 1000)
      values.setValue(500, 5000)
      
      flushSync()
      expect(processedIndices.sort((a, b) => a - b)).toEqual([5, 100, 500])
      // Only 3 processed, not 1000!
    })
  })
})
