# @rlabs-inc/signals

**Production-grade fine-grained reactivity for TypeScript.**

A complete standalone mirror of Svelte 5's reactivity system. No compiler needed, no DOM, works anywhere - Bun, Node, Deno, or browser.

## Features

- **True Fine-Grained Reactivity** - Changes to deeply nested properties only trigger effects that read that exact path
- **Per-Property Tracking** - Proxy-based deep reactivity with lazy signal creation per property
- **Reactive Bindings** - Two-way data binding with `bind()` for connecting reactive values
- **linkedSignal** - Angular's killer feature: writable computed that resets when source changes
- **createSelector** - Solid's O(n)→O(2) optimization for list selection
- **effectScope** - Vue's lifecycle management with pause/resume support
- **Three-State Dirty Tracking** - Efficient CLEAN/MAYBE_DIRTY/DIRTY propagation
- **Automatic Cleanup** - Effects clean up when disposed, no memory leaks
- **Batching** - Group updates to prevent redundant effect runs
- **Self-Referencing Effects** - Effects can write to their own dependencies
- **Infinite Loop Protection** - Throws after 1000 iterations to catch bugs
- **Reactive Collections** - ReactiveMap, ReactiveSet, ReactiveDate
- **TypeScript Native** - Full type safety with generics

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

## API Reference

### Signals

#### `signal<T>(initialValue: T, options?): WritableSignal<T>`

Create a reactive value with `.value` getter/setter.

```typescript
const name = signal('John')
console.log(name.value)  // 'John'
name.value = 'Jane'      // Triggers effects
```

**Options:**
- `equals?: (a: T, b: T) => boolean` - Custom equality function

#### `state<T extends object>(initialValue: T): T`

Create a deeply reactive object. No `.value` needed - access properties directly.

```typescript
const user = state({ name: 'John', address: { city: 'NYC' } })
user.name = 'Jane'           // Reactive
user.address.city = 'LA'     // Also reactive, deeply
```

### Derived Values

#### `derived<T>(fn: () => T): DerivedSignal<T>`

Create a computed value that automatically updates when dependencies change.

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

### Bindings

#### `bind<T>(source: WritableSignal<T>): Binding<T>`

Create a reactive binding that forwards reads and writes to a source signal. Useful for two-way data binding and connecting reactive values across components.

```typescript
const source = signal(0)
const binding = bind(source)

// Reading through binding reads from source
console.log(binding.value)  // 0

// Writing through binding writes to source
binding.value = 42
console.log(source.value)  // 42
```

**Use cases:**
- Two-way binding for form inputs
- Connecting parent state to child components
- Creating reactive links between signals

```typescript
// Two-way binding example
const username = signal('')
const inputBinding = bind(username)

// When user types (e.g., in a UI framework):
inputBinding.value = 'alice'  // Updates username signal!

// When username changes programmatically:
username.value = 'bob'        // inputBinding.value is now 'bob'
```

#### `bindReadonly<T>(source: ReadableSignal<T>): ReadonlyBinding<T>`

Create a read-only binding. Attempting to write throws an error.

```typescript
const source = signal(0)
const readonly = bindReadonly(source)

console.log(readonly.value)  // 0
// readonly.value = 42       // Would throw at compile time
```

#### `isBinding(value): boolean`

Check if a value is a binding.

```typescript
const binding = bind(signal(0))
console.log(isBinding(binding))  // true
console.log(isBinding(signal(0)))  // false
```

#### `unwrap<T>(value: T | Binding<T>): T`

Get the value from a binding, or return the value directly if not a binding.

```typescript
const arr: (string | Binding<string>)[] = [
  'static',
  bind(signal('dynamic'))
]

arr.map(unwrap)  // ['static', 'dynamic']
```

### Effects

#### `effect(fn: () => void | CleanupFn): DisposeFn`

Create a side effect that re-runs when dependencies change.

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

#### `effect.root(fn: () => T): DisposeFn`

Create an effect scope that can contain nested effects.

```typescript
const dispose = effect.root(() => {
  effect(() => { /* ... */ })
  effect(() => { /* ... */ })
})

// Disposes all nested effects
dispose()
```

#### `effect.pre(fn: () => void): DisposeFn`

Create an effect that runs synchronously (like `$effect.pre` in Svelte).

```typescript
effect.pre(() => {
  // Runs immediately, no flushSync needed
})
```

### Linked Signals (Angular's killer feature)

#### `linkedSignal<D>(fn: () => D): WritableSignal<D>`
#### `linkedSignal<S, D>(options: LinkedSignalOptions<S, D>): WritableSignal<D>`

Create a writable signal that derives from a source but can be manually overridden.
When the source changes, the linked signal resets to the computed value.

```typescript
// Simple form - derives directly from source
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
// Advanced form - with previous value tracking
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

### Selectors (Solid's O(n)→O(2) optimization)

#### `createSelector<T, U = T>(source: () => T, fn?: (key: U, value: T) => boolean): SelectorFn<T, U>`

Create a selector function for efficient list selection tracking.
Instead of O(n) effects re-running, only affected items run = O(2).

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

### Effect Scope (Vue's lifecycle management)

#### `effectScope(detached?: boolean): EffectScope`

Create an effect scope to group effects for batch disposal with pause/resume support.

```typescript
const scope = effectScope()

scope.run(() => {
  // Effects created here are tracked by the scope
  effect(() => console.log(count.value))
  effect(() => console.log(name.value))

  onScopeDispose(() => {
    console.log('Cleaning up...')
  })
})

// Later, dispose all effects at once
scope.stop()
```

#### Pause and Resume

```typescript
scope.pause()    // Effects won't run while paused

count.value = 5  // Effect doesn't run

scope.resume()   // Pending updates run
```

#### `getCurrentScope(): EffectScope | null`

Get the currently active effect scope.

#### `onScopeDispose(fn: () => void): void`

Register a cleanup function on the current scope.

### Batching & Scheduling

#### `batch(fn: () => T): T`

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

#### `flushSync<T>(fn?: () => T): T | undefined`

Synchronously flush all pending effects.

```typescript
count.value = 5
flushSync()  // Effects run NOW, not on next microtask
```

#### `tick(): Promise<void>`

Wait for the next update cycle.

```typescript
count.value = 5
await tick()  // Effects have run
```

### Utilities

#### `untrack<T>(fn: () => T): T`

Read signals without creating dependencies.

```typescript
effect(() => {
  const a = count.value           // Creates dependency
  const b = untrack(() => other.value)  // No dependency
})
```

#### `peek<T>(signal: Source<T>): T`

Read a signal's value without tracking (low-level).

### Deep Reactivity

#### `proxy<T extends object>(value: T): T`

Create a deeply reactive proxy (used internally by `state()`).

```typescript
const obj = proxy({ a: { b: { c: 1 } } })
obj.a.b.c = 2  // Only triggers effects reading a.b.c
```

#### `toRaw<T>(value: T): T`

Get the original object from a proxy.

```typescript
const raw = toRaw(user)  // Original non-reactive object
```

#### `isReactive(value: unknown): boolean`

Check if a value is a reactive proxy.

### Reactive Collections

#### `ReactiveMap<K, V>`

A Map with per-key reactivity.

```typescript
const users = new ReactiveMap<string, User>()

effect(() => {
  console.log(users.get('john'))  // Only re-runs when 'john' changes
})

users.set('jane', { name: 'Jane' })  // Doesn't trigger above effect
```

#### `ReactiveSet<T>`

A Set with per-item reactivity.

```typescript
const tags = new ReactiveSet<string>()

effect(() => {
  console.log(tags.has('important'))  // Only re-runs when 'important' changes
})
```

#### `ReactiveDate`

A Date with reactive getters/setters.

```typescript
const date = new ReactiveDate()

effect(() => {
  console.log(date.getHours())  // Re-runs when time changes
})

date.setHours(12)  // Triggers effect
```

## Advanced Usage

### Self-Referencing Effects

Effects can write to signals they depend on:

```typescript
const count = signal(0)

effect(() => {
  if (count.value < 10) {
    count.value++  // Will re-run until count reaches 10
  }
})
```

**Note:** Unguarded self-references throw after 1000 iterations.

### Custom Equality

```typescript
import { signal, shallowEquals } from '@rlabs-inc/signals'

const obj = signal({ a: 1 }, { equals: shallowEquals })
obj.value = { a: 1 }  // Won't trigger - shallowly equal
```

Built-in equality functions:
- `equals` - Default, uses `Object.is`
- `safeEquals` - Handles NaN correctly
- `shallowEquals` - Shallow object comparison
- `neverEquals` - Always triggers (always false)
- `alwaysEquals` - Never triggers (always true)

### Low-Level API

For advanced use cases, you can access internal primitives:

```typescript
import { source, get, set } from '@rlabs-inc/signals'

// Create a raw source (no .value wrapper)
const src = source(0)

// Read with tracking
const value = get(src)

// Write with notification
set(src, 10)
```

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

## Performance

This library is designed for performance:

- **Lazy evaluation** - Deriveds only compute when read
- **Version-based deduplication** - No duplicate dependency tracking
- **Linked list effect tree** - O(1) effect insertion/removal
- **Microtask batching** - Updates coalesce automatically
- **Per-property signals** - Fine-grained updates at any depth

## Comparison with Svelte 5

| Feature | Svelte 5 | @rlabs-inc/signals |
|---------|----------|-------------------|
| Compiler required | Yes | No |
| DOM integration | Yes | No |
| Fine-grained reactivity | Yes | Yes |
| Deep proxy reactivity | Yes | Yes |
| Reactive bindings | `bind:` directive | `bind()` function |
| Batching | Yes | Yes |
| Effect cleanup | Yes | Yes |
| TypeScript | Yes | Yes |
| Runs in Node/Bun | Needs adapter | Native |

## License

MIT
