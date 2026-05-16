/**
 * pid.js — PID Controller: C(s) = Kp + Ki/s + Kd·Ns/(s+N)
 */
import { TransferFunction } from './transfer-function.js';
import { polyadd, polymul } from '../math/polynomial.js';

export class PIDController {
  constructor(Kp = 1, Ki = 0, Kd = 0, N = 100) {
    this.Kp = Kp;
    this.Ki = Ki;
    this.Kd = Kd;
    this.N = N; // Derivative filter coefficient
  }

  /** Convert to transfer function: Kp + Ki/s + Kd·N·s/(s+N) */
  toTransferFunction() {
    // C(s) = [Kp·s·(s+N) + Ki·(s+N) + Kd·N·s²] / [s·(s+N)]
    // den = s·(s+N) = [1, N, 0]
    const den = [1, this.N, 0];

    // Kp·s·(s+N) = Kp·[1, N, 0]
    const kpTerm = [this.Kp, this.Kp * this.N, 0];
    // Ki·(s+N) = [Ki, Ki·N]
    const kiTerm = [this.Ki, this.Ki * this.N];
    // Kd·N·s² = [Kd·N, 0, 0]
    const kdTerm = [this.Kd * this.N, 0, 0];

    let num = polyadd(polyadd(kpTerm, kiTerm), kdTerm);

    // If Ki = 0, simplify (remove s from den)
    if (Math.abs(this.Ki) < 1e-15) {
      // C(s) = [Kp·(s+N) + Kd·N·s] / (s+N)
      num = polyadd([this.Kp, this.Kp * this.N], [this.Kd * this.N, 0]);
      return new TransferFunction(num, [1, this.N]);
    }

    return new TransferFunction(num, den);
  }

  /** Ziegler-Nichols tuning from ultimate gain and period */
  static zieglerNichols(Ku, Tu, type = 'PID') {
    switch (type) {
      case 'P':
        return new PIDController(0.5 * Ku, 0, 0);
      case 'PI':
        return new PIDController(0.45 * Ku, 0.54 * Ku / Tu, 0);
      case 'PID':
        return new PIDController(0.6 * Ku, 1.2 * Ku / Tu, 0.075 * Ku * Tu);
      default:
        return new PIDController(0.6 * Ku, 1.2 * Ku / Tu, 0.075 * Ku * Tu);
    }
  }

  /**
   * Cohen-Coon tuning from first-order plus dead-time (FOPDT) model.
   * G(s) = K · e^{-td·s} / (τs + 1). Multiple "Cohen-Coon" tables exist; we use
   * the early-form table that matches the original 1953 paper coefficients.
   * NOTE: validity range is roughly r = td/τ ≤ 1; for very large dead-time
   * ratios (r > ~1.23) the Td denominator can flip sign — guarded below.
   */
  static cohenCoon(K, tau, td) {
    if (!(K > 0 && tau > 0 && td > 0)) throw new Error('Cohen-Coon: K, τ, td must be positive');
    const r = td / tau;
    if (r > 1.2) throw new Error(`Cohen-Coon: dead-time ratio r=${r.toFixed(2)} > 1.2 is outside the valid range; use a different tuner.`);
    const Kp = (1.35 / K) * (tau / td) * (1 + 0.18 * r / (1 - 0.18 * r));
    const Ti = td * (2.5 - 2 * r) / (1 - 0.39 * r);
    const Td = 0.37 * td * tau / (tau - 0.81 * td);
    if (!(Ti > 0 && Td > 0)) throw new Error('Cohen-Coon: computed Ti or Td is non-positive; FOPDT model may be ill-conditioned');
    return new PIDController(Kp, Kp / Ti, Kp * Td);
  }

  toString() {
    const parts = [];
    if (this.Kp !== 0) parts.push(`Kp=${this.Kp.toFixed(3)}`);
    if (this.Ki !== 0) parts.push(`Ki=${this.Ki.toFixed(3)}`);
    if (this.Kd !== 0) parts.push(`Kd=${this.Kd.toFixed(3)}`);
    return `PID(${parts.join(', ')})`;
  }
}
