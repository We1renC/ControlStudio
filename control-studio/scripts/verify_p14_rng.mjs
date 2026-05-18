#!/usr/bin/env node
import { setSeed, rand, randn, resetSeed, getSeed } from '../js/math/rng.js';

let failed = 0;
function ok(label, cond, info='') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${info ? ': ' + info : ''}`);
  if (!cond) failed++;
}

// Seed reproducibility
setSeed(42);
const a = [rand(), rand(), rand()];
setSeed(42);
const b = [rand(), rand(), rand()];
ok('same seed → same sequence', JSON.stringify(a) === JSON.stringify(b), `[${a.map(v=>v.toFixed(4))}]`);

// resetSeed restarts sequence
setSeed(123);
const s1 = [rand(), rand()];
resetSeed();
const s2 = [rand(), rand()];
ok('resetSeed reverts sequence', JSON.stringify(s1) === JSON.stringify(s2));

// Different seeds give different sequences
setSeed(1);
const x = rand();
setSeed(2);
const y = rand();
ok('different seeds → different values', x !== y, `${x.toFixed(4)} vs ${y.toFixed(4)}`);

// randn empirical sanity: mean ≈ 0, std ≈ 1 over many samples
setSeed(99);
const N = 5000;
let sum = 0, sumsq = 0;
for (let i = 0; i < N; i++) { const v = randn(); sum += v; sumsq += v*v; }
const mean = sum / N;
const std = Math.sqrt(sumsq / N - mean * mean);
ok(`randn mean ≈ 0 (got ${mean.toFixed(3)})`, Math.abs(mean) < 0.1);
ok(`randn std ≈ 1 (got ${std.toFixed(3)})`, Math.abs(std - 1) < 0.1);

// Clear seed reverts to non-deterministic
setSeed(null);
ok('getSeed() returns null after clear', getSeed() === null);

if (failed === 0) console.log('\nP14-06 (RNG): all checks passed');
else { console.log(`\nP14-06 (RNG): ${failed} FAILED`); process.exitCode = 1; }
