import assert from 'assert';
import {
  simulateConstrainedMpc,
  simulateMpcTracking,
  firstMpcActionConstrained,
  simulateOffsetFreeMpc,
  checkMpcFeasibility
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

console.log('\n=== Phase 20: MPC Offset-Free Tracking ===\n');

{
  const Ad = [[0.8]];
  const Bd = [[2.0]];
  const C = [[1.0]];
  const Q = [[1.0]];
  const R = [[0.1]];
  const horizon = 10;
  const x0 = [[0]];
  const yRef = [[5]];
  const Qw = [[1, 0], [0, 1]]; // Process + disturbance noise
  const Rv = [[0.1]]; // Measurement noise
  
  // 1. Without disturbance, should act like standard MPC
  const simNoDist = simulateOffsetFreeMpc(Ad, Bd, C, Q, R, horizon, x0, yRef, {}, { Qw, Rv, steps: 20 });
  
  // 2. With constant unmeasured output disturbance
  const d_plant = [[2.0]]; 
  const simDist = simulateOffsetFreeMpc(Ad, Bd, C, Q, R, horizon, x0, yRef, {}, { Qw, Rv, steps: 40, disturbance: d_plant });

  try {
    assert(simNoDist.finalTrackingErrorNormInf < 1e-3, 'Converges without disturbance');
    console.log('[PASS] Offset-free MPC converges without disturbance');
    
    // Check if the observer correctly estimates the disturbance
    const finalDHat = simDist.xHat[40][1][0];
    assert(Math.abs(finalDHat - 2.0) < 1e-2, `Disturbance estimated correctly (got ${finalDHat.toFixed(3)})`);
    console.log('[PASS] Observer correctly estimates step disturbance');
    
    // Check if tracking error converges to zero despite disturbance
    const finalErr = simDist.finalTrackingErrorNormInf;
    assert(finalErr < 1e-3, `Tracking error rejected disturbance (err=${finalErr.toExponential(2)})`);
    console.log('[PASS] MPC offsets tracking target to reject disturbance');
  } catch(e) {
    console.error(`[FAIL] ${e.message}`);
    failed++;
  }
}

console.log('\n=== Phase 20: MPC Infeasibility Handling ===\n');

{
  const Ad = [[1, 1], [0, 1]];
  const Bd = [[0], [1]];
  const C = [[1, 0]];
  const x0 = [[0], [0]];
  const constraints = { uMin: -1, uMax: 1, xMax: [10, 10], yMax: [-5] };
  
  try {
    const diag = checkMpcFeasibility(Ad, Bd, C, 5, x0, constraints);
    assert(diag.feasible === false, 'Diagnostic detects infeasibility');
    console.log('[PASS] Diagnostics properly detects constraint conflict');
    
    assert(diag.violatedConstraints.length > 0, 'Diagnostic lists violated constraints');
    assert(diag.violatedConstraints[0].type === 'yMax', 'Diagnostic identifies output bound conflict');
    console.log('[PASS] Diagnostics correctly categorizes unreachable constraints');
  } catch(e) {
    console.error(`[FAIL] ${e.message}`);
    failed++;
  }

  // uMin > uMax: inverted input bounds must be immediately rejected
  try {
    const Ad = [[0.9]]; const Bd = [[0.5]]; const C = [[1]]; const x0 = [[0]];
    const d = checkMpcFeasibility(Ad, Bd, C, 5, x0, { uMin: 2, uMax: -2 });
    assert(d.feasible === false, 'uMin>uMax detected as infeasible');
    assert(d.violatedConstraints.some(c => c.type === 'uConflict'), 'uConflict type recorded');
    console.log('[PASS] Diagnostics detects inverted input bounds (uMin > uMax)');
  } catch(e) {
    console.error(`[FAIL] uMin>uMax detection: ${e.message}`);
    failed++;
  }

  // Qw size mismatch must throw a descriptive error
  try {
    const Ad = [[0.8]]; const Bd = [[0.3]]; const C = [[1]];
    simulateOffsetFreeMpc(Ad, Bd, C, [[1]], [[0.1]], 5, [[0]], [[1]], {},
      { steps: 5, Qw: [[0.01]], Rv: [[0.1]] }  // Qw should be 2×2, not 1×1
    );
    failed++;
    console.error('[FAIL] Wrong Qw size: should have thrown');
  } catch(e) {
    assert(e.message.includes('Qw must be'), `descriptive Qw error: "${e.message}"`);
    console.log('[PASS] simulateOffsetFreeMpc rejects wrong Qw size with descriptive error');
  }
}

if (failed > 0) {
  console.error(`\n[FAIL] ${failed} checks failed.`);
  process.exit(1);
} else {
  console.log('\n[PASS] All Move Suppression checks passed.');
}
