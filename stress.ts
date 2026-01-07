/**
 * @rlabs-inc/signals - BRUTAL STRESS TEST
 *
 * Push it until it breaks. No mercy.
 */

import { signal, derived, effect, bind, state, batch, flushSync } from './src/index'

// =============================================================================
// UTILITIES
// =============================================================================

function formatTime(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`
  if (ms < 0.01) return `${(ms * 1000).toFixed(2)}μs`
  if (ms < 1) return `${ms.toFixed(3)}ms`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// =============================================================================
// STRESS TESTS
// =============================================================================

console.log('╔══════════════════════════════════════════════════════════════════╗')
console.log('║       @rlabs-inc/signals - BRUTAL STRESS TEST                   ║')
console.log('╚══════════════════════════════════════════════════════════════════╝')
console.log()

// -----------------------------------------------------------------------------
// MASS CREATION
// -----------------------------------------------------------------------------

console.log('📦 MASS CREATION - How many can we create?')
console.log('─'.repeat(70))

const creationSizes = [1_000, 10_000, 100_000, 500_000, 1_000_000]

for (const size of creationSizes) {
  Bun.gc(true)
  const heapBefore = process.memoryUsage().heapUsed

  const items: any[] = []
  const start = Bun.nanoseconds()

  try {
    for (let i = 0; i < size; i++) {
      items.push(signal(i))
    }
    const elapsed = (Bun.nanoseconds() - start) / 1_000_000
    const heapAfter = process.memoryUsage().heapUsed
    const memMB = (heapAfter - heapBefore) / 1024 / 1024
    const perItem = (heapAfter - heapBefore) / size

    console.log(
      `  ${formatNum(size).padStart(6)} signals: ${formatTime(elapsed).padStart(10)} ` +
      `(${formatTime(elapsed / size)}/ea) ` +
      `${memMB.toFixed(1)}MB (${perItem.toFixed(0)}B/ea)`
    )
  } catch (e) {
    console.log(`  ${formatNum(size).padStart(6)} signals: FAILED - ${(e as Error).message}`)
    break
  }

  items.length = 0
}

console.log()

// -----------------------------------------------------------------------------
// DERIVED CHAIN LENGTH
// -----------------------------------------------------------------------------

console.log('🔗 DERIVED CHAINS - How deep can we go?')
console.log('─'.repeat(70))

const chainLengths = [10, 100, 1000, 5000, 10000, 50000]

for (const length of chainLengths) {
  Bun.gc(true)

  try {
    const source = signal(0)
    let prev: { readonly value: number } = source

    const start = Bun.nanoseconds()
    for (let i = 0; i < length; i++) {
      const p = prev
      prev = derived(() => p.value + 1)
    }
    const createTime = (Bun.nanoseconds() - start) / 1_000_000

    // Now propagate
    const propStart = Bun.nanoseconds()
    source.value = 1
    const endValue = prev.value
    const propTime = (Bun.nanoseconds() - propStart) / 1_000_000

    console.log(
      `  Chain ${formatNum(length).padStart(6)}: ` +
      `create ${formatTime(createTime).padStart(10)}, ` +
      `propagate ${formatTime(propTime).padStart(10)} ` +
      `(end=${endValue}) ✓`
    )
  } catch (e) {
    console.log(`  Chain ${formatNum(length).padStart(6)}: FAILED - ${(e as Error).message}`)
    break
  }
}

console.log()

// -----------------------------------------------------------------------------
// FAN-OUT WIDTH
// -----------------------------------------------------------------------------

console.log('📡 FAN-OUT - How wide can we go?')
console.log('─'.repeat(70))

const fanWidths = [10, 100, 1000, 10000, 50000, 100000]

for (const width of fanWidths) {
  Bun.gc(true)

  try {
    const source = signal(0)
    const deriveds: { readonly value: number }[] = []

    const start = Bun.nanoseconds()
    for (let i = 0; i < width; i++) {
      deriveds.push(derived(() => source.value + i))
    }
    const createTime = (Bun.nanoseconds() - start) / 1_000_000

    // Propagate and read all
    const propStart = Bun.nanoseconds()
    source.value = 1
    let sum = 0
    for (const d of deriveds) sum += d.value
    const propTime = (Bun.nanoseconds() - propStart) / 1_000_000

    console.log(
      `  Fan ${formatNum(width).padStart(7)}: ` +
      `create ${formatTime(createTime).padStart(10)}, ` +
      `propagate+read ${formatTime(propTime).padStart(10)} ✓`
    )
  } catch (e) {
    console.log(`  Fan ${formatNum(width).padStart(7)}: FAILED - ${(e as Error).message}`)
    break
  }
}

console.log()

// -----------------------------------------------------------------------------
// DIAMOND COMPLEXITY
// -----------------------------------------------------------------------------

console.log('💎 DIAMOND PATTERNS - Complex dependency graphs')
console.log('─'.repeat(70))

// Wide diamond: A → [B1..Bn] → C
const diamondWidths = [10, 100, 1000, 10000]

for (const width of diamondWidths) {
  Bun.gc(true)

  try {
    const a = signal(0)
    const middles: { readonly value: number }[] = []

    for (let i = 0; i < width; i++) {
      middles.push(derived(() => a.value + i))
    }

    const c = derived(() => middles.reduce((sum, m) => sum + m.value, 0))

    // Propagate
    const start = Bun.nanoseconds()
    a.value = 1
    const result = c.value
    const elapsed = (Bun.nanoseconds() - start) / 1_000_000

    console.log(
      `  Diamond W=${formatNum(width).padStart(6)}: ` +
      `propagate ${formatTime(elapsed).padStart(10)} ` +
      `(result=${result}) ✓`
    )
  } catch (e) {
    console.log(`  Diamond W=${formatNum(width).padStart(6)}: FAILED - ${(e as Error).message}`)
    break
  }
}

console.log()

// -----------------------------------------------------------------------------
// EFFECT STORM
// -----------------------------------------------------------------------------

console.log('⚡ EFFECT STORM - Mass effect triggering')
console.log('─'.repeat(70))

const effectCounts = [10, 100, 1000, 10000]

for (const count of effectCounts) {
  Bun.gc(true)

  try {
    const source = signal(0)
    let triggerCount = 0
    const disposes: (() => void)[] = []

    for (let i = 0; i < count; i++) {
      disposes.push(effect(() => {
        const _ = source.value
        triggerCount++
      }))
    }

    flushSync() // Initial run
    triggerCount = 0

    // Trigger all effects
    const start = Bun.nanoseconds()
    source.value = 1
    flushSync()
    const elapsed = (Bun.nanoseconds() - start) / 1_000_000

    console.log(
      `  ${formatNum(count).padStart(6)} effects: ` +
      `trigger all ${formatTime(elapsed).padStart(10)} ` +
      `(${triggerCount} runs) ✓`
    )

    // Cleanup
    for (const d of disposes) d()
  } catch (e) {
    console.log(`  ${formatNum(count).padStart(6)} effects: FAILED - ${(e as Error).message}`)
    break
  }
}

console.log()

// -----------------------------------------------------------------------------
// RAPID UPDATES
// -----------------------------------------------------------------------------

console.log('🔥 RAPID UPDATES - Updates per second')
console.log('─'.repeat(70))

// Simple signal
{
  const s = signal(0)
  let count = 0
  const start = Date.now()
  while (Date.now() - start < 1000) {
    s.value++
    count++
  }
  console.log(`  signal.value = x:           ${formatNum(count).padStart(10)}/sec`)
}

// Signal + derived read
{
  const s = signal(0)
  const d = derived(() => s.value * 2)
  let count = 0
  const start = Date.now()
  while (Date.now() - start < 1000) {
    s.value++
    const _ = d.value
    count++
  }
  console.log(`  signal write + derived read: ${formatNum(count).padStart(10)}/sec`)
}

// Signal + effect
{
  const s = signal(0)
  let effectRuns = 0
  effect(() => { const _ = s.value; effectRuns++ })
  flushSync()
  effectRuns = 0

  let count = 0
  const start = Date.now()
  while (Date.now() - start < 1000) {
    s.value++
    flushSync()
    count++
  }
  console.log(`  signal write + flushSync:    ${formatNum(count).padStart(10)}/sec`)
}

// Batch updates
{
  const signals = Array.from({ length: 10 }, () => signal(0))
  const sum = derived(() => signals.reduce((a, s) => a + s.value, 0))

  let count = 0
  const start = Date.now()
  while (Date.now() - start < 1000) {
    batch(() => {
      for (const s of signals) s.value++
    })
    const _ = sum.value
    count++
  }
  console.log(`  batch(10) + derived read:    ${formatNum(count).padStart(10)}/sec`)
}

console.log()

// -----------------------------------------------------------------------------
// STATE PROXY STRESS
// -----------------------------------------------------------------------------

console.log('🔮 STATE PROXY - Deep object reactivity')
console.log('─'.repeat(70))

// Wide object
{
  const obj: Record<string, number> = {}
  for (let i = 0; i < 1000; i++) obj[`key${i}`] = i

  const start = Bun.nanoseconds()
  const s = state(obj)
  const createTime = (Bun.nanoseconds() - start) / 1_000_000

  // Read all
  const readStart = Bun.nanoseconds()
  let sum = 0
  for (let i = 0; i < 1000; i++) sum += s[`key${i}`]
  const readTime = (Bun.nanoseconds() - readStart) / 1_000_000

  // Write all
  const writeStart = Bun.nanoseconds()
  for (let i = 0; i < 1000; i++) s[`key${i}`] = i + 1
  const writeTime = (Bun.nanoseconds() - writeStart) / 1_000_000

  console.log(
    `  1K props: create ${formatTime(createTime)}, ` +
    `read all ${formatTime(readTime)}, write all ${formatTime(writeTime)}`
  )
}

// Deep nesting
{
  const createDeep = (depth: number): any => {
    if (depth === 0) return { value: 0 }
    return { child: createDeep(depth - 1) }
  }

  for (const depth of [10, 50, 100, 500]) {
    try {
      const obj = createDeep(depth)
      const start = Bun.nanoseconds()
      const s = state(obj)
      const createTime = (Bun.nanoseconds() - start) / 1_000_000

      // Navigate to deepest
      let current: any = s
      const navStart = Bun.nanoseconds()
      for (let i = 0; i < depth; i++) current = current.child
      const val = current.value
      const navTime = (Bun.nanoseconds() - navStart) / 1_000_000

      console.log(
        `  Depth ${depth.toString().padStart(3)}: ` +
        `create ${formatTime(createTime).padStart(10)}, ` +
        `navigate ${formatTime(navTime).padStart(10)} ✓`
      )
    } catch (e) {
      console.log(`  Depth ${depth.toString().padStart(3)}: FAILED - ${(e as Error).message}`)
      break
    }
  }
}

console.log()

// -----------------------------------------------------------------------------
// BIND STRESS
// -----------------------------------------------------------------------------

console.log('🔗 BIND STRESS - Mass bindings')
console.log('─'.repeat(70))

const bindCounts = [1000, 10000, 100000, 500000]

for (const count of bindCounts) {
  Bun.gc(true)

  try {
    const source = signal(0)
    const bindings: any[] = []

    const start = Bun.nanoseconds()
    for (let i = 0; i < count; i++) {
      bindings.push(bind(source))
    }
    const createTime = (Bun.nanoseconds() - start) / 1_000_000

    // Read through all bindings
    const readStart = Bun.nanoseconds()
    let sum = 0
    for (const b of bindings) sum += b.value
    const readTime = (Bun.nanoseconds() - readStart) / 1_000_000

    // Write source, read one binding
    const propStart = Bun.nanoseconds()
    source.value = 42
    const val = bindings[0].value
    const propTime = (Bun.nanoseconds() - propStart) / 1_000_000

    console.log(
      `  ${formatNum(count).padStart(6)} bindings: ` +
      `create ${formatTime(createTime).padStart(10)}, ` +
      `read all ${formatTime(readTime).padStart(10)}, ` +
      `propagate ${formatTime(propTime).padStart(8)}`
    )
  } catch (e) {
    console.log(`  ${formatNum(count).padStart(6)} bindings: FAILED - ${(e as Error).message}`)
    break
  }
}

console.log()

// -----------------------------------------------------------------------------
// MEMORY LEAK TEST
// -----------------------------------------------------------------------------

console.log('🗑️  MEMORY - Create/destroy cycles')
console.log('─'.repeat(70))

Bun.gc(true)
const heapBaseline = process.memoryUsage().heapUsed

for (let cycle = 0; cycle < 100; cycle++) {
  // Create
  const signals = Array.from({ length: 1000 }, (_, i) => signal(i))
  const deriveds = signals.map(s => derived(() => s.value * 2))

  // Use them
  for (const s of signals) s.value++
  for (const d of deriveds) { const _ = d.value }

  // Destroy (just lose references)
  signals.length = 0
  deriveds.length = 0
}

Bun.gc(true)
const heapAfter = process.memoryUsage().heapUsed
const growth = (heapAfter - heapBaseline) / 1024 / 1024

console.log(`  100 cycles × 1K signals+deriveds`)
console.log(`  Memory growth: ${growth.toFixed(2)} MB (should be ~0)`)

console.log()

// -----------------------------------------------------------------------------
// BREAKING POINT
// -----------------------------------------------------------------------------

console.log('💥 BREAKING POINT - Find the limits')
console.log('─'.repeat(70))

// Chain until stack overflow
console.log('  Derived chain depth limit:')
for (const depth of [100000, 500000, 1000000]) {
  Bun.gc(true)

  try {
    const source = signal(0)
    let prev: { readonly value: number } = source

    for (let i = 0; i < depth; i++) {
      const p = prev
      prev = derived(() => p.value + 1)
    }

    source.value = 1
    const _ = prev.value

    console.log(`    ${formatNum(depth)}: ✓`)
  } catch (e) {
    console.log(`    ${formatNum(depth)}: FAILED - ${(e as Error).message}`)
    break
  }
}

// Fan-out until memory exhausted
console.log('  Fan-out width limit:')
for (const width of [500000, 1000000, 2000000]) {
  Bun.gc(true)

  try {
    const source = signal(0)
    const deriveds: any[] = []

    for (let i = 0; i < width; i++) {
      deriveds.push(derived(() => source.value + i))
    }

    source.value = 1
    const _ = deriveds[0].value

    console.log(`    ${formatNum(width)}: ✓`)
  } catch (e) {
    console.log(`    ${formatNum(width)}: FAILED - ${(e as Error).message}`)
    break
  }
}

console.log()

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════════╗')
console.log('║                         VERDICT                                  ║')
console.log('╚══════════════════════════════════════════════════════════════════╝')
console.log()
