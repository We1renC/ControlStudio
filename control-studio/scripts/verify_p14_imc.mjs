#!/usr/bin/env node
// verify_p14_imc.mjs — IMC / λ-tuning + SIMC verification
import { PIDController } from '../js/control/pid.js';

let failed = 0;
function near(label, a, b, tol = 1e-9) {
  const ok = Math.abs(a - b) < tol;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}: got ${a.toFixed(6)}, expected ≈${b.toFixed(6)}`);
  if (!ok) failed++;
}
function assertThrows(label, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  console.log(`${threw ? '[PASS]' : '[FAIL]'} ${label}`);
  if (!threw) failed++;
}

console.log('\n=== P14-02: IMC PI tuning ===\n');
// FOPDT: K=2, τ=10, θ=1, λ=2 → PI
{
  const pid = PIDController.imc(2, 10, 1, 2, 'PI');
  // Kp = τ/(K(λ+θ)) = 10/(2·3) = 1.6667
  // Ti = τ = 10  → Ki = Kp/Ti = 0.16667
  near('IMC-PI Kp', pid.Kp, 10 / (2 * 3));
  near('IMC-PI Ki', pid.Ki, (10 / (2 * 3)) / 10);
  near('IMC-PI Kd', pid.Kd, 0);
}

console.log('\n=== P14-02: IMC PID tuning (Rivera improved) ===\n');
// FOPDT: K=1, τ=5, θ=1, λ=1 → PID
{
  const pid = PIDController.imc(1, 5, 1, 1, 'PID');
  // halfθ = 0.5; Kp = (5+0.5)/(1·(1+0.5)) = 5.5/1.5 = 3.6667
  // Ti = 5+0.5 = 5.5; Td = 5·1/(10+1) = 5/11 = 0.4545
  near('IMC-PID Kp', pid.Kp, 5.5 / 1.5);
  near('IMC-PID Ki', pid.Ki, (5.5 / 1.5) / 5.5);
  near('IMC-PID Kd', pid.Kd, (5.5 / 1.5) * (5 / 11));
}

console.log('\n=== P14-02: SIMC tuning (Skogestad) ===\n');
// FOPDT: K=2, τ=10, θ=1, τc = θ = 1 → Kp = 10/(2·2)=2.5; Ti = min(10, 4·2) = 8
{
  const pid = PIDController.simc(2, 10, 1, 1);
  near('SIMC Kp', pid.Kp, 10 / (2 * 2));
  near('SIMC Ki', pid.Ki, (10 / (2 * 2)) / 8);
  near('SIMC Kd', pid.Kd, 0);
}

console.log('\n=== P14-02: edge cases ===\n');
assertThrows('IMC rejects τ ≤ 0', () => PIDController.imc(1, 0, 1, 1));
assertThrows('IMC rejects λ ≤ 0', () => PIDController.imc(1, 1, 0.1, 0));
assertThrows('IMC rejects K = 0', () => PIDController.imc(0, 1, 0.1, 1));

console.log('');
if (failed === 0) console.log('P14-02 (IMC/SIMC): all checks passed');
else { console.log(`P14-02 (IMC/SIMC): ${failed} check(s) FAILED`); process.exitCode = 1; }
