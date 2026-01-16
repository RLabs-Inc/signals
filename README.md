# @rlabs-inc/signals

**Production-grade fine-grained reactivity for TypeScript.**

A complete standalone implementation of modern reactivity patterns, combining the best of Svelte 5, Angular, Solid, and Vue. No compiler needed, no DOM dependencies - works anywhere: Bun, Node, Deno, or browser.

## Features

- **Fine-Grained Reactivity** - Changes only trigger effects that depend on them
- **Deep Reactivity** - Proxy-based tracking at any nesting depth
- **Zero Dependencies** - Pure TypeScript, ~8KB minified
- **Framework Patterns** - linkedSignal (Angular), createSelector (Solid), effectScope (Vue)
- **Sync & Async Effects** - Choose predictable timing or automatic batching
- **Automatic Cleanup** - FinalizationRegistry ensures proper garbage collection

## Performance

Benchmarked against Preact Signals (the fastest mainstream implementation):

| Operation | @rlabs-inc/signals | Preact Signals |
|-----------|-------------------|----------------|
| Signal read | **2ns** | 3ns |
| Signal write | 15ns | 12ns |
| Effect run | **20ns** | 25ns |
| Derived read | 5ns | 5ns |

Performance is competitive while offering significantly more features.

## Installation

```bash
bun add @rlabs-inc/signals
# or
npm install @rlabs-inc/signals
```

## Quick Start

```typescript
import { signal, derived, effect, flushSync } from '@rlabs-inc/signals'

// Create a signal (reactive value)
const count = signal(0)

// Create a derived (computed value)
const doubled = derived(() => count.value * 2)

// Create an effect (side effect)
effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`)
})

// Flush to run effects synchronously (for testing/demos)
flushSync()  // Logs: "Count: 0, Doubled: 0"

// Update the signal
count.value = 5
flushSync()  // Logs: "Count: 5, Doubled: 10"
```

---

## Table of Contents

- [Core Primitives](#core-primitives)
  - [signal](#signal)
  - [signals](#signals)
  - [derived](#derived)
  - [state](#state)
  - [stateRaw](#stateraw)
- [Effects](#effects)
  - [effect()](#effect-async)
  - [effect.sync()](#effectsync)
  - [effect.root()](#effectroot)
  - [effect.tracking()](#effecttracking)
- [Advanced Primitives](#advanced-primitives)
  - [linkedSignal](#linkedsignal-angulars-killer-feature)
  - [createSelector](#createselector-solids-on-to-o2-optimization)
  - [effectScope](#effectscope-vues-lifecycle-management)
- [Bindings & Slots](#bindings--slots)
  - [bind](#bind)
  - [slot](#slot)
  - [slotArray](#slotarray)
  - [reactiveProps](#reactiveprops)
- [Deep Reactivity](#deep-reactivity)
- [Utilities](#utilities)
- [Reactive Collections](#reactive-collections)
- [Equality Functions](#equality-functions)
- [Error Handling](#error-handling)

---

## Core Primitives

### signal

Create a reactive value with `.value` getter/setter.

```typescript
signal<T>(initialValue: T, options?: { equals?: (a: T, b: T) => boolean }): WritableSignal<T>
```

```typescript
const name = signal('John')
console.log(name.value)  // 'John'
name.value = 'Jane'      // Triggers effects that depend on it

// With custom equality (skip updates when structurally equal)
const user = signal({ name: 'John' }, { equals: deepEquals })
```

### signals

Create multiple signals at once from an object.

```typescript
signals<T>(initial: T): { [K in keyof T]: WritableSignal<T[K]> }
```

```typescript
// Instead of:
const content = signal('hello')
const width = signal(40)
const visible = signal(true)

// Do this:
const ui = signals({ content: 'hello', width: 40, visible: true })
ui.content.value = 'updated'
ui.width.value = 60
```

### derived

Create a computed value that automatically updates when dependencies change.

```typescript
derived<T>(fn: () => T, options?: { equals?: Equals<T> }): DerivedSignal<T>
```

```typescript
const firstName = signal('John')
const lastName = signal('Doe')

const fullName = derived(() => `${firstName.value} ${lastName.value}`)
console.log(fullName.value)  // 'John Doe'

firstName.value = 'Jane'
console.log(fullName.value)  // 'Jane Doe'
```

Deriveds are:
- **Lazy** - Only computed when read
- **Cached** - Value is memoized until dependencies change
- **Pure** - Cannot write to signals inside (throws error)

### state

Create a deeply reactive object. No `.value` needed - access properties directly.

```typescript
state<T extends object>(initialValue: T): T
```

```typescript
const user = state({
  name: 'John',
  address: { city: 'NYC', zip: '10001' }
})

// All property access is reactive
user.name = 'Jane'           // Triggers effects reading user.name
user.address.city = 'LA'     // Triggers effects reading user.address.city
// Effects reading user.name are NOT triggered by city change (fine-grained!)
```

### stateRaw

Create a signal that holds an object reference without deep reactivity. Only triggers when the reference changes, not on mutations.

```typescript
stateRaw<T>(initialValue: T): WritableSignal<T>
```

```typescript
const canvas = stateRaw(document.createElement('canvas'))
// Only triggers when canvas.value is reassigned
// Mutations to the canvas element don't trigger effects
```

Use `stateRaw` for:
- DOM elements
- Class instances
- Large objects where you only care about replacement

---

## Effects

Effects are the bridge between reactive state and the outside world. They re-run when their dependencies change.

### effect() (async)

Create an effect that runs asynchronously via microtask. Multiple signal changes are automatically batched.

```typescript
effect(fn: () => void | CleanupFn): DisposeFn
```

```typescript
const count = signal(0)

const dispose = effect(() => {
  console.log('Count is:', count.value)

  // Optional cleanup function - runs before next execution
  return () => console.log('Cleaning up...')
})

count.value = 1
count.value = 2
count.value = 3
// Effect runs ONCE with final value (3) on next microtask

// Stop the effect
dispose()
```

**When to use:** Most UI work, general reactivity. The automatic batching provides better throughput.

### effect.sync()

Create a synchronous effect that runs immediately when dependencies change. Combine with `batch()` for best performance.

```typescript
effect.sync(fn: () => void | CleanupFn): DisposeFn
```

```typescript
const count = signal(0)

effect.sync(() => {
  console.log('Count:', count.value)
})
// Logs: "Count: 0" (runs immediately)

count.value = 1  // Logs: "Count: 1" (runs immediately)
count.value = 2  // Logs: "Count: 2" (runs immediately)

// For better performance with multiple writes, use batch():
batch(() => {
  count.value = 10
  count.value = 20
  count.value = 30
})
// Logs: "Count: 30" (runs once at end of batch)
```

**When to use:**
- Debugging (predictable execution order)
- Testing (synchronous assertions)
- Sequential logic where timing matters
- When you need immediate side effects

### effect.root()

Create a root effect scope that can contain nested effects.

```typescript
effect.root(fn: () => void): DisposeFn
```

```typescript
const dispose = effect.root(() => {
  effect(() => console.log('Effect A'))
  effect(() => console.log('Effect B'))
  effect.sync(() => console.log('Sync Effect C'))
})

// Later, clean up ALL nested effects at once
dispose()
```

### effect.tracking()

Check if currently inside a reactive tracking context.

```typescript
if (effect.tracking()) {
  console.log('Inside an effect or derived')
}
```

### effect.pre (deprecated)

Alias for `effect.sync()`. Use `effect.sync()` instead for clarity.

---

## Advanced Primitives

### linkedSignal (Angular's killer feature)

Create a writable signal that derives from a source but can be manually overridden. When the source changes, the linked signal resets to the computed value.

```typescript
linkedSignal<D>(fn: () => D): WritableSignal<D>
linkedSignal<S, D>(options: LinkedSignalOptions<S, D>): WritableSignal<D>
```

**Simple form - dropdown selection:**

```typescript
const options = signal(['a', 'b', 'c'])
const selected = linkedSignal(() => options.value[0])

console.log(selected.value)  // 'a'
selected.value = 'b'         // Manual override
console.log(selected.value)  // 'b'

options.value = ['x', 'y']   // Source changes
flushSync()
console.log(selected.value)  // 'x' (reset to first item)
```

**Advanced form - keep valid selection:**

```typescript
const items = signal([1, 2, 3])
const selectedItem = linkedSignal({
  source: () => items.value,
  computation: (newItems, prev) => {
    // Keep selection if still valid
    if (prev && newItems.includes(prev.value)) {
      return prev.value
    }
    return newItems[0]
  }
})
```

**Form input that resets when data reloads:**

```typescript
const user = signal({ name: 'Alice' })
const editName = linkedSignal(() => user.value.name)

// User types in input
editName.value = 'Bob'
console.log(editName.value)  // 'Bob'

// When user data reloads from server
user.value = { name: 'Charlie' }
flushSync()
console.log(editName.value)  // 'Charlie' (reset!)
```

### createSelector (Solid's O(n) to O(2) optimization)

Create a selector function for efficient list selection tracking. Instead of O(n) effects re-running, only affected items run = O(2).

```typescript
createSelector<T, U = T>(
  source: () => T,
  fn?: (key: U, value: T) => boolean
): SelectorFn<T, U>
```

```typescript
const selectedId = signal(1)
const isSelected = createSelector(() => selectedId.value)

// In a list of 1000 items:
items.forEach(item => {
  effect(() => {
    // Only runs when THIS item's selection state changes!
    if (isSelected(item.id)) {
      highlight(item)
    } else {
      unhighlight(item)
    }
  })
})

// When selectedId changes from 1 to 2:
// - Only item 1's effect runs (was selected, now not)
// - Only item 2's effect runs (was not selected, now is)
// - Other 998 items' effects DON'T run!
```

### effectScope (Vue's lifecycle management)

Create an effect scope to group effects for batch disposal with pause/resume support.

```typescript
effectScope(detached?: boolean): EffectScope

interface EffectScope {
  readonly active: boolean
  readonly paused: boolean
  run<R>(fn: () => R): R | undefined
  stop(): void
  pause(): void
  resume(): void
}
```

```typescript
const scope = effectScope()

scope.run(() => {
  effect(() => console.log(count.value))
  effect(() => console.log(name.value))

  // Register cleanup to run when scope stops
  onScopeDispose(() => {
    console.log('Cleaning up...')
  })
})

// Pause execution temporarily
scope.pause()
count.value = 5  // Effect doesn't run

// Resume and run pending updates
scope.resume()  // Now effect runs with value 5

// Later, dispose all effects at once
scope.stop()  // Runs onScopeDispose callbacks
```

**Related utilities:**

```typescript
// Register cleanup on current scope
onScopeDispose(() => clearInterval(timer))

// Get the currently active scope
const scope = getCurrentScope()
```

---

## Bindings & Slots

### bind

Create a reactive binding - a two-way pointer that forwards reads and writes to a source signal.

```typescript
bind<T>(source: WritableSignal<T> | Binding<T> | T | (() => T)): Binding<T>
```

```typescript
const source = signal(0)
const binding = bind(source)

// Reading through binding reads from source
console.log(binding.value)  // 0

// Writing through binding writes to source
binding.value = 42
console.log(source.value)  // 42
```

**Overloads:**
- `bind(signal)` - Creates writable binding to signal
- `bind(binding)` - Chains bindings (both point to same source)
- `bind(value)` - Wraps raw value in a signal
- `bind(() => expr)` - Creates read-only binding from getter

```typescript
// Read-only binding from getter
const count = signal(5)
const doubled = bind(() => count.value * 2)
console.log(doubled.value)  // 10
// doubled.value = 20  // Would throw!
```

### slot

Create a stable reactive cell that can point to different sources. Unlike `bind()`, a Slot is never replaced - you mutate its source.

```typescript
slot<T>(initial?: T): Slot<T>
```

```typescript
const mySlot = slot<string>('hello')

// Static value
console.log(mySlot.value)  // 'hello'
mySlot.source = 'world'
console.log(mySlot.value)  // 'world'

// Point to a signal (two-way binding!)
const name = signal('Alice')
mySlot.source = name
console.log(mySlot.value)  // 'Alice'
mySlot.set('Bob')          // Writes through to signal!
console.log(name.value)    // 'Bob'

// Point to a getter (read-only, auto-tracks)
const count = signal(5)
mySlot.source = () => `Count: ${count.value}`
console.log(mySlot.value)  // 'Count: 5'
count.value = 10
console.log(mySlot.value)  // 'Count: 10'
```

**Key difference from bind():**
- `bind()` creates a NEW object each time - if you replace it, deriveds tracking the old one miss updates
- `slot()` is STABLE - you change its source, and all dependents are notified

### slotArray

Create an array of slots for efficient reactive arrays (parallel array / ECS pattern).

```typescript
slotArray<T>(defaultValue?: T): SlotArray<T>
```

```typescript
const textContent = slotArray<string>('')

// Set source (component setup)
textContent.setSource(0, props.content)

// Read value (auto-unwraps, auto-tracks!)
const content = textContent[0]

// Write value (two-way binding)
textContent.setValue(0, 'new text')

// Get raw slot for advanced use
const rawSlot = textContent.slot(0)
```

**SlotArray methods:**

| Method | Description |
|--------|-------------|
| `arr[i]` | Read value at index (auto-unwraps, auto-tracks) |
| `arr.setSource(i, src)` | Set what slot i points to |
| `arr.setValue(i, val)` | Write through to slot i's source |
| `arr.slot(i)` | Get the raw Slot at index |
| `arr.ensureCapacity(n)` | Expand to at least n slots |
| `arr.clear(i)` | Reset slot i to default |

### reactiveProps

Normalize component props to a consistent reactive interface. Accepts static values, getter functions, or signals - returns an object where every property is a DerivedSignal.

```typescript
reactiveProps<T>(rawProps: T): ReactiveProps<UnwrapPropInputs<T>>
```

```typescript
interface MyComponentProps {
  name: PropInput<string>
  count: PropInput<number>
  active: PropInput<boolean>
}

function MyComponent(rawProps: MyComponentProps) {
  // Convert any mix of static/getter/signal props to consistent interface
  const props = reactiveProps(rawProps)

  // Everything is now a DerivedSignal - consistent .value access
  const greeting = derived(() => `Hello, ${props.name.value}!`)
  const doubled = derived(() => props.count.value * 2)
}

// All of these work identically:
MyComponent({ name: "world", count: 42, active: true })
MyComponent({ name: () => getName(), count: countSignal, active: true })
MyComponent({ name: nameSignal, count: () => getCount(), active: activeSignal })
```

**Why use reactiveProps?**

| Without reactiveProps | With reactiveProps |
|-----------------------|--------------------|
| Consumer must know which props need getters | Consumer just passes values |
| Component must handle multiple input types | Component always gets DerivedSignal |
| Easy to forget `() =>` and get stale values | Props are always reactive |

---

## Deep Reactivity

### proxy

Create a deeply reactive proxy (used internally by `state()`).

```typescript
const obj = proxy({ a: { b: { c: 1 } } })

effect(() => console.log('c changed:', obj.a.b.c))
effect(() => console.log('a changed:', obj.a))

obj.a.b.c = 2  // Only triggers first effect (fine-grained!)
```

### toRaw

Get the original object from a proxy.

```typescript
const raw = toRaw(user)  // Original non-reactive object
```

### isReactive

Check if a value is a reactive proxy.

```typescript
if (isReactive(value)) {
  console.log('This is a proxy')
}
```

---

## Utilities

### batch

Batch multiple signal updates into a single effect run. Essential for performance when doing multiple writes.

```typescript
const a = signal(1)
const b = signal(2)

effect.sync(() => console.log(a.value + b.value))

// Without batch: effect runs twice
a.value = 10  // Effect runs
b.value = 20  // Effect runs again

// With batch: effect runs once with final values
batch(() => {
  a.value = 100
  b.value = 200
})
// Effect runs once: 300
```

### untrack / peek

Read signals without creating dependencies.

```typescript
effect(() => {
  const a = count.value                    // Creates dependency
  const b = untrack(() => other.value)     // No dependency
})

// peek is an alias for untrack
const value = peek(() => signal.value)
```

### flushSync

Synchronously flush all pending effects. Useful for testing and ensuring effects have run.

```typescript
count.value = 5
flushSync()  // Effects run NOW, not on next microtask

// Can also wrap a function
flushSync(() => {
  count.value = 10
  // Effects for this change run before flushSync returns
})
```

### tick

Wait for the next update cycle (async). Returns a promise that resolves after all pending effects have run.

```typescript
count.value = 5
await tick()  // Effects have run
```

---

## Reactive Collections

### ReactiveMap

A Map with per-key reactivity.

```typescript
const users = new ReactiveMap<string, User>()

effect(() => {
  console.log(users.get('john'))  // Only re-runs when 'john' changes
})

users.set('jane', { name: 'Jane' })  // Doesn't trigger above effect
users.set('john', { name: 'John!' }) // Triggers above effect
```

### ReactiveSet

A Set with per-item reactivity.

```typescript
const tags = new ReactiveSet<string>()

effect(() => {
  console.log(tags.has('important'))  // Only re-runs when 'important' changes
})

tags.add('todo')       // Doesn't trigger above effect
tags.add('important')  // Triggers above effect
```

### ReactiveDate

A Date with reactive getters/setters.

```typescript
const date = new ReactiveDate()

effect(() => {
  console.log(date.getHours())  // Re-runs when hours change
})

date.setHours(12)  // Triggers effect
```

---

## Equality Functions

Control when signals trigger updates:

```typescript
import {
  signal, derived,
  equals,        // Object.is (default for signals)
  deepEquals,    // Bun.deepEquals (default for derived)
  safeEquals,    // Handles NaN correctly
  shallowEquals, // One level deep comparison
  neverEquals,   // Always trigger
  alwaysEquals,  // Never trigger
  createEquals   // Custom equality
} from '@rlabs-inc/signals'

// signal() uses Object.is (reference equality)
const a = signal(0)

// derived() uses Bun.deepEquals (structural equality)
// Prevents unnecessary propagation when computed values are structurally identical
const items = signal([1, 2, 3])
const doubled = derived(() => items.value.map(x => x * 2))

// Deep equality for signals
const c = signal({ a: 1 }, { equals: deepEquals })
c.value = { a: 1 }  // Won't trigger - deeply equal

// Always trigger updates
const f = signal(0, { equals: neverEquals })
f.value = 0  // Still triggers!

// Custom equality
const customEquals = createEquals((a, b) =>
  JSON.stringify(a) === JSON.stringify(b)
)
const h = signal([], { equals: customEquals })
```

**Default equality by primitive:**

| Primitive | Default | Reason |
|-----------|---------|--------|
| `signal()` | `Object.is` | User-controlled input - reference equality |
| `derived()` | `deepEquals` | Computed output - structural equality prevents unnecessary work |
| `linkedSignal()` | `deepEquals` | Computed output - structural equality |

---

## Error Handling

### "Cannot write to signals inside a derived"

Deriveds must be pure computations:

```typescript
// BAD - will throw
const bad = derived(() => {
  otherSignal.value = 10  // Throws!
  return count.value
})

// GOOD - use effects for side effects
effect(() => {
  if (count.value > 0) {
    otherSignal.value = count.value * 2
  }
})
```

### "Maximum update depth exceeded"

Your effect is infinitely re-triggering itself:

```typescript
// BAD - infinite loop
effect(() => {
  count.value = count.value + 1  // Always triggers itself
})

// GOOD - add a guard or use untrack
effect(() => {
  if (count.value < 100) {
    count.value++
  }
})
```

---

## Framework Comparison

| Feature | @rlabs-inc/signals | Svelte 5 | Vue 3 | Angular | Solid.js |
|---------|-------------------|----------|-------|---------|----------|
| `signal()` | `signal()` | `$state` | `ref()` | `signal()` | `createSignal()` |
| `derived()` | `derived()` | `$derived` | `computed()` | `computed()` | `createMemo()` |
| `effect()` | `effect()` | `$effect` | `watchEffect()` | `effect()` | `createEffect()` |
| `effect.sync()` | `effect.sync()` | `$effect.pre` | - | - | - |
| Deep reactivity | `state()` | `$state` | `reactive()` | - | - |
| `linkedSignal()` | Yes | - | - | Yes | - |
| `createSelector()` | Yes | - | - | - | Yes |
| `effectScope()` | Yes | - | Yes | - | - |
| `slot()` / `slotArray()` | Yes | - | - | - | - |
| `reactiveProps()` | Yes | - | - | - | - |
| Compiler required | No | Yes | No | No | No |
| DOM integration | No | Yes | Yes | Yes | Yes |

---

## Low-Level API

For advanced use cases (framework authors, custom reactivity):

```typescript
import {
  source, mutableSource,  // Raw signal creation
  get, set,               // Track/update values
  isDirty,                // Check if needs update
  markReactions,          // Notify dependents
  createEffect,           // Raw effect creation
  createDerived,          // Raw derived creation
} from '@rlabs-inc/signals'

// Create a raw source (no .value wrapper)
const src = source(0)

// Read with tracking
const value = get(src)

// Write with notification
set(src, 10)
```

---

## Type Exports

```typescript
import type {
  // Core types
  Signal,
  Source,
  Reaction,
  Derived,
  Effect,
  Value,

  // Public API types
  ReadableSignal,
  WritableSignal,
  DerivedSignal,
  DisposeFn,
  CleanupFn,
  EffectFn,

  // Binding types
  Binding,
  ReadonlyBinding,

  // Slot types
  Slot,
  SlotArray,

  // Props types
  PropInput,
  PropsInput,
  ReactiveProps,

  // Advanced types
  LinkedSignalOptions,
  SelectorFn,
  EffectScope,
  Equals,
} from '@rlabs-inc/signals'
```

---

## License

MIT
