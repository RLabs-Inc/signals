/**
 * @rlabs-inc/signals (v1) - Performance Benchmarks
 */

import {
  signal,
  derived,
  effect,
  state,
  batch,
  flushSync,
} from '../src/index.js'

// Benchmark utility
function bench(name: string, fn: () => void, iterations = 100_000): void {
  // Warmup
  for (let i = 0; i < 1000; i++) fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const end = performance.now()

  const totalMs = end - start
  const opsPerSec = (iterations / totalMs) * 1000
  const nsPerOp = (totalMs / iterations) * 1_000_000

  console.log(
    `${name.padEnd(40)} ${nsPerOp.toFixed(2).padStart(10)} ns/op  ${formatOps(opsPerSec).padStart(12)} ops/sec`
  )
}

function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
  return ops.toFixed(2)
}

console.log('='.repeat(70))
console.log('@rlabs-inc/signals (v1) - Performance Benchmarks')
console.log('='.repeat(70))
console.log()

// =============================================================================
// Signal Operations
// =============================================================================

console.log('--- Signal Operations ---')

bench('signal creation', () => {
  signal(0)
})

const readSig = signal(42)
bench('signal read', () => {
  readSig.value
})

const writeSig = signal(0)
let writeVal = 0
bench('signal write', () => {
  writeSig.value = writeVal++
})

const peekSig = signal(42)
bench('signal peek (untracked read)', () => {
  peekSig.peek
})

console.log()

// =============================================================================
// Derived Operations
// =============================================================================

console.log('--- Derived Operations ---')

const derivedSource = signal(1)
bench('derived creation', () => {
  derived(() => derivedSource.value * 2)
})

const cachedSource = signal(1)
const cachedDerived = derived(() => cachedSource.value * 2)
cachedDerived.value // Initial compute
bench('derived read (cached)', () => {
  cachedDerived.value
})

const computeSource = signal(0)
const computeDerived = derived(() => computeSource.value * 2)
let computeVal = 0
bench('derived read (after invalidation)', () => {
  computeSource.value = computeVal++
  computeDerived.value
}, 50_000)

console.log()

// =============================================================================
// Effect Operations
// =============================================================================

console.log('--- Effect Operations ---')

bench('effect creation + dispose', () => {
  const dispose = effect(() => {})
  flushSync()
  dispose()
}, 10_000)

const effectSource = signal(0)
const effectDispose = effect(() => {
  effectSource.value
})
flushSync()
let effectVal = 0
bench('effect trigger + flush', () => {
  effectSource.value = effectVal++
  flushSync()
}, 10_000)
effectDispose()

console.log()

// =============================================================================
// Deep Proxy (state)
// =============================================================================

console.log('--- Deep Proxy (state) ---')

bench('state creation (object)', () => {
  state({ x: 1, y: 2, z: 3 })
})

const proxyObj = state({ x: 1, y: 2, z: 3 })
bench('state property read', () => {
  proxyObj.x
})

bench('state property write', () => {
  proxyObj.x = Math.random()
}, 50_000)

const deepObj = state({
  a: { b: { c: { d: { e: 1 } } } }
})
bench('state deep read (5 levels)', () => {
  deepObj.a.b.c.d.e
})

bench('state deep write (5 levels)', () => {
  deepObj.a.b.c.d.e = Math.random()
}, 50_000)

console.log()

// =============================================================================
// Batch Operations
// =============================================================================

console.log('--- Batch Operations ---')

const batchSig1 = signal(0)
const batchSig2 = signal(0)
const batchSig3 = signal(0)
let batchEffectRuns = 0
const batchDispose = effect(() => {
  batchSig1.value + batchSig2.value + batchSig3.value
  batchEffectRuns++
})
flushSync()
batchEffectRuns = 0

let batchVal = 0
bench('batch 3 writes (1 effect run)', () => {
  batch(() => {
    batchSig1.value = batchVal++
    batchSig2.value = batchVal++
    batchSig3.value = batchVal++
  })
  flushSync()
}, 10_000)
batchDispose()

console.log()

// =============================================================================
// Chain Depth
// =============================================================================

console.log('--- Chain Propagation ---')

// 10 chain
const chain10Source = signal(0)
let chain10: { value: number } = chain10Source
for (let i = 0; i < 10; i++) {
  const prev = chain10
  chain10 = derived(() => prev.value + 1)
}
chain10.value // Initial compute
let chain10Val = 0
bench('10-chain propagation', () => {
  chain10Source.value = chain10Val++
  chain10.value
}, 10_000)

// 100 chain
const chain100Source = signal(0)
let chain100: { value: number } = chain100Source
for (let i = 0; i < 100; i++) {
  const prev = chain100
  chain100 = derived(() => prev.value + 1)
}
chain100.value // Initial compute
let chain100Val = 0
bench('100-chain propagation', () => {
  chain100Source.value = chain100Val++
  chain100.value
}, 1_000)

// 1000 chain
const chain1000Source = signal(0)
let chain1000: { value: number } = chain1000Source
for (let i = 0; i < 1000; i++) {
  const prev = chain1000
  chain1000 = derived(() => prev.value + 1)
}
chain1000.value // Initial compute
let chain1000Val = 0
bench('1000-chain propagation', () => {
  chain1000Source.value = chain1000Val++
  chain1000.value
}, 100)

console.log()

// =============================================================================
// Diamond Dependency
// =============================================================================

console.log('--- Diamond Dependencies ---')

const diamondSource = signal(1)
const diamondA = derived(() => diamondSource.value * 2)
const diamondB = derived(() => diamondSource.value * 3)
const diamondC = derived(() => diamondA.value + diamondB.value)
diamondC.value // Initial

let diamondVal = 0
bench('diamond (4 nodes) propagation', () => {
  diamondSource.value = diamondVal++
  diamondC.value
}, 50_000)

// Wide diamond
const wideSource = signal(1)
const wideDerivedList = Array.from({ length: 10 }, (_, i) =>
  derived(() => wideSource.value * (i + 1))
)
const wideSum = derived(() =>
  wideDerivedList.reduce((sum, d) => sum + d.value, 0)
)
wideSum.value // Initial

let wideVal = 0
bench('wide diamond (12 nodes) propagation', () => {
  wideSource.value = wideVal++
  wideSum.value
}, 10_000)

console.log()

// =============================================================================
// Summary
// =============================================================================

console.log('='.repeat(70))
console.log('Benchmark complete!')
console.log()
console.log('Key metrics to watch:')
console.log('  - Signal read: should be < 50ns')
console.log('  - Signal write: should be < 100ns')
console.log('  - Derived cached read: should be < 50ns')
console.log('  - 1000-chain propagation: should be < 10ms')
console.log('='.repeat(70))
