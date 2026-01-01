// ============================================================================
// @rlabs-inc/signals - Reactive Binding
// Creates a reactive link/pointer to another reactive value
// ============================================================================

import type { WritableSignal, ReadableSignal } from '../core/types.js'

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

// =============================================================================
// SYMBOL FOR BINDING DETECTION
// =============================================================================

const BINDING_SYMBOL = Symbol('binding')

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
export function bind<T>(source: WritableSignal<T>): Binding<T>
export function bind<T>(source: ReadableSignal<T>): ReadonlyBinding<T>
export function bind<T>(source: Binding<T>): Binding<T>
export function bind<T>(source: ReadonlyBinding<T>): ReadonlyBinding<T>
export function bind<T>(
  source: WritableSignal<T> | ReadableSignal<T> | Binding<T> | ReadonlyBinding<T>
): Binding<T> | ReadonlyBinding<T> {
  // If source is already a binding, we can chain (bind to the same underlying source)
  // For simplicity, we just create a new forwarding binding
  // This works because binding.value reads from its source, which may read from its source, etc.

  const binding = {
    [BINDING_SYMBOL]: true,

    get value(): T {
      return source.value
    },

    set value(v: T) {
      // TypeScript will prevent this at compile time for ReadableSignal/ReadonlyBinding
      // But at runtime, we need to handle the case
      ;(source as WritableSignal<T>).value = v
    },
  }

  return binding
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
  return value
}
