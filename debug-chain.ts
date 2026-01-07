/**
 * Debug: Find exactly where the stack overflow happens in derived chains
 */

import { signal, derived } from './src/index'

// Test at increasing depths to find the exact limit
for (const depth of [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
  try {
    const source = signal(0)
    let prev: { readonly value: number } = source

    for (let i = 0; i < depth; i++) {
      const p = prev
      prev = derived(() => p.value + 1)
    }

    // This is where the recursion happens
    source.value = 1
    const result = prev.value

    console.log(`Depth ${depth}: ✓ (result=${result})`)
  } catch (e) {
    console.log(`Depth ${depth}: FAILED - ${(e as Error).message}`)

    // Print partial stack to see where it fails
    const stack = (e as Error).stack?.split('\n').slice(0, 20).join('\n')
    console.log('Stack trace (first 20 lines):')
    console.log(stack)
    break
  }
}
