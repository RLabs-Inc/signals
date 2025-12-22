/** Cleanup function returned by effects */
export type CleanupFn = () => void;
/** Effect function that may return a cleanup */
export type EffectFn = () => void | CleanupFn;
/** Equality function for comparing values */
export type EqualityFn<T> = (a: T, b: T) => boolean;
/** A reactive signal that holds a value */
export interface Signal<T> {
    readonly value: T;
}
/** A writable reactive signal */
export interface WritableSignal<T> extends Signal<T> {
    value: T;
}
/** A derived/computed signal (read-only) */
export interface Derived<T> extends Signal<T> {
    readonly value: T;
}
/** Options for creating a signal */
export interface SignalOptions<T> {
    equals?: EqualityFn<T>;
}
/** Default equality check using Object.is */
export declare const defaultEquals: <T>(a: T, b: T) => boolean;
/** Shallow equality for objects/arrays */
export declare const shallowEquals: <T>(a: T, b: T) => boolean;
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
export declare function signal<T>(initial: T, options?: SignalOptions<T>): WritableSignal<T>;
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
export declare function effect(fn: EffectFn): CleanupFn;
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
export declare function derived<T>(fn: () => T, options?: SignalOptions<T>): Derived<T>;
export declare namespace derived {
    var by: typeof derived;
}
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
export declare function batch<T>(fn: () => T): T;
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
export declare function untrack<T>(fn: () => T): T;
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
export declare function state<T extends object>(initial: T): T;
/**
 * Get the raw (non-reactive) version of a reactive object
 */
export declare function toRaw<T>(proxy: T): T;
/**
 * Check if a value is a reactive proxy
 */
export declare function isReactive(value: unknown): boolean;
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
export declare class ReactiveMap<K, V> extends Map<K, V> {
    #private;
    constructor(entries?: Iterable<readonly [K, V]> | null);
    get size(): number;
    has(key: K): boolean;
    get(key: K): V | undefined;
    set(key: K, value: V): this;
    delete(key: K): boolean;
    clear(): void;
    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;
    keys(): MapIterator<K>;
    values(): MapIterator<V>;
    entries(): MapIterator<[K, V]>;
    [Symbol.iterator](): MapIterator<[K, V]>;
}
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
export declare class ReactiveSet<T> extends Set<T> {
    #private;
    constructor(values?: Iterable<T> | null);
    get size(): number;
    has(value: T): boolean;
    add(value: T): this;
    delete(value: T): boolean;
    clear(): void;
    forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void;
    keys(): SetIterator<T>;
    values(): SetIterator<T>;
    entries(): SetIterator<[T, T]>;
    [Symbol.iterator](): SetIterator<T>;
}
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
export declare function reactiveArray<T>(initial?: T[]): T[];
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
export declare function effectScope(): {
    run<T>(fn: () => T): T | undefined;
    stop(): void;
    readonly active: boolean;
};
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
export declare function watch<T>(source: () => T, callback: (newValue: T, oldValue: T | undefined) => void | CleanupFn, options?: {
    immediate?: boolean;
}): CleanupFn;
/**
 * Create a readonly signal from a writable signal
 */
export declare function readonly<T>(sig: WritableSignal<T>): Signal<T>;
/**
 * Compute a value once without reactivity
 */
export declare function peek<T>(fn: () => T): T;
//# sourceMappingURL=index.d.ts.map