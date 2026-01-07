# @rlabs-inc/signals

**Production-grade fine-grained reactivity for TypeScript.**

A complete standalone mirror of Svelte 5's reactivity system, enhanced with Angular's linkedSignal, Solid's createSelector, and Vue's effectScope. No compiler needed, no DOM, works anywhere - Bun, Node, Deno, or browser.

## Why This Library?

- **True Fine-Grained Reactivity** - Changes to deeply nested properties only trigger effects that read that exact path
- **Per-Property Tracking** - Proxy-based deep reactivity with lazy signal creation per property
- **Framework-Agnostic** - Use the best patterns from Svelte, Angular, Solid, and Vue in any environment
- **Zero Dependencies** - Pure TypeScript, no runtime dependencies
- **Automatic Memory Cleanup** - FinalizationRegistry ensures signals are garbage collected properly
- **Battle-Tested Patterns** - Based on proven reactivity systems from major frameworks

## Installation

```bash
bun add @rlabs-inc/signals
# or
npm install @rlabs-inc/signals
```

## Quick Start

```typescript
import { signal, derived, effect, flushSync } from '@rlabs-inc/signals'

// Create a signal
const count = signal(0)

// Create a derived value
const doubled = derived(() => count.value * 2)

// Create an effect
effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`)
})

// Flush to run effects synchronously
flushSync()  // Logs: "Count: 0, Doubled: 0"

// Update the signal
count.value = 5
flushSync()  // Logs: "Count: 5, Doubled: 10"
```

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
name.value = 'Jane'      // Triggers effects
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

### state

Create a deeply reactive object. No `.value` needed - access properties directly.

```typescript
state<T extends object>(initialValue: T): T
```

```typescript
const user = state({
  name: 'John',
  address: { city: 'NYC' }
})
user.name = 'Jane'           // Reactive
user.address.city = 'LA'     // Also reactive, deeply
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
```

Deriveds are:
- **Lazy** - Only computed when read
- **Cached** - Value is memoized until dependencies change
- **Pure** - Cannot write to signals inside (throws error)

---

## Effects

### effect

Create a side effect that re-runs when dependencies change.

```typescript
effect(fn: () => void | CleanupFn): DisposeFn
```

```typescript
const count = signal(0)

const dispose = effect(() => {
  console.log('Count is:', count.value)

  // Optional cleanup function
  return () => {
    console.log('Cleaning up...')
  }
})

// Stop the effect
dispose()
```

### effect.pre

Create an effect that runs synchronously (like `$effect.pre` in Svelte).

```typescript
effect.pre(() => {
  // Runs immediately, not on microtask
})
```

### effect.root

Create an effect scope that can contain nested effects.

```typescript
const dispose = effect.root(() => {
  effect(() => { /* ... */ })
  effect(() => { /* ... */ })
})

// Disposes all nested effects
dispose()
```

### effect.tracking

Check if currently inside a reactive tracking context.

```typescript
if (effect.tracking()) {
  console.log('Inside an effect or derived')
}
```

---

## Bindings

Two-way reactive pointers that forward reads and writes to a source signal.

### bind

Create a reactive binding.

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

**Use cases:**
- Two-way binding for form inputs
- Connecting parent state to child components
- Creating reactive links between signals

### bindReadonly

Create a read-only binding.

```typescript
const source = signal(0)
const readonly = bindReadonly(source)

console.log(readonly.value)  // 0
// readonly.value = 42       // TypeScript error + runtime error
```

### isBinding / unwrap

```typescript
// Check if a value is a binding
isBinding(maybeBinding)  // true or false

// Get value from binding or return value directly
const arr: (string | Binding<string>)[] = ['static', bind(signal('dynamic'))]
arr.map(unwrap)  // ['static', 'dynamic']
```

---

## Advanced Features

### linkedSignal (Angular's killer feature)

Create a writable signal that derives from a source but can be manually overridden. When the source changes, the linked signal resets to the computed value.

```typescript
linkedSignal<D>(fn: () => D): WritableSignal<D>
linkedSignal<S, D>(options: LinkedSignalOptions<S, D>): WritableSignal<D>
```

```typescript
// Simple form - dropdown selection
const options = signal(['a', 'b', 'c'])
const selected = linkedSignal(() => options.value[0])

console.log(selected.value)  // 'a'
selected.value = 'b'         // Manual override
console.log(selected.value)  // 'b'

options.value = ['x', 'y']   // Source changes
flushSync()
console.log(selected.value)  // 'x' (reset to computed value)
```

```typescript
// Advanced form - keep valid selection
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

**Use cases:**
- Form inputs that reset when parent data changes
- Selection state that persists within valid options
- Derived values that can be temporarily overridden

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
    // When selectedId changes from 1 to 2:
    // - Only item 1's effect runs (was selected, now not)
    // - Only item 2's effect runs (was not selected, now is)
    // - Other 998 items' effects DON'T run
    if (isSelected(item.id)) {
      highlight(item)
    } else {
      unhighlight(item)
    }
  })
})
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

  onScopeDispose(() => {
    console.log('Cleaning up...')
  })
})

// Pause execution temporarily
scope.pause()
count.value = 5  // Effect doesn't run

// Resume and run pending updates
scope.resume()

// Later, dispose all effects at once
scope.stop()
```

### onScopeDispose

Register a cleanup function on the current scope.

```typescript
scope.run(() => {
  const timer = setInterval(() => log('tick'), 1000)
  onScopeDispose(() => clearInterval(timer))
})
```

### getCurrentScope

Get the currently active effect scope.

```typescript
const scope = getCurrentScope()
if (scope) {
  // Inside a scope
}
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
  console.log(date.getHours())  // Re-runs when time changes
})

date.setHours(12)  // Triggers effect
```

---

## Utilities

### batch

Batch multiple signal updates into a single effect run.

```typescript
const a = signal(1)
const b = signal(2)

effect(() => console.log(a.value + b.value))

batch(() => {
  a.value = 10
  b.value = 20
})
// Effect runs once with final values, not twice
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

Synchronously flush all pending effects.

```typescript
count.value = 5
flushSync()  // Effects run NOW, not on next microtask
```

### tick

Wait for the next update cycle (async).

```typescript
count.value = 5
await tick()  // Effects have run
```

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

## Equality Functions

Control when signals trigger updates:

```typescript
import { signal, equals, safeEquals, shallowEquals, neverEquals, alwaysEquals, createEquals } from '@rlabs-inc/signals'

// Default - uses Object.is
const a = signal(0)  // Uses equals by default

// Safe equality - handles NaN correctly
const b = signal(NaN, { equals: safeEquals })

// Shallow comparison - compares one level deep
const c = signal({ a: 1 }, { equals: shallowEquals })
c.value = { a: 1 }  // Won't trigger - shallowly equal

// Always trigger updates
const d = signal(0, { equals: neverEquals })
d.value = 0  // Still triggers!

// Never trigger updates
const e = signal(0, { equals: alwaysEquals })
e.value = 100  // Doesn't trigger

// Custom equality
const customEquals = createEquals((a, b) =>
  JSON.stringify(a) === JSON.stringify(b)
)
const f = signal([], { equals: customEquals })
```

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

// GOOD - add a guard
effect(() => {
  if (count.value < 100) {
    count.value++
  }
})
```

---

## Performance

This library is designed for performance:

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Signal read/write | O(1) | Direct property access |
| Derived read | O(1) | Cached after first computation |
| Effect trigger | O(deps) | Only runs if dependencies change |
| `batch()` | O(1) cycle | Multiple updates, single flush |
| `createSelector()` | O(2) | Only changed items' effects run |
| Proxy property access | O(1) | Per-property signal lookup |
| `ReactiveMap.get()` | O(1) | Per-key tracking |

**Key optimizations:**
- **Lazy evaluation** - Deriveds only compute when read
- **Version-based deduplication** - No duplicate dependency tracking
- **Linked list effect tree** - O(1) effect insertion/removal
- **Microtask batching** - Updates coalesce automatically
- **Per-property signals** - Fine-grained updates at any depth
- **FinalizationRegistry cleanup** - Automatic memory management

---

## Framework Comparison

| Feature | @rlabs-inc/signals | Svelte 5 | Vue 3 | Angular | Solid.js |
|---------|-------------------|----------|-------|---------|----------|
| `signal()` | `signal()` | `$state` | `ref()` | `signal()` | `createSignal()` |
| `derived()` | `derived()` | `$derived` | `computed()` | `computed()` | `createMemo()` |
| `effect()` | `effect()` | `$effect` | `watchEffect()` | `effect()` | `createEffect()` |
| Deep reactivity | `state()` | `$state` | `reactive()` | - | - |
| `linkedSignal()` | Yes | - | - | Yes | - |
| `createSelector()` | Yes | - | - | - | Yes |
| `effectScope()` | Yes | - | Yes | - | - |
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

## License

MIT
