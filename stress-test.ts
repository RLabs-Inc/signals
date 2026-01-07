import { signal, derived, effect, batch, flushSync } from './src/index.js'

console.log('═'.repeat(60))
console.log('STRESS TEST: @rlabs-inc/signals (v1)')
console.log('═'.repeat(60))

// Test 1: Million signal writes
console.log('\n--- Test 1: 1 MILLION signal writes ---')
const sig = signal(0)
const d = derived(() => sig.value * 2)
const start1 = performance.now()
for (let i = 0; i < 1_000_000; i++) {
  sig.value = i
}
console.log(`Time: ${(performance.now() - start1).toFixed(2)}ms`)
console.log(`Final derived: ${d.value}`)

// Test 2: 10K signals, 10K deriveds, 100K updates
console.log('\n--- Test 2: 10K signals × 10K deriveds × 100K updates ---')
const sigs = Array.from({ length: 10_000 }, (_, i) => signal(i))
const ders = Array.from({ length: 10_000 }, (_, i) =>
  derived(() => sigs[i].value + sigs[(i + 1) % 10_000].value)
)
// Initial read
for (const d of ders) d.value

const start2 = performance.now()
for (let round = 0; round < 10; round++) {
  batch(() => {
    for (let i = 0; i < 10_000; i++) {
      sigs[i].value = round * 10_000 + i
    }
  })
  // Read all deriveds
  for (const d of ders) d.value
}
console.log(`Time: ${(performance.now() - start2).toFixed(2)}ms`)
console.log(`Final check: ders[0]=${ders[0].value}, ders[9999]=${ders[9999].value}`)

// Test 3: Deep chain stress
console.log('\n--- Test 3: 3000 chain × 1000 updates ---')
const chainSrc = signal(0)
let chainCur: { value: number } = chainSrc
for (let i = 0; i < 3000; i++) {
  const prev = chainCur
  chainCur = derived(() => prev.value + 1)
}
chainCur.value // Initial

const start3 = performance.now()
for (let i = 0; i < 1000; i++) {
  chainSrc.value = i
  chainCur.value
}
console.log(`Time: ${(performance.now() - start3).toFixed(2)}ms`)
console.log(`Final: ${chainCur.value}`)

// Test 4: Effect storm
console.log('\n--- Test 4: 1K effects × 10K triggers ---')
const effectSig = signal(0)
let effectRuns = 0
const disposers: (() => void)[] = []
for (let i = 0; i < 1000; i++) {
  disposers.push(effect(() => {
    effectSig.value
    effectRuns++
  }))
}
flushSync()
effectRuns = 0

const start4 = performance.now()
for (let i = 0; i < 10_000; i++) {
  effectSig.value = i
  flushSync()
}
console.log(`Time: ${(performance.now() - start4).toFixed(2)}ms`)
console.log(`Effect runs: ${effectRuns.toLocaleString()}`)

// Cleanup
for (const dispose of disposers) dispose()

console.log('\n' + '═'.repeat(60))
console.log('ALL STRESS TESTS PASSED ✓')
console.log('═'.repeat(60))
