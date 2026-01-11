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
 * The input type for reactiveProps - each property can be any PropInput
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
 * @example
 * ```ts
 * function MyComponent(rawProps: { name: PropInput<string>, count: PropInput<number> }) {
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
export function reactiveProps<T>(
  rawProps: PropsInput<T>
): ReactiveProps<T> {
  const result = {} as ReactiveProps<T>

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
  // Signal-like object with .value - read it
  if (prop !== null && typeof prop === 'object' && 'value' in prop) {
    return (prop as { readonly value: T }).value
  }

  // Getter function - call it
  if (typeof prop === 'function') {
    return (prop as () => T)()
  }

  // Static value - return as-is
  return prop as T
}
