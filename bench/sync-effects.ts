import { run, bench, group } from 'mitata'
import { signal, effect, batch, flushSync, derived } from '../src/index.js'

// ============================================================================
// Benchmark: Sync vs Async Effect Scheduling
//
// Measures the overhead of synchronous effect execution vs microtask batching.
// This helps us understand the performance tradeoff of making effects sync.
// ============================================================================

group('Single signal write', () => {
  const count1 = signal(0)
  let runs1 = 0
  effect(() => { count1.value; runs1++ })
  flushSync()

  const count2 = signal(0)
  let runs2 = 0
  effect(() => { count2.value; runs2++ })
  flushSync()

  bench('write only (no flush)', () => {
    count1.value++
  })

  bench('write + flushSync()', () => {
    count2.value++
    flushSync()
  })
})

group('Multiple writes', () => {
  const count1 = signal(0)
  let runs1 = 0
  effect(() => { count1.value; runs1++ })
  flushSync()

  const count2 = signal(0)
  let runs2 = 0
  effect(() => { count2.value; runs2++ })
  flushSync()

  bench('10 writes (no flush)', () => {
    for (let i = 0; i < 10; i++) count1.value++
  })

  bench('10 writes + flushSync() each', () => {
    for (let i = 0; i < 10; i++) {
      count2.value++
      flushSync()
    }
  })
})

group('Batched writes', () => {
  const count1 = signal(0)
  let runs1 = 0
  effect(() => { count1.value; runs1++ })
  flushSync()

  const count2 = signal(0)
  let runs2 = 0
  effect(() => { count2.value; runs2++ })
  flushSync()

  bench('batch(10 writes) no flush', () => {
    batch(() => {
      for (let i = 0; i < 10; i++) count1.value++
    })
  })

  bench('batch(10 writes) + flushSync()', () => {
    batch(() => {
      for (let i = 0; i < 10; i++) count2.value++
    })
    flushSync()
  })
})

group('Signal -> Derived -> Effect chain', () => {
  const count1 = signal(0)
  const doubled1 = derived(() => count1.value * 2)
  let runs1 = 0
  effect(() => { doubled1.value; runs1++ })
  flushSync()

  const count2 = signal(0)
  const doubled2 = derived(() => count2.value * 2)
  let runs2 = 0
  effect(() => { doubled2.value; runs2++ })
  flushSync()

  bench('write derived chain (no flush)', () => {
    count1.value++
  })

  bench('write derived chain + flushSync()', () => {
    count2.value++
    flushSync()
  })
})

group('Multiple effects on same signal', () => {
  const count1 = signal(0)
  for (let i = 0; i < 10; i++) {
    effect(() => { count1.value })
  }
  flushSync()

  const count2 = signal(0)
  for (let i = 0; i < 10; i++) {
    effect(() => { count2.value })
  }
  flushSync()

  bench('1 write -> 10 effects (no flush)', () => {
    count1.value++
  })

  bench('1 write -> 10 effects + flushSync()', () => {
    count2.value++
    flushSync()
  })
})

group('Deep derived chain (5 levels)', () => {
  const s1 = signal(0)
  const d1a = derived(() => s1.value + 1)
  const d1b = derived(() => d1a.value + 1)
  const d1c = derived(() => d1b.value + 1)
  const d1d = derived(() => d1c.value + 1)
  const d1e = derived(() => d1d.value + 1)
  let runs1 = 0
  effect(() => { d1e.value; runs1++ })
  flushSync()

  const s2 = signal(0)
  const d2a = derived(() => s2.value + 1)
  const d2b = derived(() => d2a.value + 1)
  const d2c = derived(() => d2b.value + 1)
  const d2d = derived(() => d2c.value + 1)
  const d2e = derived(() => d2d.value + 1)
  let runs2 = 0
  effect(() => { d2e.value; runs2++ })
  flushSync()

  bench('5-level derived (no flush)', () => {
    s1.value++
  })

  bench('5-level derived + flushSync()', () => {
    s2.value++
    flushSync()
  })
})

console.log('\n🔬 Sync vs Async Effect Benchmarks\n')
console.log('Baseline = current async behavior (effects run on microtask)')
console.log('Bench = simulated sync behavior (flushSync after each write)\n')

await run({
  units: true,
  percentiles: false,
})
