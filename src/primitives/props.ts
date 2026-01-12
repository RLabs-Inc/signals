// ============================================================================
// @rlabs-inc/signals - Reactive Props
// Normalize component props to a consistent reactive interface
// ============================================================================

import type { DerivedSignal } from '../core/types.js'
import { derived } from './derived.js'

// =============================================================================
// TYPES
// =============================================================================

/**
 * A prop value can be:
 * - A static value (T)
 * - A getter function (() => T)
 * - A signal-like object with .value property
 */
export type PropInput<T> = T | (() => T) | { readonly value: T }

/**
 * Extract the inner type from a PropInput.
 *
 * @example
 * ```ts
 * type A = UnwrapPropInput<PropInput<string>>  // string
 * type B = UnwrapPropInput<string>             // string
 * type C = UnwrapPropInput<() => number>       // number
 * type D = UnwrapPropInput<Signal<boolean>>    // boolean
 * ```
 */
export type UnwrapPropInput<P> =
  P extends () => infer T ? T :
  P extends { readonly value: infer T } ? T :
  P

/**
 * Unwrap all properties of an object from PropInput to their inner types.
 *
 * @example
 * ```ts
 * interface MyProps {
 *   name: PropInput<string>
 *   count: PropInput<number>
 * }
 * type Resolved = UnwrapPropInputs<MyProps>
 * // { name: string; count: number }
 * ```
 */
export type UnwrapPropInputs<T> = {
  [K in keyof T]: UnwrapPropInput<T[K]>
}

/**
 * The input type for reactiveProps - each property can be any PropInput
 * @deprecated Use the props interface directly with PropInput<T> types
 */
export type PropsInput<T> = {
  [K in keyof T]: PropInput<T[K]>
}

/**
 * The output type - each property is a DerivedSignal
 */
export type ReactiveProps<T> = {
  readonly [K in keyof T]: DerivedSignal<T[K]>
}

// =============================================================================
// REACTIVE PROPS
// =============================================================================

/**
 * Convert component props to a consistent reactive interface.
 *
 * Accepts any combination of:
 * - Static values: `{ name: "hello" }`
 * - Getter functions: `{ name: () => getName() }`
 * - Signals/Deriveds: `{ name: nameSignal }`
 *
 * Returns an object where every property is a DerivedSignal,
 * providing consistent `.value` access regardless of input type.
 *
 * **Type inference is automatic** - no need to specify the resolved type!
 *
 * @example
 * ```ts
 * interface MyComponentProps {
 *   name: PropInput<string>
 *   count: PropInput<number>
 * }
 *
 * function MyComponent(rawProps: MyComponentProps) {
 *   // TypeScript infers: { name: DerivedSignal<string>, count: DerivedSignal<number> }
 *   const props = reactiveProps(rawProps)
 *
 *   // Everything is now consistently reactive
 *   const greeting = derived(() => `Hello, ${props.name.value}!`)
 *   const doubled = derived(() => props.count.value * 2)
 * }
 *
 * // All of these work:
 * MyComponent({ name: "world", count: 42 })
 * MyComponent({ name: () => getName(), count: countSignal })
 * MyComponent({ name: nameSignal, count: () => getCount() })
 * ```
 */
export function reactiveProps<T extends object>(
  rawProps: T
): ReactiveProps<UnwrapPropInputs<T>> {
  const result = {} as ReactiveProps<UnwrapPropInputs<T>>

  for (const key in rawProps) {
    const prop = rawProps[key]

    // Create a derived that reads from whatever input type we got
    ;(result as any)[key] = derived(() => unwrapProp(prop))
  }

  return result
}

/**
 * Unwrap a single prop value to its actual value.
 * Handles static values, getter functions, and signal-like objects.
 */
function unwrapProp<T>(prop: PropInput<T>): T {
  // Getter function - call it (check first since functions are objects)
  if (typeof prop === 'function') {
    return (prop as () => T)()
  }

  // Signal-like object with .value - read it
  if (prop !== null && typeof prop === 'object' && 'value' in prop) {
    return (prop as { readonly value: T }).value
  }

  // Static value - return as-is
  return prop as T
}
