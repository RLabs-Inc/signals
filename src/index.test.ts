// ============================================================================
// @rlabs-inc/signals - Test Suite
// ============================================================================

import { describe, test, expect } from 'bun:test'
import {
  signal,
  effect,
  derived,
  batch,
  untrack,
  state,
  toRaw,
  isReactive,
  ReactiveMap,
  ReactiveSet,
  reactiveArray,
  watch,
  readonly,
  peek,
} from './index'

describe('signal', () => {
  test('creates a signal with initial value', () => {
    const count = signal(0)
    expect(count.value).toBe(0)
  })

  test('updates value', () => {
    const count = signal(0)
    count.value = 5
    expect(count.value).toBe(5)
  })

  test('does not trigger if value is the same', () => {
    const count = signal(0)
    let runs = 0

    effect(() => {
      count.value
      runs++
    })

    expect(runs).toBe(1)
    count.value = 0 // Same value
    expect(runs).toBe(1)
  })

  test('supports custom equality', () => {
    const obj = signal({ x: 1 }, { equals: (a, b) => a.x === b.x })
    let runs = 0

    effect(() => {
      obj.value
      runs++
    })

    expect(runs).toBe(1)
    obj.value = { x: 1 } // Same x value
    expect(runs).toBe(1) // Should not trigger
    obj.value = { x: 2 } // Different x value
    expect(runs).toBe(2)
  })

  test('is deeply reactive for objects', () => {
    const user = signal({ name: 'John', address: { city: 'NYC' } })
    let runs = 0
    let observedCity = ''

    effect(() => {
      observedCity = user.value.address.city
      runs++
    })

    expect(runs).toBe(1)
    expect(observedCity).toBe('NYC')

    user.value.address.city = 'LA'
    expect(runs).toBe(2)
    expect(observedCity).toBe('LA')
  })

  test('is deeply reactive for nested arrays', () => {
    const data = signal([[1, 2], [3, 4]])
    let runs = 0
    let observed = 0

    effect(() => {
      observed = data.value[0][1]
      runs++
    })

    expect(runs).toBe(1)
    expect(observed).toBe(2)

    data.value[0][1] = 99
    expect(runs).toBe(2)
    expect(observed).toBe(99)
  })

  test('is deeply reactive for arrays of objects', () => {
    const items = signal([
      { name: 'A', tags: ['x', 'y'] },
      { name: 'B', tags: ['z'] },
    ])
    let runs = 0

    effect(() => {
      items.value[0].tags[0]
      runs++
    })

    expect(runs).toBe(1)

    items.value[0].tags[0] = 'modified'
    expect(runs).toBe(2)
  })

  test('deeply reactive signal with push on nested arrays', () => {
    const data = signal({ items: [1, 2, 3] })
    let runs = 0
    let length = 0

    effect(() => {
      length = data.value.items.length
      runs++
    })

    expect(runs).toBe(1)
    expect(length).toBe(3)

    data.value.items.push(4)
    expect(runs).toBe(2)
    expect(length).toBe(4)
  })

  test('nightmare deep nesting test', () => {
    const nightmare = signal({
      level1: [
        {
          level2: [
            [
              {
                level3: {
                  items: [
                    { nested: [['a', 'b'], ['c', 'd'], ['e', 'f']] }
                  ]
                }
              }
            ]
          ]
        }
      ]
    })

    let runs = 0
    let observed = ''

    effect(() => {
      observed = nightmare.value.level1[0].level2[0][0].level3.items[0].nested[2][1]
      runs++
    })

    expect(runs).toBe(1)
    expect(observed).toBe('f')

    nightmare.value.level1[0].level2[0][0].level3.items[0].nested[2][1] = 'MUTATED'
    expect(runs).toBe(2)
    expect(observed).toBe('MUTATED')
  })
})

describe('effect', () => {
  test('runs immediately', () => {
    let ran = false
    effect(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  test('re-runs when dependency changes', () => {
    const count = signal(0)
    let observed = -1

    effect(() => {
      observed = count.value
    })

    expect(observed).toBe(0)
    count.value = 5
    expect(observed).toBe(5)
  })

  test('supports cleanup', () => {
    const count = signal(0)
    let cleanups = 0

    effect(() => {
      count.value
      return () => {
        cleanups++
      }
    })

    expect(cleanups).toBe(0)
    count.value = 1
    expect(cleanups).toBe(1)
    count.value = 2
    expect(cleanups).toBe(2)
  })

  test('dispose stops the effect', () => {
    const count = signal(0)
    let runs = 0

    const dispose = effect(() => {
      count.value
      runs++
    })

    expect(runs).toBe(1)
    count.value = 1
    expect(runs).toBe(2)

    dispose()
    count.value = 2
    expect(runs).toBe(2) // Should not increase
  })

  test('nested effects work correctly', () => {
    const a = signal(1)
    const b = signal(2)
    let innerRuns = 0
    let outerRuns = 0

    effect(() => {
      a.value
      outerRuns++

      effect(() => {
        b.value
        innerRuns++
      })
    })

    expect(outerRuns).toBe(1)
    expect(innerRuns).toBe(1)

    b.value = 3
    expect(innerRuns).toBe(2)
    expect(outerRuns).toBe(1) // Outer should not re-run
  })
})

describe('derived', () => {
  test('computes initial value', () => {
    const count = signal(5)
    const doubled = derived(() => count.value * 2)
    expect(doubled.value).toBe(10)
  })

  test('updates when dependencies change', () => {
    const count = signal(5)
    const doubled = derived(() => count.value * 2)

    count.value = 10
    expect(doubled.value).toBe(20)
  })

  test('is lazy - only computes when read', () => {
    const count = signal(0)
    let computations = 0

    const doubled = derived(() => {
      computations++
      return count.value * 2
    })

    expect(computations).toBe(0)
    doubled.value // First read
    expect(computations).toBe(1)
    doubled.value // Second read (cached)
    expect(computations).toBe(1)

    count.value = 5
    expect(computations).toBe(1) // Still lazy
    doubled.value // Read after change
    expect(computations).toBe(2)
  })

  test('chained deriveds work', () => {
    const count = signal(2)
    const doubled = derived(() => count.value * 2)
    const quadrupled = derived(() => doubled.value * 2)

    expect(quadrupled.value).toBe(8)
    count.value = 3
    expect(quadrupled.value).toBe(12)
  })

  test('derived.by is an alias', () => {
    const count = signal(5)
    const doubled = derived.by(() => count.value * 2)
    expect(doubled.value).toBe(10)
  })
})

describe('batch', () => {
  test('batches multiple updates', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0

    effect(() => {
      a.value + b.value
      runs++
    })

    expect(runs).toBe(1)

    batch(() => {
      a.value = 10
      b.value = 20
    })

    expect(runs).toBe(2) // Only one additional run, not two
  })

  test('nested batches work', () => {
    const count = signal(0)
    let runs = 0

    effect(() => {
      count.value
      runs++
    })

    expect(runs).toBe(1)

    batch(() => {
      count.value = 1
      batch(() => {
        count.value = 2
        count.value = 3
      })
      count.value = 4
    })

    expect(runs).toBe(2)
    expect(count.value).toBe(4)
  })
})

describe('untrack', () => {
  test('reads without creating dependency', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0

    effect(() => {
      a.value // This creates a dependency
      untrack(() => b.value) // This does not
      runs++
    })

    expect(runs).toBe(1)

    a.value = 10
    expect(runs).toBe(2)

    b.value = 20
    expect(runs).toBe(2) // Should not re-run
  })
})

describe('state (deep reactivity)', () => {
  test('makes objects reactive', () => {
    const user = state({ name: 'John', age: 30 })
    let observed = ''

    effect(() => {
      observed = user.name
    })

    expect(observed).toBe('John')
    user.name = 'Jane'
    expect(observed).toBe('Jane')
  })

  test('deep nested objects are reactive', () => {
    const data = state({
      user: {
        address: {
          city: 'NYC',
        },
      },
    })
    let observed = ''

    effect(() => {
      observed = data.user.address.city
    })

    expect(observed).toBe('NYC')
    data.user.address.city = 'LA'
    expect(observed).toBe('LA')
  })

  test('arrays are reactive', () => {
    const data = state({ items: [1, 2, 3] })
    let observed: number[] = []

    effect(() => {
      observed = [...data.items]
    })

    expect(observed).toEqual([1, 2, 3])
    data.items.push(4)
    expect(observed).toEqual([1, 2, 3, 4])
  })

  test('isReactive works', () => {
    const obj = state({ x: 1 })
    const plain = { x: 1 }

    expect(isReactive(obj)).toBe(true)
    expect(isReactive(plain)).toBe(false)
  })

  test('toRaw returns original object', () => {
    const original = { x: 1 }
    const reactive = state(original)

    expect(toRaw(reactive)).toBe(original)
  })
})

describe('ReactiveMap', () => {
  test('basic operations work', () => {
    const map = new ReactiveMap<string, number>()

    map.set('a', 1)
    expect(map.get('a')).toBe(1)
    expect(map.has('a')).toBe(true)
    expect(map.size).toBe(1)

    map.delete('a')
    expect(map.has('a')).toBe(false)
    expect(map.size).toBe(0)
  })

  test('triggers effects on set', () => {
    const map = new ReactiveMap<string, number>()
    let observed: number | undefined

    effect(() => {
      observed = map.get('key')
    })

    expect(observed).toBe(undefined)
    map.set('key', 42)
    expect(observed).toBe(42)
  })

  test('triggers effects on delete', () => {
    const map = new ReactiveMap([['key', 42]])
    let hasKey = false

    effect(() => {
      hasKey = map.has('key')
    })

    expect(hasKey).toBe(true)
    map.delete('key')
    expect(hasKey).toBe(false)
  })

  test('triggers effects on clear', () => {
    const map = new ReactiveMap([['a', 1], ['b', 2]])
    let size = 0

    effect(() => {
      size = map.size
    })

    expect(size).toBe(2)
    map.clear()
    expect(size).toBe(0)
  })
})

describe('ReactiveSet', () => {
  test('basic operations work', () => {
    const set = new ReactiveSet<string>()

    set.add('a')
    expect(set.has('a')).toBe(true)
    expect(set.size).toBe(1)

    set.delete('a')
    expect(set.has('a')).toBe(false)
    expect(set.size).toBe(0)
  })

  test('triggers effects on add', () => {
    const set = new ReactiveSet<string>()
    let hasItem = false

    effect(() => {
      hasItem = set.has('item')
    })

    expect(hasItem).toBe(false)
    set.add('item')
    expect(hasItem).toBe(true)
  })

  test('triggers effects on delete', () => {
    const set = new ReactiveSet(['item'])
    let size = 0

    effect(() => {
      size = set.size
    })

    expect(size).toBe(1)
    set.delete('item')
    expect(size).toBe(0)
  })
})

describe('reactiveArray', () => {
  test('basic operations work', () => {
    const arr = reactiveArray([1, 2, 3])

    expect(arr.length).toBe(3)
    expect(arr[0]).toBe(1)

    arr.push(4)
    expect(arr.length).toBe(4)
    expect(arr[3]).toBe(4)
  })

  test('index assignment triggers effects', () => {
    const arr = reactiveArray([1, 2, 3])
    let first = 0

    effect(() => {
      first = arr[0]
    })

    expect(first).toBe(1)
    arr[0] = 10
    expect(first).toBe(10)
  })

  test('push triggers effects', () => {
    const arr = reactiveArray<number>([])
    let length = 0

    effect(() => {
      length = arr.length
    })

    expect(length).toBe(0)
    arr.push(1)
    expect(length).toBe(1)
    arr.push(2, 3)
    expect(length).toBe(3)
  })

  test('pop triggers effects', () => {
    const arr = reactiveArray([1, 2, 3])
    let length = 0

    effect(() => {
      length = arr.length
    })

    expect(length).toBe(3)
    arr.pop()
    expect(length).toBe(2)
  })
})

describe('watch', () => {
  test('calls callback on change', () => {
    const count = signal(0)
    let changes: [number, number | undefined][] = []

    watch(
      () => count.value,
      (newVal, oldVal) => {
        changes.push([newVal, oldVal])
      }
    )

    expect(changes).toEqual([])

    count.value = 1
    expect(changes).toEqual([[1, 0]])

    count.value = 2
    expect(changes).toEqual([[1, 0], [2, 1]])
  })

  test('immediate option calls callback immediately', () => {
    const count = signal(5)
    let changes: [number, number | undefined][] = []

    watch(
      () => count.value,
      (newVal, oldVal) => {
        changes.push([newVal, oldVal])
      },
      { immediate: true }
    )

    expect(changes).toEqual([[5, undefined]])
  })
})

describe('readonly', () => {
  test('creates read-only view', () => {
    const count = signal(0)
    const ro = readonly(count)

    expect(ro.value).toBe(0)

    count.value = 5
    expect(ro.value).toBe(5)

    // TypeScript should prevent this, but at runtime:
    // @ts-expect-error
    expect(() => (ro.value = 10)).toThrow()
  })
})

describe('peek', () => {
  test('reads without tracking', () => {
    const count = signal(0)
    let runs = 0

    effect(() => {
      peek(() => count.value)
      runs++
    })

    expect(runs).toBe(1)
    count.value = 1
    expect(runs).toBe(1) // Should not re-run
  })
})

describe('complex scenarios', () => {
  test('todo app pattern', () => {
    const todos = state<{ id: number; text: string; done: boolean }[]>([])
    const filter = signal<'all' | 'active' | 'done'>('all')

    const filteredTodos = derived(() => {
      const f = filter.value
      if (f === 'all') return todos
      return todos.filter((t) => (f === 'done' ? t.done : !t.done))
    })

    const activeCount = derived(() => todos.filter((t) => !t.done).length)

    let observedFiltered: any[] = []
    let observedCount = 0

    effect(() => {
      observedFiltered = [...filteredTodos.value]
    })

    effect(() => {
      observedCount = activeCount.value
    })

    // Add todos
    todos.push({ id: 1, text: 'Learn signals', done: false })
    todos.push({ id: 2, text: 'Build app', done: false })

    expect(observedFiltered.length).toBe(2)
    expect(observedCount).toBe(2)

    // Complete one
    todos[0].done = true
    expect(observedCount).toBe(1)

    // Filter
    filter.value = 'active'
    expect(observedFiltered.length).toBe(1)
  })

  test('nested state updates', () => {
    const app = state({
      user: {
        profile: {
          name: 'John',
          settings: {
            theme: 'light',
          },
        },
      },
    })

    let theme = ''

    effect(() => {
      theme = app.user.profile.settings.theme
    })

    expect(theme).toBe('light')
    app.user.profile.settings.theme = 'dark'
    expect(theme).toBe('dark')
  })
})

console.log('\n✅ All tests defined! Run with: bun test\n')
