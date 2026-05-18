#!/usr/bin/env node
import { gaTunePID } from '../js/control/ga_tuner.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { setSeed } from '../js/math/rng.js';

let failed = 0;
function ok(label, cond, info='') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${info ? ': ' + info : ''}`);
  if (!cond) failed++;
}

console.log('\n=== P16-04: GA PID tuner ===\n');

// Plant 1/(s²+s) — tune
{
  setSeed(2025);
  const G = new TransferFunction([1], [1, 1, 0]);
  const t0 = Date.now();
  const { best, history } = gaTunePID(G, { populationSize: 16, generations: 12, kpRange: 8, kiRange: 4, kdRange: 1 });
  const dt = Date.now() - t0;
  ok('best Kp ≥ 0', best.Kp >= 0, `Kp=${best.Kp.toFixed(3)}`);
  ok('best Ki ≥ 0', best.Ki >= 0, `Ki=${best.Ki.toFixed(3)}`);
  ok('best Kd ≥ 0', best.Kd >= 0, `Kd=${best.Kd.toFixed(3)}`);
  ok('final cost finite & < 1e5 (stable)', Number.isFinite(best.cost) && best.cost < 1e5, `cost=${best.cost.toFixed(3)}`);
  ok('history shows improvement', history[history.length - 1] <= history[0] + 1e-6,
     `${history[0].toFixed(3)} → ${history[history.length-1].toFixed(3)}`);
  ok('runtime reasonable (<5s)', dt < 5000, `${dt} ms`);
}

console.log('');
if (failed === 0) console.log('P16-04 (GA): all checks passed');
else { console.log(`P16-04 (GA): ${failed} FAILED`); process.exitCode = 1; }
