// ============================================================================
// @rlabs-inc/signals - ReactiveDate
// A Date with reactive updates
// Based on Svelte 5's SvelteDate
// ============================================================================

import type { Source } from '../core/types.js'
import { source } from '../primitives/signal.js'
import { get, set } from '../reactivity/tracking.js'

// =============================================================================
// REACTIVE DATE
// =============================================================================

/**
 * A reactive Date
 *
 * All getters are reactive - they track changes to the underlying time.
 * All setters trigger updates.
 *
 * @example
 * ```ts
 * const date = new ReactiveDate()
 *
 * effect(() => {
 *   console.log('Hours:', date.getHours())
 * })
 *
 * date.setHours(12) // Triggers effect
 * ```
 */
export class ReactiveDate extends Date {
  // Internal time signal
  #time: Source<number>

  constructor()
  constructor(value: number | string | Date)
  constructor(
    year: number,
    monthIndex: number,
    date?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
    ms?: number
  )
  constructor(...args: unknown[]) {
    // @ts-expect-error - complex constructor overloads
    super(...args)
    this.#time = source(super.getTime())
  }

  /**
   * Update the internal time and trigger reactions
   */
  #update(): number {
    const time = super.getTime()
    set(this.#time, time)
    return time
  }

  // ===========================================================================
  // GETTERS (reactive)
  // ===========================================================================

  getTime(): number {
    get(this.#time)
    return super.getTime()
  }

  getFullYear(): number {
    get(this.#time)
    return super.getFullYear()
  }

  getMonth(): number {
    get(this.#time)
    return super.getMonth()
  }

  getDate(): number {
    get(this.#time)
    return super.getDate()
  }

  getDay(): number {
    get(this.#time)
    return super.getDay()
  }

  getHours(): number {
    get(this.#time)
    return super.getHours()
  }

  getMinutes(): number {
    get(this.#time)
    return super.getMinutes()
  }

  getSeconds(): number {
    get(this.#time)
    return super.getSeconds()
  }

  getMilliseconds(): number {
    get(this.#time)
    return super.getMilliseconds()
  }

  getUTCFullYear(): number {
    get(this.#time)
    return super.getUTCFullYear()
  }

  getUTCMonth(): number {
    get(this.#time)
    return super.getUTCMonth()
  }

  getUTCDate(): number {
    get(this.#time)
    return super.getUTCDate()
  }

  getUTCDay(): number {
    get(this.#time)
    return super.getUTCDay()
  }

  getUTCHours(): number {
    get(this.#time)
    return super.getUTCHours()
  }

  getUTCMinutes(): number {
    get(this.#time)
    return super.getUTCMinutes()
  }

  getUTCSeconds(): number {
    get(this.#time)
    return super.getUTCSeconds()
  }

  getUTCMilliseconds(): number {
    get(this.#time)
    return super.getUTCMilliseconds()
  }

  getTimezoneOffset(): number {
    get(this.#time)
    return super.getTimezoneOffset()
  }

  // ===========================================================================
  // SETTERS (trigger updates)
  // ===========================================================================

  setTime(time: number): number {
    super.setTime(time)
    return this.#update()
  }

  setFullYear(year: number, month?: number, date?: number): number {
    if (date !== undefined) {
      super.setFullYear(year, month!, date)
    } else if (month !== undefined) {
      super.setFullYear(year, month)
    } else {
      super.setFullYear(year)
    }
    return this.#update()
  }

  setMonth(month: number, date?: number): number {
    if (date !== undefined) {
      super.setMonth(month, date)
    } else {
      super.setMonth(month)
    }
    return this.#update()
  }

  setDate(date: number): number {
    super.setDate(date)
    return this.#update()
  }

  setHours(hours: number, min?: number, sec?: number, ms?: number): number {
    if (ms !== undefined) {
      super.setHours(hours, min!, sec!, ms)
    } else if (sec !== undefined) {
      super.setHours(hours, min!, sec)
    } else if (min !== undefined) {
      super.setHours(hours, min)
    } else {
      super.setHours(hours)
    }
    return this.#update()
  }

  setMinutes(min: number, sec?: number, ms?: number): number {
    if (ms !== undefined) {
      super.setMinutes(min, sec!, ms)
    } else if (sec !== undefined) {
      super.setMinutes(min, sec)
    } else {
      super.setMinutes(min)
    }
    return this.#update()
  }

  setSeconds(sec: number, ms?: number): number {
    if (ms !== undefined) {
      super.setSeconds(sec, ms)
    } else {
      super.setSeconds(sec)
    }
    return this.#update()
  }

  setMilliseconds(ms: number): number {
    super.setMilliseconds(ms)
    return this.#update()
  }

  setUTCFullYear(year: number, month?: number, date?: number): number {
    if (date !== undefined) {
      super.setUTCFullYear(year, month!, date)
    } else if (month !== undefined) {
      super.setUTCFullYear(year, month)
    } else {
      super.setUTCFullYear(year)
    }
    return this.#update()
  }

  setUTCMonth(month: number, date?: number): number {
    if (date !== undefined) {
      super.setUTCMonth(month, date)
    } else {
      super.setUTCMonth(month)
    }
    return this.#update()
  }

  setUTCDate(date: number): number {
    super.setUTCDate(date)
    return this.#update()
  }

  setUTCHours(hours: number, min?: number, sec?: number, ms?: number): number {
    if (ms !== undefined) {
      super.setUTCHours(hours, min!, sec!, ms)
    } else if (sec !== undefined) {
      super.setUTCHours(hours, min!, sec)
    } else if (min !== undefined) {
      super.setUTCHours(hours, min)
    } else {
      super.setUTCHours(hours)
    }
    return this.#update()
  }

  setUTCMinutes(min: number, sec?: number, ms?: number): number {
    if (ms !== undefined) {
      super.setUTCMinutes(min, sec!, ms)
    } else if (sec !== undefined) {
      super.setUTCMinutes(min, sec)
    } else {
      super.setUTCMinutes(min)
    }
    return this.#update()
  }

  setUTCSeconds(sec: number, ms?: number): number {
    if (ms !== undefined) {
      super.setUTCSeconds(sec, ms)
    } else {
      super.setUTCSeconds(sec)
    }
    return this.#update()
  }

  setUTCMilliseconds(ms: number): number {
    super.setUTCMilliseconds(ms)
    return this.#update()
  }

  // ===========================================================================
  // STRING METHODS (reactive)
  // ===========================================================================

  toString(): string {
    get(this.#time)
    return super.toString()
  }

  toDateString(): string {
    get(this.#time)
    return super.toDateString()
  }

  toTimeString(): string {
    get(this.#time)
    return super.toTimeString()
  }

  toISOString(): string {
    get(this.#time)
    return super.toISOString()
  }

  toUTCString(): string {
    get(this.#time)
    return super.toUTCString()
  }

  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string {
    get(this.#time)
    return super.toLocaleString(locales, options)
  }

  toLocaleDateString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string {
    get(this.#time)
    return super.toLocaleDateString(locales, options)
  }

  toLocaleTimeString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string {
    get(this.#time)
    return super.toLocaleTimeString(locales, options)
  }

  toJSON(): string {
    get(this.#time)
    return super.toJSON()
  }

  valueOf(): number {
    get(this.#time)
    return super.valueOf()
  }
}
