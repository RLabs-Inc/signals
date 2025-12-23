// ============================================================================
// @rlabs-inc/signals - Deep Reactivity via Proxy
// Makes nested objects/arrays fully reactive at any depth
// Based on Svelte 5's proxy implementation
// ============================================================================

import type { Source } from '../core/types.js'
import { STATE_SYMBOL, UNINITIALIZED } from '../core/constants.js'
import { source } from '../primitives/signal.js'
import { get, set } from '../reactivity/tracking.js'
import {
  activeReaction,
  readVersion,
  setActiveReaction,
} from '../core/globals.js'

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if a value should be proxied
 * Only plain objects and arrays are proxied
 */
function shouldProxy(value: unknown): value is object {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === Array.prototype || proto === null
}

/**
 * Check if a value is already a proxy
 */
function isProxy(value: unknown): boolean {
  return value !== null && typeof value === 'object' && STATE_SYMBOL in value
}

/**
 * Check if a property is writable
 */
function isWritable(target: object, prop: PropertyKey): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(target, prop)
  return descriptor === undefined || descriptor.writable === true
}

// =============================================================================
// PROXY CREATION
// =============================================================================

/**
 * Create a deeply reactive proxy for an object or array
 *
 * Key features:
 * 1. Per-property signals (lazy creation)
 * 2. Version signal for structural changes (add/delete)
 * 3. Recursive proxying of nested objects
 * 4. Fine-grained reactivity at every level
 */
export function proxy<T extends object>(value: T): T {
  // Don't re-proxy
  if (!shouldProxy(value) || isProxy(value)) {
    return value
  }

  // Per-property signals (created lazily on access)
  const sources = new Map<PropertyKey, Source<unknown>>()

  // Version signal for structural changes
  const version = source(0)

  // Is this an array?
  const isArray = Array.isArray(value)

  // For arrays, eagerly create length signal
  if (isArray) {
    sources.set('length', source((value as unknown[]).length))
  }

  // Capture the read version at proxy creation time
  // This prevents child sources from becoming dependencies of the current reaction
  const parentReadVersion = readVersion

  /**
   * Execute a function in the parent context
   * Prevents child source creation from tracking in current reaction
   */
  const withParent = <R>(fn: () => R): R => {
    if (readVersion === parentReadVersion) {
      return fn()
    }

    const prevReaction = activeReaction
    setActiveReaction(null)

    try {
      return fn()
    } finally {
      setActiveReaction(prevReaction)
    }
  }

  /**
   * Get or create a source for a property
   */
  const getSource = (prop: PropertyKey, initialValue: unknown): Source<unknown> => {
    let s = sources.get(prop)

    if (s === undefined) {
      s = withParent(() => {
        // Recursively proxy nested objects
        const proxied = shouldProxy(initialValue) ? proxy(initialValue as object) : initialValue
        return source(proxied)
      })
      sources.set(prop, s)
    }

    return s
  }

  // Create the proxy
  const proxyObj = new Proxy(value, {
    // =========================================================================
    // GET TRAP - Read property with tracking
    // =========================================================================
    get(target, prop, receiver) {
      // Return the original value for the state symbol
      if (prop === STATE_SYMBOL) {
        return value
      }

      const exists = prop in target
      const currentValue = Reflect.get(target, prop, receiver)

      // For array methods, track version and return bound method
      if (isArray && typeof currentValue === 'function') {
        get(version)
        return currentValue.bind(proxyObj)
      }

      // Get or create source for this property
      if (exists || isWritable(target, prop)) {
        const s = getSource(prop, currentValue)
        const val = get(s)

        // Handle UNINITIALIZED (deleted property)
        if (val === UNINITIALIZED) {
          return undefined
        }

        return val
      }

      return currentValue
    },

    // =========================================================================
    // SET TRAP - Write property with triggering
    // =========================================================================
    set(target, prop, newValue, receiver) {
      const exists = prop in target

      // Get or create source
      let s = sources.get(prop)

      if (s === undefined) {
        if (!exists && !isWritable(target, prop)) {
          return false
        }

        s = withParent(() => source(undefined))
        sources.set(prop, s)
      }

      // Proxy the new value if needed
      const proxied = withParent(() =>
        shouldProxy(newValue) ? proxy(newValue as object) : newValue
      )

      // Update the source (triggers reactions)
      set(s, proxied)

      // Update the actual target
      Reflect.set(target, prop, newValue, receiver)

      // Handle array length changes
      if (isArray && prop === 'length') {
        const oldLength = (s as Source<number>).v
        const newLength = newValue as number

        // Mark removed indices as UNINITIALIZED
        for (let i = newLength; i < oldLength; i++) {
          const indexKey = String(i)
          const indexSource = sources.get(indexKey)

          if (indexSource !== undefined) {
            set(indexSource, UNINITIALIZED)
          } else if (i in target) {
            // Create source marked as deleted
            const deletedSource = withParent(() => source(UNINITIALIZED))
            sources.set(indexKey, deletedSource)
          }
        }
      }

      // Handle array index that extends length
      if (isArray && typeof prop === 'string') {
        const index = Number(prop)
        if (Number.isInteger(index) && index >= 0) {
          const lengthSource = sources.get('length') as Source<number> | undefined
          if (lengthSource !== undefined && index >= lengthSource.v) {
            set(lengthSource, index + 1)
          }
        }
      }

      // New property - increment version
      if (!exists) {
        set(version, get(version) + 1)
      }

      return true
    },

    // =========================================================================
    // DELETE PROPERTY TRAP
    // =========================================================================
    deleteProperty(target, prop) {
      const exists = prop in target

      if (exists) {
        let s = sources.get(prop)

        if (s === undefined) {
          // Create source marked as deleted
          s = withParent(() => source(UNINITIALIZED))
          sources.set(prop, s)
        } else {
          set(s, UNINITIALIZED)
        }

        // Increment version (structural change)
        set(version, get(version) + 1)
      }

      return Reflect.deleteProperty(target, prop)
    },

    // =========================================================================
    // HAS TRAP - 'in' operator
    // =========================================================================
    has(target, prop) {
      if (prop === STATE_SYMBOL) {
        return true
      }

      // Track version for existence checks
      get(version)

      // Check source if exists
      const s = sources.get(prop)
      if (s !== undefined) {
        const val = get(s)
        if (val === UNINITIALIZED) {
          return false
        }
      }

      return Reflect.has(target, prop)
    },

    // =========================================================================
    // OWN KEYS TRAP - Object.keys(), etc.
    // =========================================================================
    ownKeys(target) {
      // Track version for iteration
      get(version)

      // Get keys from target, filter out UNINITIALIZED
      const keys = Reflect.ownKeys(target).filter(key => {
        const s = sources.get(key)
        return s === undefined || s.v !== UNINITIALIZED
      })

      // Add keys from sources that aren't in target but aren't UNINITIALIZED
      for (const [key, s] of sources) {
        if (s.v !== UNINITIALIZED && !(key in target) && !keys.includes(key)) {
          keys.push(key)
        }
      }

      return keys
    },

    // =========================================================================
    // GET OWN PROPERTY DESCRIPTOR
    // =========================================================================
    getOwnPropertyDescriptor(target, prop) {
      const s = sources.get(prop)

      if (s !== undefined && s.v === UNINITIALIZED) {
        return undefined
      }

      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
  })

  return proxyObj as T
}

// =============================================================================
// UNWRAP PROXY
// =============================================================================

/**
 * Get the raw (non-reactive) value from a proxy
 */
export function toRaw<T>(value: T): T {
  if (value !== null && typeof value === 'object' && STATE_SYMBOL in value) {
    return (value as Record<symbol, T>)[STATE_SYMBOL]
  }
  return value
}

/**
 * Check if a value is a reactive proxy
 */
export function isReactive(value: unknown): boolean {
  return isProxy(value)
}
