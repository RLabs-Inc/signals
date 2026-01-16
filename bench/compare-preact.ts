import { run, bench, group } from 'mitata'

// Our signals
import { signal as ourSignal, effect as ourEffect, derived as ourDerived, batch as ourBatch, flushSync } from '../src/index.js'

// Preact signals (if available)
let preactSignal: any, preactEffect: any, preactComputed: any, preactBatch: any
try {
  const preact = await import('@preact/signals-core')
  preactSignal = preact.signal
  preactEffect = preact.effect
  preactComputed = preact.computed
  preactBatch = preact.batch
  console.log('✓ Preact Signals loaded')
} catch {
  console.log('✗ Preact Signals not installed (run: bun add @preact/signals-core)')
}

console.log('\n🔬 Signals Library Comparison\n')

group('Signal creation', () => {
  bench('@rlabs-inc/signals', () => {
    ourSignal(0)
  })

  if (preactSignal) {
    bench('@preact/signals-core', () => {
      preactSignal(0)
    })
  }
})

group('Signal write', () => {
  const ours = ourSignal(0)
  bench('@rlabs-inc/signals', () => {
    ours.value++
  })

  if (preactSignal) {
    const theirs = preactSignal(0)
    bench('@preact/signals-core', () => {
      theirs.value++
    })
  }
})

group('Signal read', () => {
  const ours = ourSignal(42)
  bench('@rlabs-inc/signals', () => {
    return ours.value
  })

  if (preactSignal) {
    const theirs = preactSignal(42)
    bench('@preact/signals-core', () => {
      return theirs.value
    })
  }
})

group('Derived/Computed', () => {
  const ours = ourSignal(0)
  const oursDerived = ourDerived(() => ours.value * 2)

  bench('@rlabs-inc/signals', () => {
    ours.value++
    return oursDerived.value
  })

  if (preactSignal && preactComputed) {
    const theirs = preactSignal(0)
    const theirsDerived = preactComputed(() => theirs.value * 2)

    bench('@preact/signals-core', () => {
      theirs.value++
      return theirsDerived.value
    })
  }
})

group('Effect (write + effect runs)', () => {
  const ours = ourSignal(0)
  let oursRuns = 0
  ourEffect(() => { ours.value; oursRuns++ })
  flushSync()

  bench('@rlabs-inc/signals (async)', () => {
    ours.value++
  })

  if (preactSignal && preactEffect) {
    const theirs = preactSignal(0)
    let theirsRuns = 0
    preactEffect(() => { theirs.value; theirsRuns++ })

    bench('@preact/signals-core (sync)', () => {
      theirs.value++
    })
  }
})

group('Batched writes (10 writes)', () => {
  const ours = ourSignal(0)
  ourEffect(() => { ours.value })
  flushSync()

  bench('@rlabs-inc/signals', () => {
    ourBatch(() => {
      for (let i = 0; i < 10; i++) ours.value++
    })
  })

  if (preactSignal && preactBatch && preactEffect) {
    const theirs = preactSignal(0)
    preactEffect(() => { theirs.value })

    bench('@preact/signals-core', () => {
      preactBatch(() => {
        for (let i = 0; i < 10; i++) theirs.value++
      })
    })
  }
})

await run({
  units: true,
  percentiles: false,
})
