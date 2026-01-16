import { describe, it, expect } from 'bun:test'
import { signal, effect, batch, flushSync } from '../../src/index.js'

/**
 * Performance comparison: sync vs async effects
 *
 * This measures the overhead of different scheduling approaches.
 */

const ITERATIONS = 10000
const WARMUP = 1000

function measure(name: string, fn: () => void): number {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn()

  // Measure
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) fn()
  const elapsed = performance.now() - start

  const opsPerSec = Math.round(ITERATIONS / (elapsed / 1000))
  const nsPerOp = Math.round((elapsed / ITERATIONS) * 1_000_000)

  console.log(`${name}: ${opsPerSec.toLocaleString()} ops/sec (${nsPerOp} ns/op)`)
  return elapsed
}

describe('Sync vs Async Effect Performance', () => {
  it('measures single signal write + effect (current async)', async () => {
    const count = signal(0)
    let effectRuns = 0

    effect(() => {
      count.value
      effectRuns++
    })
    await new Promise(r => setTimeout(r, 0)) // Let initial effect run
    effectRuns = 0

    measure('Single write (async, await tick)', () => {
      count.value++
    })

    // Wait for all effects to run
    await new Promise(r => setTimeout(r, 100))
    console.log(`  Total effect runs: ${effectRuns}`)
  })

  it('measures single signal write + effect with flushSync', () => {
    const count = signal(0)
    let effectRuns = 0

    effect(() => {
      count.value
      effectRuns++
    })
    flushSync()
    effectRuns = 0

    measure('Single write + flushSync()', () => {
      count.value++
      flushSync()
    })

    console.log(`  Total effect runs: ${effectRuns}`)
    expect(effectRuns).toBe(WARMUP + ITERATIONS)
  })

  it('measures batched writes (10 writes per batch)', () => {
    const count = signal(0)
    let effectRuns = 0

    effect(() => {
      count.value
      effectRuns++
    })
    flushSync()
    effectRuns = 0

    measure('Batched (10 writes) + flushSync()', () => {
      batch(() => {
        for (let i = 0; i < 10; i++) {
          count.value++
        }
      })
      flushSync()
    })

    console.log(`  Total effect runs: ${effectRuns}`)
    expect(effectRuns).toBe(WARMUP + ITERATIONS)
  })

  it('measures multiple signals, single effect', () => {
    const a = signal(0)
    const b = signal(0)
    const c = signal(0)
    let effectRuns = 0

    effect(() => {
      a.value + b.value + c.value
      effectRuns++
    })
    flushSync()
    effectRuns = 0

    measure('3 signals write + flushSync()', () => {
      batch(() => {
        a.value++
        b.value++
        c.value++
      })
      flushSync()
    })

    console.log(`  Total effect runs: ${effectRuns}`)
    expect(effectRuns).toBe(WARMUP + ITERATIONS)
  })

  it('measures chain: signal -> derived -> effect', () => {
    const { derived } = require('../../src/index.js')

    const count = signal(0)
    const doubled = derived(() => count.value * 2)
    let effectRuns = 0

    effect(() => {
      doubled.value
      effectRuns++
    })
    flushSync()
    effectRuns = 0

    measure('Signal -> Derived -> Effect + flushSync()', () => {
      count.value++
      flushSync()
    })

    console.log(`  Total effect runs: ${effectRuns}`)
    expect(effectRuns).toBe(WARMUP + ITERATIONS)
  })

  it('measures rapid-fire without explicit sync (simulates sync effects)', () => {
    const count = signal(0)
    let effectRuns = 0

    effect(() => {
      count.value
      effectRuns++
    })
    flushSync()
    effectRuns = 0

    // This simulates what sync effects would do - flushSync after every write
    const start = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      count.value++
      flushSync()
    }
    const elapsed = performance.now() - start

    const opsPerSec = Math.round(ITERATIONS / (elapsed / 1000))
    console.log(`Rapid-fire (sync simulation): ${opsPerSec.toLocaleString()} ops/sec`)
    console.log(`  Total effect runs: ${effectRuns}`)
    expect(effectRuns).toBe(ITERATIONS)
  })
})
