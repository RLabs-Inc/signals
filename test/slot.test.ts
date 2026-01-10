// ============================================================================
// @rlabs-inc/signals - Slot Tests
// ============================================================================

import { describe, test, expect, mock } from 'bun:test'
import {
  slot,
  slotArray,
  isSlot,
  hasSlot,
  signal,
  derived,
  effect,
  flushSync,
} from '../src/index'

describe('slot', () => {
  describe('creation', () => {
    test('creates with undefined by default', () => {
      const s = slot<string>()
      expect(s.value).toBe(undefined)
    })

    test('creates with initial value', () => {
      const s = slot('hello')
      expect(s.value).toBe('hello')
    })

    test('isSlot returns true for slots', () => {
      const s = slot(42)
      expect(isSlot(s)).toBe(true)
    })

    test('isSlot returns false for non-slots', () => {
      expect(isSlot(null)).toBe(false)
      expect(isSlot(undefined)).toBe(false)
      expect(isSlot(42)).toBe(false)
      expect(isSlot('hello')).toBe(false)
      expect(isSlot({})).toBe(false)
      expect(isSlot(signal(1))).toBe(false)
    })
  })

  describe('static values', () => {
    test('holds static value', () => {
      const s = slot('hello')
      expect(s.value).toBe('hello')
    })

    test('updates static value via set()', () => {
      const s = slot('hello')
      s.set('world')
      expect(s.value).toBe('world')
    })

    test('updates static value via source setter', () => {
      const s = slot('hello')
      s.source = 'world'
      expect(s.value).toBe('world')
    })

    test('peek returns value without tracking', () => {
      const s = slot('hello')
      const calls: string[] = []

      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual(['hello'])

      // Peek shouldn't cause re-run
      const peeked = s.peek()
      expect(peeked).toBe('hello')
      flushSync()
      expect(calls).toEqual(['hello'])

      // Regular read should track
      s.set('world')
      flushSync()
      expect(calls).toEqual(['hello', 'world'])
    })
  })

  describe('signal source', () => {
    test('reads through to signal', () => {
      const sig = signal('hello')
      const s = slot<string>()
      s.source = sig

      expect(s.value).toBe('hello')

      sig.value = 'world'
      expect(s.value).toBe('world')
    })

    test('writes through to signal', () => {
      const sig = signal('hello')
      const s = slot<string>()
      s.source = sig

      s.set('world')
      expect(sig.value).toBe('world')
      expect(s.value).toBe('world')
    })

    test('tracks signal changes', () => {
      const sig = signal('hello')
      const s = slot<string>()
      s.source = sig

      const calls: string[] = []
      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual(['hello'])

      sig.value = 'world'
      flushSync()
      expect(calls).toEqual(['hello', 'world'])
    })
  })

  describe('getter source', () => {
    test('reads through to getter', () => {
      const count = signal(5)
      const s = slot<string>()
      s.source = () => `Count: ${count.value}`

      expect(s.value).toBe('Count: 5')

      count.value = 10
      expect(s.value).toBe('Count: 10')
    })

    test('tracks getter dependencies', () => {
      const count = signal(5)
      const s = slot<string>()
      s.source = () => `Count: ${count.value}`

      const calls: string[] = []
      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual(['Count: 5'])

      count.value = 10
      flushSync()
      expect(calls).toEqual(['Count: 5', 'Count: 10'])
    })

    test('throws when writing to getter', () => {
      const s = slot<string>()
      s.source = () => 'computed'

      expect(() => s.set('value')).toThrow(/Cannot write to a slot pointing to a getter/)
    })
  })

  describe('derived source', () => {
    test('reads through to derived', () => {
      const count = signal(5)
      const doubled = derived(() => count.value * 2)
      const s = slot<number>()
      s.source = doubled

      expect(s.value).toBe(10)

      count.value = 10
      expect(s.value).toBe(20)
    })

    test('tracks derived changes', () => {
      const count = signal(5)
      const doubled = derived(() => count.value * 2)
      const s = slot<number>()
      s.source = doubled

      const calls: number[] = []
      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual([10])

      count.value = 10
      flushSync()
      expect(calls).toEqual([10, 20])
    })
  })

  describe('source changes', () => {
    test('notifies when source changes', () => {
      const sig1 = signal('first')
      const sig2 = signal('second')
      const s = slot<string>()
      s.source = sig1

      const calls: string[] = []
      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual(['first'])

      // Change source to different signal
      s.source = sig2
      flushSync()
      expect(calls).toEqual(['first', 'second'])

      // Now changes to sig2 are tracked
      sig2.value = 'updated'
      flushSync()
      expect(calls).toEqual(['first', 'second', 'updated'])

      // Changes to sig1 no longer tracked (slot points elsewhere)
      sig1.value = 'ignored'
      flushSync()
      expect(calls).toEqual(['first', 'second', 'updated'])
    })

    test('notifies when switching from signal to static', () => {
      const sig = signal('signal')
      const s = slot<string>()
      s.source = sig

      const calls: string[] = []
      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual(['signal'])

      // Change to static
      s.source = 'static'
      flushSync()
      expect(calls).toEqual(['signal', 'static'])
    })

    test('notifies when switching from static to getter', () => {
      const count = signal(5)
      const s = slot<string>()
      s.source = 'static'

      const calls: string[] = []
      effect(() => {
        calls.push(s.value)
      })
      flushSync()
      expect(calls).toEqual(['static'])

      // Change to getter
      s.source = () => `Count: ${count.value}`
      flushSync()
      expect(calls).toEqual(['static', 'Count: 5'])

      // Now tracks count
      count.value = 10
      flushSync()
      expect(calls).toEqual(['static', 'Count: 5', 'Count: 10'])
    })
  })

  describe('two-way binding', () => {
    test('simulates input binding pattern', () => {
      // User's signal
      const username = signal('')

      // Component creates slot and points to user's signal
      const inputSlot = slot<string>()
      inputSlot.source = username

      // Initial display
      expect(inputSlot.value).toBe('')

      // User types (component writes to slot)
      inputSlot.set('alice')
      expect(username.value).toBe('alice')  // Written through!
      expect(inputSlot.value).toBe('alice')

      // External update to signal
      username.value = 'bob'
      expect(inputSlot.value).toBe('bob')   // Slot reflects change!
    })
  })
})

describe('slotArray', () => {
  describe('creation', () => {
    test('creates empty array', () => {
      const arr = slotArray<string>()
      expect(arr.length).toBe(0)
    })

    test('creates with default value', () => {
      const arr = slotArray<string>('default')
      arr.ensureCapacity(3)
      expect(arr[0]).toBe('default')
      expect(arr[1]).toBe('default')
      expect(arr[2]).toBe('default')
    })
  })

  describe('reading', () => {
    test('auto-expands on read', () => {
      const arr = slotArray<string>('default')
      expect(arr.length).toBe(0)

      const val = arr[5]
      expect(val).toBe('default')
      expect(arr.length).toBe(6)
    })

    test('tracks slot changes', () => {
      const arr = slotArray<string>('')
      arr.setSource(0, 'hello')

      const calls: string[] = []
      effect(() => {
        calls.push(arr[0])
      })
      flushSync()
      expect(calls).toEqual(['hello'])

      arr.setSource(0, 'world')
      flushSync()
      expect(calls).toEqual(['hello', 'world'])
    })

    test('tracks underlying signal changes', () => {
      const sig = signal('hello')
      const arr = slotArray<string>('')
      arr.setSource(0, sig)

      const calls: string[] = []
      effect(() => {
        calls.push(arr[0])
      })
      flushSync()
      expect(calls).toEqual(['hello'])

      sig.value = 'world'
      flushSync()
      expect(calls).toEqual(['hello', 'world'])
    })
  })

  describe('setSource', () => {
    test('sets static source', () => {
      const arr = slotArray<string>()
      arr.setSource(0, 'hello')
      expect(arr[0]).toBe('hello')
    })

    test('sets signal source', () => {
      const sig = signal('hello')
      const arr = slotArray<string>()
      arr.setSource(0, sig)

      expect(arr[0]).toBe('hello')
      sig.value = 'world'
      expect(arr[0]).toBe('world')
    })

    test('sets getter source', () => {
      const count = signal(5)
      const arr = slotArray<string>()
      arr.setSource(0, () => `Count: ${count.value}`)

      expect(arr[0]).toBe('Count: 5')
      count.value = 10
      expect(arr[0]).toBe('Count: 10')
    })
  })

  describe('setValue', () => {
    test('writes static value', () => {
      const arr = slotArray<string>('default')
      arr.setValue(0, 'hello')
      expect(arr[0]).toBe('hello')
    })

    test('writes through to signal', () => {
      const sig = signal('hello')
      const arr = slotArray<string>()
      arr.setSource(0, sig)

      arr.setValue(0, 'world')
      expect(sig.value).toBe('world')
      expect(arr[0]).toBe('world')
    })
  })

  describe('slot access', () => {
    test('returns raw slot', () => {
      const arr = slotArray<string>('default')
      const s = arr.slot(0)

      expect(isSlot(s)).toBe(true)
      expect(s.value).toBe('default')

      s.source = 'updated'
      expect(arr[0]).toBe('updated')
    })
  })

  describe('utility methods', () => {
    test('ensureCapacity expands array', () => {
      const arr = slotArray<number>(0)
      expect(arr.length).toBe(0)

      arr.ensureCapacity(10)
      expect(arr.length).toBe(11)
    })

    test('clear resets to default', () => {
      const arr = slotArray<string>('default')
      arr.setSource(0, 'custom')
      expect(arr[0]).toBe('custom')

      arr.clear(0)
      expect(arr[0]).toBe('default')
    })

    test('hasSlot checks existence', () => {
      const arr = slotArray<string>()
      expect(hasSlot(arr, 0)).toBe(false)

      arr.setSource(0, 'hello')
      expect(hasSlot(arr, 0)).toBe(true)
      expect(hasSlot(arr, 1)).toBe(false)
    })
  })

  describe('TUI use case simulation', () => {
    test('component → pipeline → reactivity flow', () => {
      // Simulate TUI arrays
      const textContent = slotArray<string>('')

      // User's signal (like in TUI component)
      const count = signal(0)

      // Component setup: point slot to getter
      textContent.setSource(0, () => `Count: ${count.value}`)

      // Pipeline reads (like frameBufferDerived)
      const renderCalls: string[] = []
      effect(() => {
        const content = textContent[0]
        renderCalls.push(content)
      })
      flushSync()
      expect(renderCalls).toEqual(['Count: 0'])

      // User updates count
      count.value = 5
      flushSync()
      expect(renderCalls).toEqual(['Count: 0', 'Count: 5'])

      // Change source entirely (like component re-render)
      textContent.setSource(0, 'Static text')
      flushSync()
      expect(renderCalls).toEqual(['Count: 0', 'Count: 5', 'Static text'])
    })

    test('input two-way binding flow', () => {
      // Simulate TUI arrays
      const textContent = slotArray<string>('')

      // User's signal for input value
      const username = signal('')

      // Component setup: point slot to user's signal
      textContent.setSource(0, username)

      // Pipeline reads and renders
      const displayCalls: string[] = []
      effect(() => {
        displayCalls.push(textContent[0])
      })
      flushSync()
      expect(displayCalls).toEqual([''])

      // Input handler: user types
      textContent.setValue(0, 'alice')
      expect(username.value).toBe('alice')  // Written through!
      flushSync()
      expect(displayCalls).toEqual(['', 'alice'])

      // External update (e.g., form reset)
      username.value = ''
      flushSync()
      expect(displayCalls).toEqual(['', 'alice', ''])
      expect(textContent[0]).toBe('')
    })
  })
})
