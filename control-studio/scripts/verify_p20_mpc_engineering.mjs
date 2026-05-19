import assert from 'assert';
import {
  simulateConstrainedMpc,
  simulateMpcTracking,
  firstMpcActionConstrained
} from '../js/control/mpc.js';

let failed = 0;

console.log('=== Phase 20: MPC Move Suppression ===\n');

// 1. Unconstrained scalar system, S > 0 vs S = 0
{
  const Ad = [[0.9]];
  const Bd = [[1.0]];
  const Q = [[1.0]];
  const R = [[0.1]];
  const x0 = [[10]];
  const horizon = 5;

  const simBase = simulateConstrainedMpc(Ad, Bd, Q, R, horizon, x0, {}, { steps: 20 });
  
  const S = [[10.0]]; // Heavy move suppression
  const simSuppressed = simulateConstrainedMpc(Ad, Bd, Q, R, horizon, x0, {}, { steps: 20, S });

  try {
    const duBase = Math.abs(simBase.u[0][0][0] - 0); // uPrev default is 0
    const duSuppressed = Math.abs(simSuppressed.u[0][0][0] - 0);
    
    assert(duSuppressed < duBase, `Move suppression should reduce initial action (base=${duBase.toFixed(3)}, suppressed=${duSuppressed.toFixed(3)})`);
    console.log('[PASS] Move suppression reduces initial action');

    // Both should stabilize to 0
    assert(Math.abs(simBase.x[20][0][0]) < 1e-3, 'Base MPC stabilizes');
    assert(Math.abs(simSuppressed.x[20][0][0]) < 1e-2, 'Suppressed MPC stabilizes');
    console.log('[PASS] Move suppressed MPC maintains steady-state stability');
  } catch (e) {
    console.error(`[FAIL] ${e.message}`);
    failed++;
  }
}

// 2. Tracking with move suppression
{
  const Ad = [[0.8]];
  const Bd = [[2.0]];
  const Q = [[1.0]];
  const R = [[0.01]];
  const x0 = [[0]];
  const ref = [[5]];
  const horizon = 10;
  
  const simBase = simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, ref, {}, { steps: 15 });
  const simSuppressed = simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, ref, {}, { steps: 15, S: [[5.0]] });

  try {
    const duBase = Math.abs(simBase.u[0][0][0]);
    const duSuppressed = Math.abs(simSuppressed.u[0][0][0]);
    assert(duSuppressed < duBase * 0.5, 'Move suppression effectively damps tracking action');
    console.log('[PASS] Tracking move suppression damps action');

    const errBase = simBase.finalTrackingErrorNormInf;
    const errSuppressed = simSuppressed.finalTrackingErrorNormInf;
    assert(errBase < 1e-3, 'Base tracking converges');
    assert(errSuppressed < 1e-3, 'Suppressed tracking converges to same steady-state');
    console.log('[PASS] Move suppression does not affect steady-state tracking target');
  } catch(e) {
    console.error(`[FAIL] ${e.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n[FAIL] ${failed} checks failed.`);
  process.exit(1);
} else {
  console.log('\n[PASS] All Move Suppression checks passed.');
}
