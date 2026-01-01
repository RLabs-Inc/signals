// ============================================================================
// @rlabs-inc/signals - Bind Tests
// Tests for the reactive binding primitive
// ============================================================================

import { describe, it, expect } from 'bun:test'
import {
  signal,
  derived,
  effect,
  bind,
  bindReadonly,
  isBinding,
  unwrap,
  flushSync,
  type Binding,
} from '../../src/index.js'

describe('bind', () => {
  it('creates a binding to a signal', () => {
    const source = signal(0)
    const binding = bind(source)

    expect(binding.value).toBe(0)
  })

  it('reads through to the source', () => {
    const source = signal(42)
    const binding = bind(source)

    expect(binding.value).toBe(42)

    source.value = 100
    expect(binding.value).toBe(100)
  })

  it('writes through to the source', () => {
    const source = signal(0)
    const binding = bind(source)

    binding.value = 42
    expect(source.value).toBe(42)
    expect(binding.value).toBe(42)
  })

  it('creates dependency when read in a derived', () => {
    const source = signal(0)
    const binding = bind(source)
    const doubled = derived(() => binding.value * 2)

    expect(doubled.value).toBe(0)

    source.value = 5
    expect(doubled.value).toBe(10)
  })

  it('triggers effects when written through', () => {
    const source = signal(0)
    const binding = bind(source)
    let observed = 0

    effect(() => {
      observed = source.value
    })

    flushSync()
    expect(observed).toBe(0)

    binding.value = 42
    flushSync()
    expect(observed).toBe(42)
  })

  it('creates dependency when read in an effect', () => {
    const source = signal(0)
    const binding = bind(source)
    let observed = 0

    effect(() => {
      observed = binding.value
    })

    flushSync()
    expect(observed).toBe(0)

    source.value = 5
    flushSync()
    expect(observed).toBe(5)
  })

  it('supports chaining bindings', () => {
    const source = signal(0)
    const b1 = bind(source)
    const b2 = bind(b1)
    const b3 = bind(b2)

    expect(b3.value).toBe(0)

    b3.value = 99
    expect(source.value).toBe(99)
    expect(b1.value).toBe(99)
    expect(b2.value).toBe(99)
    expect(b3.value).toBe(99)
  })

  it('works with derived (read-only)', () => {
    const count = signal(0)
    const doubled = derived(() => count.value * 2)
    const binding = bind(doubled)

    expect(binding.value).toBe(0)

    count.value = 5
    expect(binding.value).toBe(10)
  })

  it('is detected by isBinding()', () => {
    const source = signal(0)
    const binding = bind(source)

    expect(isBinding(binding)).toBe(true)
    expect(isBinding(source)).toBe(false)
    expect(isBinding(42)).toBe(false)
    expect(isBinding(null)).toBe(false)
    expect(isBinding(undefined)).toBe(false)
  })
})

describe('bindReadonly', () => {
  it('creates a read-only binding', () => {
    const source = signal(42)
    const binding = bindReadonly(source)

    expect(binding.value).toBe(42)
  })

  it('tracks dependencies correctly', () => {
    const source = signal(0)
    const binding = bindReadonly(source)
    let observed = 0

    effect(() => {
      observed = binding.value
    })

    flushSync()
    expect(observed).toBe(0)

    source.value = 5
    flushSync()
    expect(observed).toBe(5)
  })

  it('is detected by isBinding()', () => {
    const source = signal(0)
    const binding = bindReadonly(source)

    expect(isBinding(binding)).toBe(true)
  })
})

describe('unwrap', () => {
  it('returns value directly if not a binding', () => {
    expect(unwrap(42)).toBe(42)
    expect(unwrap('hello')).toBe('hello')
    expect(unwrap(null)).toBe(null)
  })

  it('unwraps a binding to get its value', () => {
    const source = signal(42)
    const binding = bind(source)

    expect(unwrap(binding)).toBe(42)

    source.value = 100
    expect(unwrap(binding)).toBe(100)
  })

  it('unwraps a read-only binding', () => {
    const source = signal(42)
    const binding = bindReadonly(source)

    expect(unwrap(binding)).toBe(42)
  })

  it('works with mixed arrays', () => {
    const source1 = signal('dynamic1')
    const source2 = signal('dynamic2')

    const arr: (string | Binding<string>)[] = [
      'static',
      bind(source1),
      'another static',
      bind(source2),
    ]

    const values = arr.map(unwrap)
    expect(values).toEqual(['static', 'dynamic1', 'another static', 'dynamic2'])

    source1.value = 'changed1'
    source2.value = 'changed2'

    const newValues = arr.map(unwrap)
    expect(newValues).toEqual(['static', 'changed1', 'another static', 'changed2'])
  })
})

describe('TUI use case: parallel arrays with bindings', () => {
  it('simulates text component binding', () => {
    // User code - text content as string
    const message = signal('Hello')

    // Internal engine arrays - textContent holds strings
    const textContent: (string | Binding<string>)[] = []

    // text() component implementation
    function text(props: { content: typeof message }) {
      const index = textContent.length
      textContent.push(bind(props.content))
      return index
    }

    const idx = text({ content: message })

    // frameBufferDerived would read like this:
    const getValue = () => unwrap(textContent[idx])

    expect(getValue()).toBe('Hello')

    message.value = 'World'
    expect(getValue()).toBe('World')
  })

  it('simulates text with derived content (number to string)', () => {
    // User code - counter that displays as text
    const count = signal(0)
    const countText = derived(() => `Count: ${count.value}`)

    // Internal engine arrays
    const textContent: (string | Binding<string>)[] = []

    // text() accepts derived too
    function text(props: { content: typeof countText }) {
      const index = textContent.length
      textContent.push(bind(props.content) as Binding<string>)
      return index
    }

    const idx = text({ content: countText })

    expect(unwrap(textContent[idx])).toBe('Count: 0')

    count.value = 42
    expect(unwrap(textContent[idx])).toBe('Count: 42')
  })

  it('simulates two-way binding for input component', () => {
    // User code
    const username = signal('')

    // Internal engine arrays
    const inputValue: Binding<string>[] = []

    // input() component implementation
    function input(props: { value: typeof username }) {
      const index = inputValue.length
      inputValue.push(bind(props.value))
      return index
    }

    const idx = input({ value: username })

    // When user types (keyboard handler)
    inputValue[idx].value = 'alice'

    // User's signal is updated!
    expect(username.value).toBe('alice')

    // When user changes programmatically
    username.value = 'bob'

    // Input binding reflects change
    expect(inputValue[idx].value).toBe('bob')
  })

  it('reactive chain: signal -> binding -> derived -> effect', () => {
    // User code - text content
    const message = signal('Hello')

    // Engine: parallel arrays (textContent holds strings)
    const textContent: Binding<string>[] = [bind(message)]

    // Pipeline: frameBufferDerived
    const frameBuffer = derived(() => {
      return `text: ${textContent[0].value}`
    })

    // Pipeline: render effect
    let rendered = ''
    effect(() => {
      rendered = frameBuffer.value
    })

    flushSync()
    expect(rendered).toBe('text: Hello')

    // User updates their signal
    message.value = 'World'
    flushSync()
    expect(rendered).toBe('text: World')

    // Two-way: write through binding (e.g., from input component)
    textContent[0].value = 'Updated'
    flushSync()
    expect(message.value).toBe('Updated')
    expect(rendered).toBe('text: Updated')
  })
})
