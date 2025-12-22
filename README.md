# @rlabs-inc/signals

**Ultra-lightweight fine-grained reactivity for TypeScript**

A standalone reactive primitives library inspired by Svelte 5 runes, Solid.js, and Vue reactivity. Zero dependencies. ~700 lines of pure TypeScript.

## Features

- **Fine-grained reactivity** - Only effects that read a signal re-run when it changes
- **Deep reactivity** - Objects and arrays are automatically deeply reactive
- **Lazy deriveds** - Computed values only recompute when read
- **Batching** - Group updates to prevent multiple re-runs
- **Reactive collections** - ReactiveMap, ReactiveSet, and reactiveArray
- **Zero dependencies** - Pure TypeScript, works everywhere
- **Tiny** - ~5KB minified

## Installation

```bash
bun add @rlabs-inc/signals
# or
npm install @rlabs-inc/signals
```

## Quick Start

```typescript
import { signal, effect, derived, state } from '@rlabs-inc/signals'

// Simple signal
const count = signal(0)

// Effect runs when dependencies change
effect(() => {
  console.log('Count:', count.value)
})
// Logs: "Count: 0"

count.value = 1
// Logs: "Count: 1"

// Derived values
const doubled = derived(() => count.value * 2)
console.log(doubled.value) // 2

// Deep reactivity with state()
const user = state({
  name: 'John',
  address: {
    city: 'NYC'
  }
})

effect(() => {
  console.log('City:', user.address.city)
})
// Logs: "City: NYC"

user.address.city = 'LA'
// Logs: "City: LA"
```

## API Reference

### signal(initial, options?)

Create a reactive signal that holds a value.

```typescript
const count = signal(0)
console.log(count.value) // 0

count.value = 5
console.log(count.value) // 5

// With custom equality
const obj = signal({ x: 1 }, {
  equals: (a, b) => a.x === b.x
})
```

### effect(fn)

Create a reactive effect that re-runs when dependencies change.

```typescript
const name = signal('John')

const dispose = effect(() => {
  console.log('Hello,', name.value)

  // Optional cleanup function
  return () => {
    console.log('Cleaning up...')
  }
})

name.value = 'Jane' // Effect re-runs

dispose() // Stop the effect
```

### derived(fn, options?)

Create a computed/derived value that updates automatically.

```typescript
const count = signal(5)
const doubled = derived(() => count.value * 2)

console.log(doubled.value) // 10

count.value = 10
console.log(doubled.value) // 20

// Alias: derived.by() (Svelte compatibility)
const tripled = derived.by(() => count.value * 3)
```

### state(initial)

Create a deeply reactive state object. All nested properties are automatically reactive.

```typescript
const app = state({
  user: {
    name: 'John',
    preferences: {
      theme: 'dark'
    }
  },
  items: [1, 2, 3]
})

effect(() => {
  console.log(app.user.preferences.theme)
})

app.user.preferences.theme = 'light' // Triggers effect
app.items.push(4) // Arrays are reactive too
```

### batch(fn)

Batch multiple updates into a single reaction cycle.

```typescript
const a = signal(1)
const b = signal(2)

effect(() => {
  console.log('Sum:', a.value + b.value)
})
// Logs: "Sum: 3"

batch(() => {
  a.value = 10
  b.value = 20
})
// Logs: "Sum: 30" (only once, not twice)
```

### untrack(fn)

Read signals without creating dependencies.

```typescript
const a = signal(1)
const b = signal(2)

effect(() => {
  console.log('a:', a.value) // Creates dependency
  untrack(() => {
    console.log('b:', b.value) // Does NOT create dependency
  })
})

b.value = 100 // Effect does NOT re-run
a.value = 100 // Effect re-runs
```

### watch(source, callback, options?)

Watch a signal and call callback when it changes.

```typescript
const count = signal(0)

const dispose = watch(
  () => count.value,
  (newValue, oldValue) => {
    console.log(`Changed from ${oldValue} to ${newValue}`)
  }
)

count.value = 1 // Logs: "Changed from 0 to 1"

// With immediate option
watch(
  () => count.value,
  (value) => console.log('Value:', value),
  { immediate: true }
)
// Logs immediately: "Value: 1"
```

### ReactiveMap

A reactive Map that triggers updates on modifications.

```typescript
const map = new ReactiveMap<string, number>()

effect(() => {
  console.log('Value:', map.get('key'))
})

map.set('key', 42) // Triggers effect
```

### ReactiveSet

A reactive Set that triggers updates on modifications.

```typescript
const set = new ReactiveSet<string>()

effect(() => {
  console.log('Has item:', set.has('item'))
})

set.add('item') // Triggers effect
```

### reactiveArray(initial?)

Create a reactive array with fine-grained reactivity.

```typescript
const items = reactiveArray([1, 2, 3])

effect(() => {
  console.log('First:', items[0])
  console.log('Length:', items.length)
})

items[0] = 10    // Triggers effect
items.push(4)    // Triggers effect
```

### Utilities

```typescript
// Create read-only view
const count = signal(0)
const ro = readonly(count)
// ro.value = 5  // TypeScript error

// Read without tracking (alias for untrack)
const value = peek(() => count.value)

// Check if value is reactive
isReactive(someObject)

// Get raw object from reactive proxy
const raw = toRaw(reactiveObject)

// Create effect scope
const scope = effectScope()
scope.run(() => {
  effect(() => { /* ... */ })
  effect(() => { /* ... */ })
})
scope.stop() // Disposes all effects
```

## Comparison with Svelte 5

| Svelte 5 | @rlabs-inc/signals |
|----------|-------------------|
| `$state(value)` | `signal(value)` or `state(obj)` |
| `$derived(expr)` | `derived(() => expr)` |
| `$derived.by(fn)` | `derived.by(fn)` or `derived(fn)` |
| `$effect(fn)` | `effect(fn)` |
| `SvelteMap` | `ReactiveMap` |
| `SvelteSet` | `ReactiveSet` |

**Key differences:**
- No compiler needed - works with plain TypeScript
- Use `.value` to read/write signals (like Vue/Solid)
- No Happy DOM or browser environment required

## Why?

We built this because:
1. We love Svelte 5's reactivity model
2. We wanted to use it outside Svelte components
3. We didn't want the overhead of Happy DOM for server-side usage
4. We needed a lightweight solution for libraries like [FatherStateDB](https://github.com/rlabs-inc/fatherstatedb)

## License

MIT

---

Built with ❤️ by RLabs Inc.
