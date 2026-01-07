/**
 * @rlabs-inc/signals - Benchmark Suite
 *
 * Testing raw performance of reactive primitives
 */

import { signal, derived, effect, bind, state, batch, flushSync } from './src/index'

// =============================================================================
// UTILITIES
// =============================================================================

function formatTime(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`
  if (ms < 0.01) return `${(ms * 1000).toFixed(2)}μs`
  if (ms < 1) return `${ms.toFixed(3)}ms`
  return `${ms.toFixed(2)}ms`
}

function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(1)}K`
  return ops.toFixed(0)
}

function bench(name: string, fn: () => void, iterations: number = 100_000): void {
  // Warmup
  for (let i = 0; i < 1000; i++) fn()

  const start = Bun.nanoseconds()
  for (let i = 0; i < iterations; i++) fn()
  const elapsed = (Bun.nanoseconds() - start) / 1_000_000

  const perOp = elapsed / iterations
  const opsPerSec = iterations / (elapsed / 1000)

  console.log(`  ${name.padEnd(35)} ${formatTime(perOp).padStart(10)}  ${formatOps(opsPerSec).padStart(8)}/sec`)
}

function benchCreate(name: string, fn: () => unknown, count: number = 10_000): void {
  // Warmup
  for (let i = 0; i < 100; i++) fn()
  Bun.gc(true)

  const items: unknown[] = []
  const start = Bun.nanoseconds()
  for (let i = 0; i < count; i++) {
    items.push(fn())
  }
  const elapsed = (Bun.nanoseconds() - start) / 1_000_000

  const perOp = elapsed / count
  const opsPerSec = count / (elapsed / 1000)

  console.log(`  ${name.padEnd(35)} ${formatTime(perOp).padStart(10)}  ${formatOps(opsPerSec).padStart(8)}/sec`)

  // Keep reference to prevent GC during measurement
  if (items.length === 0) console.log('')
}

// =============================================================================
// BENCHMARKS
// =============================================================================

console.log('╔══════════════════════════════════════════════════════════════════╗')
console.log('║           @rlabs-inc/signals - BENCHMARK SUITE                   ║')
console.log('╚══════════════════════════════════════════════════════════════════╝')
console.log()

// -----------------------------------------------------------------------------
// CREATION
// -----------------------------------------------------------------------------

console.log('📦 CREATION (how fast can we create primitives?)')
console.log('─'.repeat(60))

benchCreate('signal(value)', () => signal(0), 100_000)
benchCreate('signal(object)', () => signal({ x: 0, y: 0 }), 100_000)
benchCreate('derived(() => ...)', () => derived(() => 42), 100_000)
benchCreate('bind(signal)', () => bind(signal(0)), 100_000)
benchCreate('bind(rawValue)', () => bind(42), 100_000)
benchCreate('state(object)', () => state({ x: 0, y: 0 }), 50_000)
benchCreate('state(array)', () => state([1, 2, 3]), 50_000)

console.log()

// -----------------------------------------------------------------------------
// READS
// -----------------------------------------------------------------------------

console.log('📖 READS (how fast can we read values?)')
console.log('─'.repeat(60))

const readSig = signal(42)
bench('signal.value (read)', () => { const _ = readSig.value }, 1_000_000)

const readDerived = derived(() => readSig.value * 2)
bench('derived.value (cached)', () => { const _ = readDerived.value }, 1_000_000)

const readBound = bind(readSig)
bench('binding.value (read)', () => { const _ = readBound.value }, 1_000_000)

const readState = state({ x: 10, y: 20 })
bench('state.prop (read)', () => { const _ = readState.x }, 1_000_000)

const readDeepState = state({ a: { b: { c: 42 } } })
bench('state.a.b.c (deep read)', () => { const _ = readDeepState.a.b.c }, 1_000_000)

console.log()

// -----------------------------------------------------------------------------
// WRITES
// -----------------------------------------------------------------------------

console.log('✏️  WRITES (how fast can we write values?)')
console.log('─'.repeat(60))

const writeSig = signal(0)
bench('signal.value = x', () => { writeSig.value++ }, 1_000_000)

const writeBound = bind(writeSig)
bench('binding.value = x', () => { writeBound.value++ }, 1_000_000)

const writeState = state({ count: 0 })
bench('state.prop = x', () => { writeState.count++ }, 1_000_000)

const writeDeepState = state({ a: { b: { c: 0 } } })
bench('state.a.b.c = x (deep)', () => { writeDeepState.a.b.c++ }, 1_000_000)

console.log()

// -----------------------------------------------------------------------------
// DERIVED CHAINS
// -----------------------------------------------------------------------------

console.log('🔗 DERIVED CHAINS (reactive propagation)')
console.log('─'.repeat(60))

// Chain of 1
const chain1_source = signal(0)
const chain1_d1 = derived(() => chain1_source.value + 1)
bench('chain(1): write + read derived', () => {
  chain1_source.value++
  const _ = chain1_d1.value
}, 100_000)

// Chain of 3
const chain3_source = signal(0)
const chain3_d1 = derived(() => chain3_source.value + 1)
const chain3_d2 = derived(() => chain3_d1.value + 1)
const chain3_d3 = derived(() => chain3_d2.value + 1)
bench('chain(3): write + read end', () => {
  chain3_source.value++
  const _ = chain3_d3.value
}, 100_000)

// Chain of 10
const chain10_source = signal(0)
let chain10_prev: { readonly value: number } = chain10_source
for (let i = 0; i < 10; i++) {
  const prev = chain10_prev
  chain10_prev = derived(() => prev.value + 1)
}
const chain10_end = chain10_prev
bench('chain(10): write + read end', () => {
  chain10_source.value++
  const _ = chain10_end.value
}, 100_000)

console.log()

// -----------------------------------------------------------------------------
// EFFECTS
// -----------------------------------------------------------------------------

console.log('⚡ EFFECTS (reactive side effects)')
console.log('─'.repeat(60))

const effectSig = signal(0)
let effectCount = 0
const dispose = effect(() => {
  const _ = effectSig.value
  effectCount++
})
flushSync()

bench('signal write + flushSync', () => {
  effectSig.value++
  flushSync()
}, 100_000)

dispose()

console.log()

// -----------------------------------------------------------------------------
// BATCH
// -----------------------------------------------------------------------------

console.log('📦 BATCH (grouped updates)')
console.log('─'.repeat(60))

const batchSigs = Array.from({ length: 10 }, () => signal(0))
const batchDerived = derived(() => batchSigs.reduce((sum, s) => sum + s.value, 0))

bench('batch(10 writes) + read derived', () => {
  batch(() => {
    for (const s of batchSigs) s.value++
  })
  const _ = batchDerived.value
}, 100_000)

console.log()

// -----------------------------------------------------------------------------
// DIAMOND DEPENDENCY
// -----------------------------------------------------------------------------

console.log('💎 DIAMOND (A → B,C → D pattern)')
console.log('─'.repeat(60))

const diamond_a = signal(0)
const diamond_b = derived(() => diamond_a.value + 1)
const diamond_c = derived(() => diamond_a.value + 2)
const diamond_d = derived(() => diamond_b.value + diamond_c.value)

bench('diamond: write A + read D', () => {
  diamond_a.value++
  const _ = diamond_d.value
}, 100_000)

console.log()

// -----------------------------------------------------------------------------
// WIDE FAN-OUT
// -----------------------------------------------------------------------------

console.log('📡 FAN-OUT (1 source → N deriveds)')
console.log('─'.repeat(60))

const fan10_source = signal(0)
const fan10_deriveds = Array.from({ length: 10 }, (_, i) =>
  derived(() => fan10_source.value + i)
)
bench('fan(10): write + read all', () => {
  fan10_source.value++
  for (const d of fan10_deriveds) { const _ = d.value }
}, 100_000)

const fan100_source = signal(0)
const fan100_deriveds = Array.from({ length: 100 }, (_, i) =>
  derived(() => fan100_source.value + i)
)
bench('fan(100): write + read all', () => {
  fan100_source.value++
  for (const d of fan100_deriveds) { const _ = d.value }
}, 10_000)

const fan1000_source = signal(0)
const fan1000_deriveds = Array.from({ length: 1000 }, (_, i) =>
  derived(() => fan1000_source.value + i)
)
bench('fan(1000): write + read all', () => {
  fan1000_source.value++
  for (const d of fan1000_deriveds) { const _ = d.value }
}, 1_000)

console.log()

// -----------------------------------------------------------------------------
// MEMORY / GC
// -----------------------------------------------------------------------------

console.log('🗑️  MEMORY (creation + cleanup)')
console.log('─'.repeat(60))

const heapBefore = process.memoryUsage().heapUsed

// Create lots of signals
const memSignals: ReturnType<typeof signal>[] = []
for (let i = 0; i < 100_000; i++) {
  memSignals.push(signal(i))
}

const heapAfter = process.memoryUsage().heapUsed
const perSignalBytes = (heapAfter - heapBefore) / 100_000

console.log(`  100K signals: ${((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)} MB (${perSignalBytes.toFixed(0)} bytes/signal)`)

// Clear and GC
memSignals.length = 0
Bun.gc(true)

const heapFinal = process.memoryUsage().heapUsed
console.log(`  After clear + GC: ${((heapFinal - heapBefore) / 1024 / 1024).toFixed(2)} MB`)

console.log()

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════════╗')
console.log('║                         SUMMARY                                  ║')
console.log('╚══════════════════════════════════════════════════════════════════╝')
console.log()
console.log('  Signal reads/writes should be in the millions/sec')
console.log('  Derived chains should scale linearly')
console.log('  bind() overhead should be minimal')
console.log()
