// ============================================================================
// @rlabs-inc/signals - Deep Reactivity (Proxy) Tests
// ============================================================================

import { describe, it, expect } from 'bun:test'
import { signal, effect, proxy, toRaw, isReactive, flushSync, state, bind, isBinding } from '../../src/index.js'

describe('proxy', () => {
  it('makes object reactive', () => {
    const obj = proxy({ count: 0 })
    let observed = 0

    effect(() => {
      observed = obj.count
    })

    flushSync()
    expect(observed).toBe(0)

    obj.count = 5
    flushSync()
    expect(observed).toBe(5)
  })

  it('makes nested objects reactive', () => {
    const obj = proxy({ user: { name: 'John' } })
    let observed = ''

    effect(() => {
      observed = obj.user.name
    })

    flushSync()
    expect(observed).toBe('John')

    obj.user.name = 'Jane'
    flushSync()
    expect(observed).toBe('Jane')
  })

  it('makes arrays reactive', () => {
    const arr = proxy([1, 2, 3])
    let sum = 0

    effect(() => {
      sum = arr.reduce((a, b) => a + b, 0)
    })

    flushSync()
    expect(sum).toBe(6)

    arr[0] = 10
    flushSync()
    expect(sum).toBe(15)
  })

  it('handles array push', () => {
    const arr = proxy<number[]>([1, 2])
    let length = 0

    effect(() => {
      length = arr.length
    })

    flushSync()
    expect(length).toBe(2)

    arr.push(3)
    flushSync()
    expect(length).toBe(3)
  })

  it('handles property deletion', () => {
    const obj = proxy<{ a?: number; b: number }>({ a: 1, b: 2 })
    let hasA = true

    effect(() => {
      hasA = 'a' in obj
    })

    flushSync()
    expect(hasA).toBe(true)

    delete obj.a
    flushSync()
    expect(hasA).toBe(false)
  })

  it('handles Object.keys()', () => {
    const obj = proxy<Record<string, number>>({ a: 1 })
    let keys: string[] = []

    effect(() => {
      keys = Object.keys(obj)
    })

    flushSync()
    expect(keys).toEqual(['a'])

    obj.b = 2
    flushSync()
    expect(keys).toEqual(['a', 'b'])
  })
})

describe('deep nesting', () => {
  it('handles 3 levels deep', () => {
    const obj = proxy({ a: { b: { c: 0 } } })
    let observed = 0

    effect(() => {
      observed = obj.a.b.c
    })

    flushSync()
    expect(observed).toBe(0)

    obj.a.b.c = 99
    flushSync()
    expect(observed).toBe(99)
  })

  it('handles nested arrays', () => {
    const obj = proxy({ items: [[1, 2], [3, 4]] })
    let observed = 0

    effect(() => {
      observed = obj.items[0][1]
    })

    flushSync()
    expect(observed).toBe(2)

    obj.items[0][1] = 99
    flushSync()
    expect(observed).toBe(99)
  })

  it('THE NIGHTMARE TEST - 7 levels deep', () => {
    const nightmare = proxy({
      level1: [
        {
          level2: [
            [
              {
                level3: {
                  items: [
                    {
                      nested: [
                        ['a', 'b'],
                        ['c', 'd'],
                        ['e', 'f'],
                      ],
                    },
                  ],
                },
              },
            ],
          ],
        },
      ],
    })

    let observed = ''
    let runs = 0

    effect(() => {
      observed = nightmare.level1[0].level2[0][0].level3.items[0].nested[2][1]
      runs++
    })

    flushSync()
    expect(runs).toBe(1)
    expect(observed).toBe('f')

    // Mutate at the deepest level
    nightmare.level1[0].level2[0][0].level3.items[0].nested[2][1] = 'MUTATED'
    flushSync()

    expect(runs).toBe(2)
    expect(observed).toBe('MUTATED')
  })

  it('fine-grained: different path does not trigger', () => {
    const obj = proxy({ a: { x: 1 }, b: { y: 2 } })
    let runs = 0

    effect(() => {
      obj.a.x
      runs++
    })

    flushSync()
    expect(runs).toBe(1)

    // Different path - should NOT trigger
    obj.b.y = 99
    flushSync()
    expect(runs).toBe(1) // Still 1!
  })
})

describe('toRaw', () => {
  it('returns the original object', () => {
    const original = { count: 0 }
    const proxied = proxy(original)

    expect(toRaw(proxied)).toBe(original)
  })

  it('returns same value for non-proxies', () => {
    const obj = { count: 0 }
    expect(toRaw(obj)).toBe(obj)
  })
})

describe('isReactive', () => {
  it('returns true for proxies', () => {
    const obj = proxy({ count: 0 })
    expect(isReactive(obj)).toBe(true)
  })

  it('returns false for plain objects', () => {
    const obj = { count: 0 }
    expect(isReactive(obj)).toBe(false)
  })
})

describe('state', () => {
  it('creates a reactive state', () => {
    const user = state({ name: 'John' })
    let observed = ''

    effect(() => {
      observed = user.name
    })

    flushSync()
    expect(observed).toBe('John')

    user.name = 'Jane'
    flushSync()
    expect(observed).toBe('Jane')
  })
})

describe('BINDING_SYMBOL fix (TUI framework bug)', () => {
  it('does not proxy Binding objects', () => {
    const source = signal(42)
    const binding = bind(source)

    // Binding should not be proxied when stored in state
    const container = state({ binding })

    // The binding should still work (not be snapshotted)
    expect(container.binding.value).toBe(42)
    expect(isBinding(container.binding)).toBe(true)

    // Changing the source should be reflected through the binding
    source.value = 100
    expect(container.binding.value).toBe(100)
  })

  it('keeps Binding getters live in state arrays', () => {
    const sig1 = signal(1)
    const sig2 = signal(2)
    const sig3 = signal(3)

    const bindings = state([bind(sig1), bind(sig2), bind(sig3)])

    // All bindings should stay live
    expect(bindings[0].value).toBe(1)
    expect(bindings[1].value).toBe(2)
    expect(bindings[2].value).toBe(3)

    // Updates should propagate through bindings
    sig1.value = 10
    sig2.value = 20
    sig3.value = 30

    expect(bindings[0].value).toBe(10)
    expect(bindings[1].value).toBe(20)
    expect(bindings[2].value).toBe(30)
  })

  it('allows writing through bindings in state', () => {
    const source = signal(0)
    const container = state({ value: bind(source) })

    // Write through the binding stored in state
    container.value.value = 999

    // Should update the original source
    expect(source.value).toBe(999)
  })

  it('effects track binding reads correctly', () => {
    const source = signal(1)
    const container = state({ binding: bind(source) })

    let effectRuns = 0
    let observed = 0

    effect(() => {
      observed = container.binding.value
      effectRuns++
    })

    flushSync()
    expect(effectRuns).toBe(1)
    expect(observed).toBe(1)

    // Changing source should trigger effect
    source.value = 42
    flushSync()
    expect(effectRuns).toBe(2)
    expect(observed).toBe(42)
  })
})
