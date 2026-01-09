// ============================================================================
// @rlabs-inc/signals - Reactive Binding
// Creates a reactive link/pointer to another reactive value
// ============================================================================

import type { WritableSignal, ReadableSignal, Source, ExtractInner } from '../core/types.js'
import { BINDING_SYMBOL } from '../core/constants.js'
import { signal, getSource } from './signal.js'
import { disconnectSource } from '../reactivity/tracking.js'

// =============================================================================
// INTERNAL SOURCE SYMBOL
// =============================================================================

/**
 * Symbol to access the internal Source from a binding.
 * Used by disconnectBinding() to break reactive links.
 */
const BINDING_SOURCE_SYMBOL = Symbol('binding.source')

// =============================================================================
// AUTO-CLEANUP VIA FINALIZATION REGISTRY
// =============================================================================

/**
 * FinalizationRegistry for automatic binding cleanup.
 * When a binding is garbage collected, we clean up the internal signal
 * (if one was created for a raw value) to prevent memory leaks.
 *
 * NOTE: This only works when there are no circular references.
 * For proper cleanup when circular refs exist, use disconnectBinding().
 */
const bindingCleanup = new FinalizationRegistry<Source<unknown>>((internalSource) => {
  // Use disconnectSource to properly break the reactive graph
  disconnectSource(internalSource)
})

// =============================================================================
// BINDING INTERFACES
// =============================================================================

/**
 * A writable binding that forwards reads and writes to a source.
 * Reading creates dependency on source, writing triggers source's reactions.
 */
export interface Binding<T> {
  get value(): T
  set value(v: T)
}

/**
 * A read-only binding that forwards reads to a source.
 * Reading creates dependency on source, writing throws an error.
 */
export interface ReadonlyBinding<T> {
  readonly value: T
}

/**
 * Check if a value is a binding created by bind()
 */
export function isBinding(value: unknown): value is Binding<unknown> {
  return value !== null && typeof value === 'object' && BINDING_SYMBOL in value
}

// =============================================================================
// BIND - CREATE REACTIVE BINDING
// =============================================================================

/**
 * Create a reactive binding to a signal or another binding.
 *
 * A binding is a "reactive pointer" - it forwards reads and writes to the source.
 * This enables connecting user's reactive state to internal component state.
 *
 * @example
 * ```ts
 * const source = signal(0)
 * const binding = bind(source)
 *
 * // Reading through binding reads from source (creates dependency)
 * console.log(binding.value)  // → 0
 *
 * // Writing through binding writes to source (triggers reactivity)
 * binding.value = 42
 * console.log(source.value)  // → 42
 * ```
 *
 * @example Two-way binding for inputs
 * ```ts
 * const username = signal('')
 * const inputBinding = bind(username)
 *
 * // When user types:
 * inputBinding.value = 'alice'  // Updates username signal!
 * ```
 *
 * @example Chaining bindings
 * ```ts
 * const source = signal(0)
 * const b1 = bind(source)
 * const b2 = bind(b1)  // Points to same source
 *
 * b2.value = 99
 * console.log(source.value)  // → 99
 * ```
 */
/**
 * Check if a value is a signal (has .value property with getter/setter behavior)
 */
function isSignal<T>(value: unknown): value is WritableSignal<T> | ReadableSignal<T> {
  return value !== null && typeof value === 'object' && 'value' in value
}

/**
 * Check if a value is a getter function
 */
function isGetter<T>(value: unknown): value is () => T {
  return typeof value === 'function'
}

/**
 * Check if a value is a static primitive that doesn't need reactive tracking.
 * These values never change, so wrapping them in signals is wasteful.
 */
function isStaticPrimitive(value: unknown): boolean {
  const type = typeof value
  return (
    value === null ||
    value === undefined ||
    type === 'number' ||
    type === 'string' ||
    type === 'boolean'
  )
}

export function bind<T>(source: WritableSignal<T>): Binding<T>
export function bind<T>(source: ReadableSignal<T>): ReadonlyBinding<T>
export function bind<T>(source: Binding<T>): Binding<T>
export function bind<T>(source: ReadonlyBinding<T>): ReadonlyBinding<T>
export function bind<T>(source: () => T): ReadonlyBinding<T>  // Getter function (read-only)
export function bind<T>(source: T): Binding<ExtractInner<T>>  // Raw values or Reactive<U> unions
export function bind<T>(
  source: T | (() => T) | WritableSignal<T> | ReadableSignal<T> | Binding<T> | ReadonlyBinding<T>
): Binding<T> | ReadonlyBinding<T> {
  // Handle getter functions - enables reactive binding to state() properties
  // Example: bind(() => props.content) - reads through state proxy in reactive context
  if (isGetter<T>(source)) {
    const getterBinding = {
      [BINDING_SYMBOL]: true,
      [BINDING_SOURCE_SYMBOL]: null as Source<unknown> | null,
      get value(): T {
        return source()  // Calling getter creates dependency on accessed state!
      },
    }
    return getterBinding as unknown as ReadonlyBinding<T>
  }

  // If source is already a signal or binding, create a forwarding binding
  if (isBinding(source) || isSignal(source)) {
    // Source is reactive - bind directly to it (no internal source needed)
    const actualSource = source as WritableSignal<T> | ReadableSignal<T> | Binding<T> | ReadonlyBinding<T>
    const forwardBinding = {
      [BINDING_SYMBOL]: true,
      [BINDING_SOURCE_SYMBOL]: null as Source<unknown> | null,

      get value(): T {
        return actualSource.value
      },

      set value(v: T) {
        ;(actualSource as WritableSignal<T>).value = v
      },
    }
    return forwardBinding as unknown as Binding<T>
  }

  // OPTIMIZATION: Static primitives don't need reactive tracking
  // They never change, so no signal is needed. This saves ~0.3KB per binding.
  if (isStaticPrimitive(source)) {
    let staticValue = source as T
    const staticBinding = {
      [BINDING_SYMBOL]: true,
      [BINDING_SOURCE_SYMBOL]: null as Source<unknown> | null,

      get value(): T {
        return staticValue
      },

      set value(v: T) {
        staticValue = v
      },
    }
    return staticBinding as unknown as Binding<T>
  }

  // Source is a non-primitive raw value - wrap in a signal for reactivity
  const sig = signal(source as T)
  const internalSource = getSource(sig) ?? null

  const binding = {
    [BINDING_SYMBOL]: true,
    [BINDING_SOURCE_SYMBOL]: internalSource,

    get value(): T {
      return sig.value
    },

    set value(v: T) {
      sig.value = v
    },
  }

  // Register for automatic cleanup when binding is GC'd
  if (internalSource !== null) {
    bindingCleanup.register(binding, internalSource)
  }

  return binding
}

// =============================================================================
// DISCONNECT BINDING - Manual cleanup for edge cases
// =============================================================================

/**
 * Disconnect a binding from the reactive graph.
 *
 * In most cases, this is NOT needed because:
 * 1. Static primitives (numbers, strings, booleans) don't create internal signals
 * 2. Bindings to existing signals forward to them (no internal source)
 * 3. FinalizationRegistry handles cleanup when objects are GC'd
 *
 * Use this ONLY when you have circular references that prevent GC,
 * such as when a binding's internal source is tracked by a long-lived derived.
 *
 * @example
 * ```ts
 * const binding = bind(someNonPrimitiveValue)
 * // ... later, when cleaning up:
 * disconnectBinding(binding)  // Breaks reactive links, allows GC
 * ```
 */
export function disconnectBinding(binding: Binding<unknown> | ReadonlyBinding<unknown> | null | undefined): void {
  if (binding === null || binding === undefined) return

  const internalSource = (binding as unknown as Record<symbol, Source<unknown> | null>)[BINDING_SOURCE_SYMBOL]
  if (internalSource !== null && internalSource !== undefined) {
    disconnectSource(internalSource)
  }
}

/**
 * Check if a binding has an internal source that may need cleanup.
 * Static primitives and forwarding bindings return false.
 */
export function bindingHasInternalSource(binding: Binding<unknown> | ReadonlyBinding<unknown>): boolean {
  const internalSource = (binding as unknown as Record<symbol, Source<unknown> | null>)[BINDING_SOURCE_SYMBOL]
  return internalSource !== null && internalSource !== undefined
}

// =============================================================================
// BIND READONLY - EXPLICIT READ-ONLY BINDING
// =============================================================================

/**
 * Create an explicitly read-only binding.
 * Attempting to write will throw an error at runtime.
 *
 * Use this when you want to ensure a binding is never written to,
 * even if the source is writable.
 *
 * @example
 * ```ts
 * const source = signal(0)
 * const readonly = bindReadonly(source)
 *
 * console.log(readonly.value)  // → 0
 * readonly.value = 42  // Throws: Cannot write to a read-only binding
 * ```
 */
export function bindReadonly<T>(source: ReadableSignal<T> | Binding<T>): ReadonlyBinding<T> {
  return {
    [BINDING_SYMBOL]: true,

    get value(): T {
      return source.value
    },
  } as ReadonlyBinding<T>
}

// =============================================================================
// UNWRAP BINDING
// =============================================================================

/**
 * Get the value from a binding or return the value directly if not a binding.
 * Useful for reading values that may or may not be bound.
 *
 * @example
 * ```ts
 * const arr: (string | Binding<string>)[] = [
 *   'static',
 *   bind(signal('dynamic'))
 * ]
 *
 * arr.map(unwrap)  // → ['static', 'dynamic']
 * ```
 */
export function unwrap<T>(value: T | Binding<T> | ReadonlyBinding<T>): T {
  if (isBinding(value)) {
    return value.value
  }
  // Also handle signal/derived objects that have .value property
  // This enables unified DX: {mySignal} instead of {mySignal.value}
  if (value !== null && typeof value === 'object' && 'value' in value) {
    return (value as { value: T }).value
  }
  return value
}

// =============================================================================
// SIGNALS HELPER - CREATE MULTIPLE SIGNALS AT ONCE
// =============================================================================

/**
 * Create multiple signals from an object.
 * Returns an object with the same keys, where each value is a signal.
 *
 * This is a convenience helper for creating reactive props without
 * declaring each signal individually.
 *
 * @example
 * ```ts
 * // Instead of:
 * const content = signal('hello')
 * const width = signal(40)
 * const visible = signal(true)
 *
 * // Do this:
 * const ui = signals({ content: 'hello', width: 40, visible: true })
 *
 * // Pass to components:
 * text({ content: ui.content })  // ui.content IS a Signal<string>
 *
 * // Update:
 * ui.content.value = 'updated'  // Works!
 * ```
 */
export function signals<T extends Record<string, unknown>>(
  initial: T
): { [K in keyof T]: WritableSignal<T[K]> } {
  const result = {} as { [K in keyof T]: WritableSignal<T[K]> }

  for (const key in initial) {
    if (Object.prototype.hasOwnProperty.call(initial, key)) {
      result[key] = signal(initial[key]) as WritableSignal<T[typeof key]>
    }
  }

  return result
}
