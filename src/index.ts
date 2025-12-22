// ============================================================================
// @rlabs-inc/signals
// Ultra-lightweight fine-grained reactivity for TypeScript
// Inspired by Svelte 5 runes, Solid.js, and Vue reactivity
// ============================================================================

// =============================================================================
// TYPES
// =============================================================================

/** Cleanup function returned by effects */
export type CleanupFn = () => void

/** Effect function that may return a cleanup */
export type EffectFn = () => void | CleanupFn

/** Equality function for comparing values */
export type EqualityFn<T> = (a: T, b: T) => boolean

/** A reactive signal that holds a value */
export interface Signal<T> {
  readonly value: T
}

/** A writable reactive signal */
export interface WritableSignal<T> extends Signal<T> {
  value: T
}

/** A derived/computed signal (read-only) */
export interface Derived<T> extends Signal<T> {
  readonly value: T
}

/** Options for creating a signal */
export interface SignalOptions<T> {
  equals?: EqualityFn<T>
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface InternalSignal<T> {
  v: T
  reactions: Set<Reaction>
  equals: EqualityFn<T>
}

interface Reaction {
  execute: () => void
  deps: Set<InternalSignal<any>>
  cleanup?: CleanupFn
  active: boolean
}

interface DerivedInternal<T> extends InternalSignal<T> {
  fn: () => T
  dirty: boolean
}

// =============================================================================
// GLOBAL STATE
// =============================================================================

/** Currently executing reaction (effect or derived) */
let activeReaction: Reaction | null = null

/** Stack of reactions for nested effects */
const reactionStack: Reaction[] = []

/** Batch depth for batching updates */
let batchDepth = 0

/** Pending reactions to run after batch completes */
const pendingReactions = new Set<Reaction>()

/** Whether we're currently in untrack mode */
let untracking = false

/** Map from proxy to its internal signal (for deep reactivity) */
const proxyToSignal = new WeakMap<object, InternalSignal<any>>()

/** Map from raw object to its proxy (for deep reactivity) */
const rawToProxy = new WeakMap<object, any>()

// =============================================================================
// EQUALITY FUNCTIONS
// =============================================================================

/** Default equality check using Object.is */
export const defaultEquals = <T>(a: T, b: T): boolean => Object.is(a, b)

/** Shallow equality for objects/arrays */
export const shallowEquals = <T>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (a === null || b === null) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!Object.is((a as any)[key], (b as any)[key])) return false
  }

  return true
}

// =============================================================================
// CORE: SIGNAL
// =============================================================================

/**
 * Create a reactive signal
 *
 * For objects and arrays, the signal is deeply reactive - mutations at any
 * depth will trigger effects.
 *
 * @example
 * ```ts
 * const count = signal(0)
 * console.log(count.value) // 0
 * count.value = 1
 * console.log(count.value) // 1
 *
 * // Deep reactivity for objects/arrays
 * const user = signal({ name: 'John', address: { city: 'NYC' } })
 * user.value.address.city = 'LA' // Triggers effects!
 *
 * const items = signal([[1, 2], [3, 4]])
 * items.value[0][1] = 99 // Triggers effects!
 * ```
 */
export function signal<T>(initial: T, options?: SignalOptions<T>): WritableSignal<T> {
  const internal: InternalSignal<T> = {
    v: initial,
    reactions: new Set(),
    equals: options?.equals ?? defaultEquals,
  }

  // Cache for deep reactive proxy (only used for objects/arrays)
  let proxyCache: T | null = null

  return {
    get value(): T {
      track(internal)

      // For objects/arrays, return a deep reactive proxy
      if (internal.v !== null && typeof internal.v === 'object') {
        if (!proxyCache) {
          proxyCache = createDeepReactiveForSignal(internal.v as object, internal) as T
        }
        return proxyCache
      }

      return internal.v
    },
    set value(newValue: T) {
      if (!internal.equals(internal.v, newValue)) {
        internal.v = newValue
        proxyCache = null // Invalidate proxy cache on full replacement
        trigger(internal)
      }
    },
  }
}

// =============================================================================
// CORE: EFFECT
// =============================================================================

/**
 * Create a reactive effect that re-runs when dependencies change
 *
 * @returns Dispose function to stop the effect
 *
 * @example
 * ```ts
 * const count = signal(0)
 * const dispose = effect(() => {
 *   console.log('Count:', count.value)
 * })
 * // Logs: "Count: 0"
 *
 * count.value = 1
 * // Logs: "Count: 1"
 *
 * dispose() // Stop the effect
 * ```
 */
export function effect(fn: EffectFn): CleanupFn {
  const reaction: Reaction = {
    execute: () => {
      // Clean up previous run
      if (reaction.cleanup) {
        reaction.cleanup()
        reaction.cleanup = undefined
      }

      // Remove from all previous dependencies
      for (const dep of reaction.deps) {
        dep.reactions.delete(reaction)
      }
      reaction.deps.clear()

      // Run the effect and collect new dependencies
      reactionStack.push(reaction)
      const prevReaction = activeReaction
      activeReaction = reaction

      try {
        const cleanup = fn()
        if (typeof cleanup === 'function') {
          reaction.cleanup = cleanup
        }
      } finally {
        activeReaction = prevReaction
        reactionStack.pop()
      }
    },
    deps: new Set(),
    active: true,
  }

  // Run immediately to collect initial dependencies
  reaction.execute()

  // Return dispose function
  return () => {
    if (!reaction.active) return
    reaction.active = false

    if (reaction.cleanup) {
      reaction.cleanup()
    }

    for (const dep of reaction.deps) {
      dep.reactions.delete(reaction)
    }
    reaction.deps.clear()
  }
}

// =============================================================================
// CORE: DERIVED
// =============================================================================

/**
 * Create a derived/computed value that automatically updates
 *
 * @example
 * ```ts
 * const count = signal(0)
 * const doubled = derived(() => count.value * 2)
 * console.log(doubled.value) // 0
 *
 * count.value = 5
 * console.log(doubled.value) // 10
 * ```
 */
export function derived<T>(fn: () => T, options?: SignalOptions<T>): Derived<T> {
  const internal: DerivedInternal<T> = {
    v: undefined as T,
    reactions: new Set(),
    equals: options?.equals ?? defaultEquals,
    fn,
    dirty: true,
  }

  const deps = new Set<InternalSignal<any>>()

  // Helper to mark as dirty without recomputing
  const markDirty = () => {
    if (!internal.dirty) {
      internal.dirty = true
      // Notify our dependents that we're dirty (they should also be marked dirty)
      trigger(internal)
    }
  }

  // Recompute the derived value
  const recompute = () => {
    // Remove from all previous dependencies
    for (const dep of deps) {
      dep.reactions.delete(derivedReaction)
    }
    deps.clear()

    // Compute new value with tracking
    const prevReaction = activeReaction
    activeReaction = derivedReaction

    try {
      const newValue = fn()
      internal.v = newValue
    } finally {
      activeReaction = prevReaction
    }

    internal.dirty = false
  }

  // A pseudo-reaction for tracking dependencies
  const derivedReaction: Reaction = {
    execute: markDirty,
    deps,
    active: true,
  }

  return {
    get value(): T {
      // Track this derived as a dependency of the current reaction
      track(internal)

      // Recompute if dirty
      if (internal.dirty) {
        recompute()
      }

      return internal.v
    },
  }
}

/**
 * Alias for derived - matches Svelte's $derived.by() API
 */
derived.by = derived

// =============================================================================
// CORE: BATCH
// =============================================================================

/**
 * Batch multiple updates into a single reaction cycle
 *
 * @example
 * ```ts
 * const a = signal(1)
 * const b = signal(2)
 *
 * effect(() => console.log(a.value + b.value))
 * // Logs: 3
 *
 * batch(() => {
 *   a.value = 10
 *   b.value = 20
 * })
 * // Logs: 30 (only once, not twice)
 * ```
 */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      flushPending()
    }
  }
}

// =============================================================================
// CORE: UNTRACK
// =============================================================================

/**
 * Read signals without creating dependencies
 *
 * @example
 * ```ts
 * const a = signal(1)
 * const b = signal(2)
 *
 * effect(() => {
 *   console.log(a.value) // Creates dependency
 *   untrack(() => {
 *     console.log(b.value) // Does NOT create dependency
 *   })
 * })
 * ```
 */
export function untrack<T>(fn: () => T): T {
  const prev = untracking
  untracking = true
  try {
    return fn()
  } finally {
    untracking = prev
  }
}

// =============================================================================
// INTERNAL: TRACKING
// =============================================================================

/** Track a signal as a dependency of the current reaction */
function track<T>(signal: InternalSignal<T>): void {
  if (activeReaction && !untracking) {
    activeReaction.deps.add(signal)
    signal.reactions.add(activeReaction)
  }
}

/** Notify all reactions that depend on this signal */
function trigger<T>(signal: InternalSignal<T>): void {
  const reactions = [...signal.reactions]

  for (const reaction of reactions) {
    if (!reaction.active) continue

    // Mark derived signals as dirty
    if ('dirty' in reaction) {
      (reaction as any).dirty = true
    }

    if (batchDepth > 0) {
      pendingReactions.add(reaction)
    } else {
      reaction.execute()
    }
  }
}

/** Flush all pending reactions */
function flushPending(): void {
  const reactions = [...pendingReactions]
  pendingReactions.clear()

  for (const reaction of reactions) {
    if (reaction.active) {
      reaction.execute()
    }
  }
}

// =============================================================================
// DEEP REACTIVITY: STATE (Proxy-based)
// =============================================================================

const REACTIVE_MARKER = Symbol('reactive')

/**
 * Create a deeply reactive state object
 * All nested properties are automatically reactive
 *
 * @example
 * ```ts
 * const user = state({
 *   name: 'John',
 *   address: {
 *     city: 'NYC'
 *   }
 * })
 *
 * effect(() => {
 *   console.log(user.address.city)
 * })
 * // Logs: "NYC"
 *
 * user.address.city = 'LA'
 * // Logs: "LA"
 * ```
 */
export function state<T extends object>(initial: T): T {
  return createDeepReactive(initial)
}

/** Check if a value should be made reactive */
function shouldProxy(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false
  if ((value as any)[REACTIVE_MARKER]) return false // Is already a proxy

  // Only proxy plain objects and arrays
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === Array.prototype || proto === null
}

/** Create a deeply reactive proxy */
function createDeepReactive<T extends object>(target: T): T {
  // Return existing proxy if already created
  const existing = rawToProxy.get(target)
  if (existing) return existing

  // Create internal signal for this object (for iteration/keys tracking)
  const internal: InternalSignal<T> = {
    v: target,
    reactions: new Set(),
    equals: defaultEquals,
  }

  // Create property signals for fine-grained tracking
  const propSignals = new Map<string | symbol, InternalSignal<any>>()

  const getPropSignal = (prop: string | symbol): InternalSignal<any> => {
    let sig = propSignals.get(prop)
    if (!sig) {
      sig = {
        v: (target as any)[prop],
        reactions: new Set(),
        equals: defaultEquals,
      }
      propSignals.set(prop, sig)
    }
    return sig
  }

  const proxy = new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === REACTIVE_MARKER) return true

      const value = Reflect.get(target, prop, receiver)

      // For array methods, bind them to the proxy and track
      if (Array.isArray(target) && typeof value === 'function') {
        // Track array version for methods that read
        track(internal)
        return value.bind(proxy)
      }

      // Track access to this specific property
      const sig = getPropSignal(prop)
      track(sig)

      // Make nested objects reactive
      if (shouldProxy(value)) {
        // Check if we already have a proxy for this nested object
        const existingProxy = rawToProxy.get(value)
        if (existingProxy) return existingProxy
        return createDeepReactive(value)
      }

      return value
    },

    set(target, prop, value, receiver) {
      const oldValue = (target as any)[prop]

      // Unwrap reactive values
      const rawValue = (value as any)?.[REACTIVE_MARKER] ? proxyToRaw.get(value) ?? value : value

      if (Object.is(oldValue, rawValue)) return true

      const result = Reflect.set(target, prop, rawValue, receiver)

      if (result) {
        // Trigger property signal
        const sig = getPropSignal(prop)
        sig.v = rawValue
        trigger(sig)

        // For arrays, also trigger internal signal on length changes or mutations
        if (Array.isArray(target)) {
          internal.v = target
          trigger(internal)
        }
      }

      return result
    },

    deleteProperty(target, prop) {
      const hadKey = prop in target
      const result = Reflect.deleteProperty(target, prop)

      if (result && hadKey) {
        const sig = propSignals.get(prop)
        if (sig) {
          sig.v = undefined
          trigger(sig)
        }
        trigger(internal)
      }

      return result
    },

    has(target, prop) {
      if (prop === REACTIVE_MARKER) return true
      track(internal)
      return Reflect.has(target, prop)
    },

    ownKeys(target) {
      track(internal)
      return Reflect.ownKeys(target)
    },
  })

  // Store mappings
  rawToProxy.set(target, proxy)
  proxyToRaw.set(proxy, target)
  proxyToSignal.set(proxy, internal)

  return proxy as T
}

/** Map from proxy back to raw object */
const proxyToRaw = new WeakMap<object, object>()

/** Map from signal-owned proxies to their parent signal (for triggering) */
const signalProxyCache = new WeakMap<object, object>()

/**
 * Create a deeply reactive proxy that triggers a parent signal on mutation
 * Used by signal() for deep reactivity on objects/arrays
 */
function createDeepReactiveForSignal<T extends object>(target: T, parentSignal: InternalSignal<any>): T {
  // Return existing proxy if already created for this signal
  const existingProxy = signalProxyCache.get(target)
  if (existingProxy) return existingProxy as T

  // Create property signals for fine-grained tracking
  const propSignals = new Map<string | symbol, InternalSignal<any>>()

  const getPropSignal = (prop: string | symbol): InternalSignal<any> => {
    let sig = propSignals.get(prop)
    if (!sig) {
      sig = {
        v: (target as any)[prop],
        reactions: new Set(),
        equals: defaultEquals,
      }
      propSignals.set(prop, sig)
    }
    return sig
  }

  // Internal signal for array/iteration tracking
  const internal: InternalSignal<T> = {
    v: target,
    reactions: new Set(),
    equals: defaultEquals,
  }

  const proxy = new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === REACTIVE_MARKER) return true

      const value = Reflect.get(target, prop, receiver)

      // For array methods, bind them to the proxy and track
      if (Array.isArray(target) && typeof value === 'function') {
        track(internal)
        return value.bind(proxy)
      }

      // Track access to this specific property (fine-grained)
      const sig = getPropSignal(prop)
      track(sig)

      // Make nested objects/arrays deeply reactive
      if (value !== null && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value)
        if (proto === Object.prototype || proto === Array.prototype || proto === null) {
          if (!(value as any)[REACTIVE_MARKER]) {
            return createDeepReactiveForSignal(value, parentSignal)
          }
        }
      }

      return value
    },

    set(target, prop, value, receiver) {
      const oldValue = (target as any)[prop]

      // Unwrap reactive values
      const rawValue = (value as any)?.[REACTIVE_MARKER] ? proxyToRaw.get(value) ?? value : value

      if (Object.is(oldValue, rawValue)) return true

      const result = Reflect.set(target, prop, rawValue, receiver)

      if (result) {
        // Batch all triggers together so effects only run once
        batch(() => {
          // Trigger property signal
          const sig = getPropSignal(prop)
          sig.v = rawValue
          trigger(sig)

          // Always trigger parent signal on any mutation
          trigger(parentSignal)

          // For arrays, also trigger internal signal
          if (Array.isArray(target)) {
            internal.v = target as any
            trigger(internal)
          }
        })
      }

      return result
    },

    deleteProperty(target, prop) {
      const hadKey = prop in target
      const result = Reflect.deleteProperty(target, prop)

      if (result && hadKey) {
        batch(() => {
          const sig = propSignals.get(prop)
          if (sig) {
            sig.v = undefined
            trigger(sig)
          }
          trigger(parentSignal)
          trigger(internal)
        })
      }

      return result
    },

    has(target, prop) {
      if (prop === REACTIVE_MARKER) return true
      track(internal)
      return Reflect.has(target, prop)
    },

    ownKeys(target) {
      track(internal)
      return Reflect.ownKeys(target)
    },
  })

  // Store in cache
  signalProxyCache.set(target, proxy)
  proxyToRaw.set(proxy, target)

  return proxy as T
}

/**
 * Get the raw (non-reactive) version of a reactive object
 */
export function toRaw<T>(proxy: T): T {
  if (proxy && typeof proxy === 'object' && (proxy as any)[REACTIVE_MARKER]) {
    return (proxyToRaw.get(proxy as object) as T) ?? proxy
  }
  return proxy
}

/**
 * Check if a value is a reactive proxy
 */
export function isReactive(value: unknown): boolean {
  return value !== null && typeof value === 'object' && (value as any)[REACTIVE_MARKER] === true
}

// =============================================================================
// REACTIVE COLLECTIONS: ReactiveMap
// =============================================================================

/**
 * A reactive Map that triggers updates on modifications
 *
 * @example
 * ```ts
 * const map = new ReactiveMap<string, number>()
 *
 * effect(() => {
 *   console.log('Size:', map.size)
 *   console.log('Has foo:', map.has('foo'))
 * })
 *
 * map.set('foo', 42) // Triggers effect
 * ```
 */
export class ReactiveMap<K, V> extends Map<K, V> {
  #keySignals = new Map<K, InternalSignal<number>>()
  #version: InternalSignal<number> = { v: 0, reactions: new Set(), equals: defaultEquals }
  #size: InternalSignal<number> = { v: 0, reactions: new Set(), equals: defaultEquals }

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super()
    if (entries) {
      for (const [key, value] of entries) {
        super.set(key, value)
      }
      this.#size.v = super.size
    }
  }

  #getKeySignal(key: K): InternalSignal<number> {
    let sig = this.#keySignals.get(key)
    if (!sig) {
      sig = { v: 0, reactions: new Set(), equals: defaultEquals }
      this.#keySignals.set(key, sig)
    }
    return sig
  }

  get size(): number {
    track(this.#size)
    return super.size
  }

  has(key: K): boolean {
    const sig = this.#getKeySignal(key)
    track(sig)
    return super.has(key)
  }

  get(key: K): V | undefined {
    const sig = this.#getKeySignal(key)
    track(sig)
    return super.get(key)
  }

  set(key: K, value: V): this {
    const isNew = !super.has(key)
    const oldValue = super.get(key)

    super.set(key, value)

    const sig = this.#getKeySignal(key)

    if (isNew) {
      this.#size.v = super.size
      trigger(this.#size)
      this.#version.v++
      trigger(this.#version)
      sig.v++
      trigger(sig)
    } else if (!Object.is(oldValue, value)) {
      sig.v++
      trigger(sig)
    }

    return this
  }

  delete(key: K): boolean {
    const had = super.has(key)
    const result = super.delete(key)

    if (had) {
      const sig = this.#keySignals.get(key)
      if (sig) {
        sig.v = -1
        trigger(sig)
        this.#keySignals.delete(key)
      }
      this.#size.v = super.size
      trigger(this.#size)
      this.#version.v++
      trigger(this.#version)
    }

    return result
  }

  clear(): void {
    if (super.size === 0) return

    for (const sig of this.#keySignals.values()) {
      sig.v = -1
      trigger(sig)
    }

    super.clear()
    this.#keySignals.clear()
    this.#size.v = 0
    trigger(this.#size)
    this.#version.v++
    trigger(this.#version)
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    track(this.#version)
    super.forEach(callbackfn, thisArg)
  }

  keys(): MapIterator<K> {
    track(this.#version)
    return super.keys()
  }

  values(): MapIterator<V> {
    track(this.#version)
    return super.values()
  }

  entries(): MapIterator<[K, V]> {
    track(this.#version)
    return super.entries()
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }
}

// =============================================================================
// REACTIVE COLLECTIONS: ReactiveSet
// =============================================================================

/**
 * A reactive Set that triggers updates on modifications
 *
 * @example
 * ```ts
 * const set = new ReactiveSet<string>()
 *
 * effect(() => {
 *   console.log('Size:', set.size)
 *   console.log('Has foo:', set.has('foo'))
 * })
 *
 * set.add('foo') // Triggers effect
 * ```
 */
export class ReactiveSet<T> extends Set<T> {
  #itemSignals = new Map<T, InternalSignal<boolean>>()
  #version: InternalSignal<number> = { v: 0, reactions: new Set(), equals: defaultEquals }
  #size: InternalSignal<number> = { v: 0, reactions: new Set(), equals: defaultEquals }

  constructor(values?: Iterable<T> | null) {
    super()
    if (values) {
      for (const value of values) {
        super.add(value)
      }
      this.#size.v = super.size
    }
  }

  #getItemSignal(item: T): InternalSignal<boolean> {
    let sig = this.#itemSignals.get(item)
    if (!sig) {
      sig = { v: super.has(item), reactions: new Set(), equals: defaultEquals }
      this.#itemSignals.set(item, sig)
    }
    return sig
  }

  get size(): number {
    track(this.#size)
    return super.size
  }

  has(value: T): boolean {
    const sig = this.#getItemSignal(value)
    track(sig)
    return super.has(value)
  }

  add(value: T): this {
    if (!super.has(value)) {
      super.add(value)

      // Trigger item signal
      const sig = this.#getItemSignal(value)
      sig.v = true
      trigger(sig)

      this.#size.v = super.size
      trigger(this.#size)
      this.#version.v++
      trigger(this.#version)
    }
    return this
  }

  delete(value: T): boolean {
    const had = super.has(value)
    const result = super.delete(value)

    if (had) {
      const sig = this.#itemSignals.get(value)
      if (sig) {
        sig.v = false
        trigger(sig)
        this.#itemSignals.delete(value)
      }
      this.#size.v = super.size
      trigger(this.#size)
      this.#version.v++
      trigger(this.#version)
    }

    return result
  }

  clear(): void {
    if (super.size === 0) return

    for (const sig of this.#itemSignals.values()) {
      sig.v = false
      trigger(sig)
    }

    super.clear()
    this.#itemSignals.clear()
    this.#size.v = 0
    trigger(this.#size)
    this.#version.v++
    trigger(this.#version)
  }

  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
    track(this.#version)
    super.forEach(callbackfn, thisArg)
  }

  keys(): SetIterator<T> {
    track(this.#version)
    return super.keys()
  }

  values(): SetIterator<T> {
    track(this.#version)
    return super.values()
  }

  entries(): SetIterator<[T, T]> {
    track(this.#version)
    return super.entries()
  }

  [Symbol.iterator](): SetIterator<T> {
    return this.values()
  }
}

// =============================================================================
// REACTIVE COLLECTIONS: ReactiveArray
// =============================================================================

/**
 * Create a reactive array with fine-grained reactivity
 *
 * @example
 * ```ts
 * const items = reactiveArray([1, 2, 3])
 *
 * effect(() => {
 *   console.log('Length:', items.length)
 *   console.log('First:', items[0])
 * })
 *
 * items.push(4)    // Triggers effect
 * items[0] = 10    // Triggers effect
 * ```
 */
export function reactiveArray<T>(initial: T[] = []): T[] {
  const internal: InternalSignal<number> = {
    v: 0,
    reactions: new Set(),
    equals: defaultEquals,
  }

  const indexSignals = new Map<number, InternalSignal<T | undefined>>()
  const lengthSignal: InternalSignal<number> = {
    v: initial.length,
    reactions: new Set(),
    equals: defaultEquals,
  }

  const getIndexSignal = (index: number): InternalSignal<T | undefined> => {
    let sig = indexSignals.get(index)
    if (!sig) {
      sig = { v: initial[index], reactions: new Set(), equals: defaultEquals }
      indexSignals.set(index, sig)
    }
    return sig
  }

  const array = [...initial]

  const proxy = new Proxy(array, {
    get(target, prop, receiver) {
      if (prop === 'length') {
        track(lengthSignal)
        return target.length
      }

      const index = typeof prop === 'string' ? parseInt(prop, 10) : NaN
      if (!isNaN(index)) {
        const sig = getIndexSignal(index)
        track(sig)
        return target[index]
      }

      // Handle array methods
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') {
        return function (this: any, ...args: any[]) {
          const method = prop as string

          // Methods that read the array
          if (['indexOf', 'includes', 'find', 'findIndex', 'some', 'every', 'forEach', 'map', 'filter', 'reduce', 'reduceRight', 'join', 'toString'].includes(method)) {
            track(internal)
            return value.apply(target, args)
          }

          // Methods that mutate the array
          const prevLength = target.length
          const result = value.apply(target, args)
          const newLength = target.length

          if (newLength !== prevLength) {
            lengthSignal.v = newLength
            trigger(lengthSignal)
          }

          if (['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'].includes(method)) {
            internal.v++
            trigger(internal)

            // Update affected index signals
            for (let i = 0; i < Math.max(prevLength, newLength); i++) {
              const sig = indexSignals.get(i)
              if (sig && !Object.is(sig.v, target[i])) {
                sig.v = target[i]
                trigger(sig)
              }
            }
          }

          return result
        }
      }

      return value
    },

    set(target, prop, value, receiver) {
      if (prop === 'length') {
        const oldLength = target.length
        target.length = value

        if (oldLength !== value) {
          lengthSignal.v = value
          trigger(lengthSignal)
          internal.v++
          trigger(internal)
        }

        return true
      }

      const index = typeof prop === 'string' ? parseInt(prop, 10) : NaN
      if (!isNaN(index)) {
        const oldValue = target[index]
        if (!Object.is(oldValue, value)) {
          target[index] = value

          const sig = getIndexSignal(index)
          sig.v = value
          trigger(sig)

          if (index >= lengthSignal.v) {
            lengthSignal.v = target.length
            trigger(lengthSignal)
          }

          internal.v++
          trigger(internal)
        }
        return true
      }

      return Reflect.set(target, prop, value, receiver)
    },
  })

  return proxy
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Create an effect scope for grouping and disposing multiple effects
 *
 * @example
 * ```ts
 * const scope = effectScope()
 *
 * scope.run(() => {
 *   effect(() => console.log('Effect 1'))
 *   effect(() => console.log('Effect 2'))
 * })
 *
 * scope.stop() // Disposes all effects in the scope
 * ```
 */
export function effectScope() {
  const disposers: CleanupFn[] = []
  let active = true

  return {
    run<T>(fn: () => T): T | undefined {
      if (!active) return undefined

      const originalEffect = effect
      // @ts-ignore - monkey patch temporarily
      globalThis.__signalEffect = effect

      const wrappedEffect: typeof effect = (effectFn) => {
        const dispose = originalEffect(effectFn)
        disposers.push(dispose)
        return dispose
      }

      // Replace global effect temporarily
      const prevEffect = (globalThis as any).__effectOverride
      ;(globalThis as any).__effectOverride = wrappedEffect

      try {
        return fn()
      } finally {
        ;(globalThis as any).__effectOverride = prevEffect
      }
    },

    stop() {
      if (!active) return
      active = false

      for (const dispose of disposers) {
        dispose()
      }
      disposers.length = 0
    },

    get active() {
      return active
    },
  }
}

/**
 * Watch a signal or derived and call callback when it changes
 * Like effect but only runs the callback, not for initial subscription
 *
 * @example
 * ```ts
 * const count = signal(0)
 *
 * watch(
 *   () => count.value,
 *   (newValue, oldValue) => {
 *     console.log(`Changed from ${oldValue} to ${newValue}`)
 *   }
 * )
 *
 * count.value = 1 // Logs: "Changed from 0 to 1"
 * ```
 */
export function watch<T>(
  source: () => T,
  callback: (newValue: T, oldValue: T | undefined) => void | CleanupFn,
  options?: { immediate?: boolean }
): CleanupFn {
  let oldValue: T | undefined
  let cleanup: void | CleanupFn
  let first = true

  return effect(() => {
    const newValue = source()

    if (first) {
      first = false
      oldValue = newValue
      if (options?.immediate) {
        cleanup = callback(newValue, undefined)
      }
      return
    }

    if (!Object.is(newValue, oldValue)) {
      if (typeof cleanup === 'function') {
        cleanup()
      }
      cleanup = callback(newValue, oldValue)
      oldValue = newValue
    }
  })
}

/**
 * Create a readonly signal from a writable signal
 */
export function readonly<T>(sig: WritableSignal<T>): Signal<T> {
  return {
    get value() {
      return sig.value
    },
  }
}

/**
 * Compute a value once without reactivity
 */
export function peek<T>(fn: () => T): T {
  return untrack(fn)
}
