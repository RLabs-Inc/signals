// ============================================================================
// @rlabs-inc/signals - Reactive Collections Tests
// ============================================================================

import { describe, it, expect } from 'bun:test'
import { effect, flushSync, ReactiveMap, ReactiveSet, ReactiveDate } from '../../src/index.js'

describe('ReactiveMap', () => {
  it('tracks get()', () => {
    const map = new ReactiveMap<string, number>()
    map.set('a', 1)

    let observed = 0

    effect(() => {
      observed = map.get('a') ?? 0
    })

    flushSync()
    expect(observed).toBe(1)

    map.set('a', 99)
    flushSync()
    expect(observed).toBe(99)
  })

  it('per-key granularity', () => {
    const map = new ReactiveMap<string, number>()
    map.set('a', 1)
    map.set('b', 2)

    let runs = 0

    effect(() => {
      map.get('a')
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    // Different key - should NOT trigger
    map.set('b', 99)
    flushSync()
    expect(runs).toBe(1)

    // Same key - should trigger
    map.set('a', 100)
    flushSync()
    expect(runs).toBe(2)
  })

  it('tracks has()', () => {
    const map = new ReactiveMap<string, number>()

    let hasKey = false

    effect(() => {
      hasKey = map.has('a')
    })

    flushSync()
    expect(hasKey).toBe(false)

    map.set('a', 1)
    flushSync()
    expect(hasKey).toBe(true)
  })

  it('tracks size', () => {
    const map = new ReactiveMap<string, number>()

    let size = 0

    effect(() => {
      size = map.size
    })

    flushSync()
    expect(size).toBe(0)

    map.set('a', 1)
    flushSync()
    expect(size).toBe(1)

    map.set('b', 2)
    flushSync()
    expect(size).toBe(2)

    map.delete('a')
    flushSync()
    expect(size).toBe(1)
  })

  it('tracks iteration', () => {
    const map = new ReactiveMap<string, number>()
    map.set('a', 1)

    let keys: string[] = []

    effect(() => {
      keys = [...map.keys()]
    })

    flushSync()
    expect(keys).toEqual(['a'])

    map.set('b', 2)
    flushSync()
    expect(keys).toEqual(['a', 'b'])
  })

  it('clear triggers updates', () => {
    const map = new ReactiveMap<string, number>()
    map.set('a', 1)
    map.set('b', 2)

    let size = 0

    effect(() => {
      size = map.size
    })

    flushSync()
    expect(size).toBe(2)

    map.clear()
    flushSync()
    expect(size).toBe(0)
  })
})

describe('ReactiveSet', () => {
  it('tracks has()', () => {
    const set = new ReactiveSet<string>()

    let hasItem = false

    effect(() => {
      hasItem = set.has('a')
    })

    flushSync()
    expect(hasItem).toBe(false)

    set.add('a')
    flushSync()
    expect(hasItem).toBe(true)
  })

  it('per-item granularity', () => {
    const set = new ReactiveSet<string>()
    set.add('a')
    set.add('b')

    let runs = 0

    effect(() => {
      set.has('a')
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    // Different item - should NOT trigger
    set.add('c')
    flushSync()
    expect(runs).toBe(1)

    // Same item (already exists) - should NOT trigger
    set.add('a')
    flushSync()
    expect(runs).toBe(1)

    // Delete the item - should trigger
    set.delete('a')
    flushSync()
    expect(runs).toBe(2)
  })

  it('tracks size', () => {
    const set = new ReactiveSet<string>()

    let size = 0

    effect(() => {
      size = set.size
    })

    flushSync()
    expect(size).toBe(0)

    set.add('a')
    flushSync()
    expect(size).toBe(1)

    set.add('b')
    flushSync()
    expect(size).toBe(2)
  })

  it('tracks iteration', () => {
    const set = new ReactiveSet<string>()
    set.add('a')

    let values: string[] = []

    effect(() => {
      values = [...set.values()]
    })

    flushSync()
    expect(values).toEqual(['a'])

    set.add('b')
    flushSync()
    expect(values).toEqual(['a', 'b'])
  })
})

describe('ReactiveDate', () => {
  it('tracks time', () => {
    const date = new ReactiveDate(2024, 0, 1) // Jan 1, 2024

    let year = 0

    effect(() => {
      year = date.getFullYear()
    })

    flushSync()
    expect(year).toBe(2024)

    date.setFullYear(2025)
    flushSync()
    expect(year).toBe(2025)
  })

  it('tracks hours', () => {
    const date = new ReactiveDate()
    date.setHours(10)

    let hours = 0

    effect(() => {
      hours = date.getHours()
    })

    flushSync()
    expect(hours).toBe(10)

    date.setHours(15)
    flushSync()
    expect(hours).toBe(15)
  })

  it('toString is reactive', () => {
    const date = new ReactiveDate(2024, 0, 1)

    let str = ''

    effect(() => {
      str = date.toISOString()
    })

    flushSync()
    expect(str).toContain('2024')

    date.setFullYear(2030)
    flushSync()
    expect(str).toContain('2030')
  })
})
