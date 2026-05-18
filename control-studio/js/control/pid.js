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

  /**
   * IMC (Internal Model Control) / λ-tuning for FOPDT models G(s) = K·e^{−θs}/(τs+1).
   * Uses Rivera-Morari PI/PID closed-loop tuning rules with closed-loop time constant λ.
   *
   * PI:  Kp = τ / (K(λ+θ))           Ti = τ                     Td = 0
   * PID (improved): Kp = (τ + θ/2) / (K(λ + θ/2))
   *                 Ti = τ + θ/2     Td = τθ / (2τ + θ)
   *
   * Smaller λ → more aggressive (faster, less robust).
   * Typical λ ≈ θ (balanced) or λ = 2θ–3θ (conservative/robust).
   *
   * Reference: Rivera, Morari, Skogestad (1986); Skogestad SIMC (2003).
   *
   * @param {number} K  process gain
   * @param {number} tau dominant time constant
   * @param {number} theta dead time (set to 0 for non-delay systems; small ε≈τ/10 recommended)
   * @param {number} lambda desired closed-loop time constant
   * @param {'PI'|'PID'} [type='PID']
   * @returns {PIDController}
   */
  static imc(K, tau, theta, lambda, type = 'PID') {
    if (!(K !== 0 && tau > 0 && lambda > 0 && theta >= 0)) {
      throw new Error('IMC: require K≠0, τ>0, θ≥0, λ>0');
    }
    const t = type.toUpperCase();
    if (t === 'PI') {
      const Kp = tau / (K * (lambda + theta));
      const Ti = tau;
      return new PIDController(Kp, Kp / Ti, 0);
    }
    // PID (improved Rivera form)
    const halfTheta = theta / 2;
    const Kp = (tau + halfTheta) / (K * (lambda + halfTheta));
    const Ti = tau + halfTheta;
    const Td = (tau * theta) / (2 * tau + theta);
    return new PIDController(Kp, Kp / Ti, Kp * Td);
  }

  /**
   * Skogestad SIMC tuning (Sivanand/Skogestad Improved Modified Control) — robust λ-style.
   * For FOPDT: Kp = τ / (K·(τc + θ))   Ti = min(τ, 4·(τc + θ))   Td = 0 (PI variant)
   * τc is recommended = θ (default) for balanced robustness/performance.
   */
  static simc(K, tau, theta, tauC = null) {
    if (!(K !== 0 && tau > 0 && theta >= 0)) throw new Error('SIMC: require K≠0, τ>0, θ≥0');
    const tc = tauC == null ? Math.max(theta, 0.05 * tau) : tauC;
    const Kp = tau / (K * (tc + theta));
    const Ti = Math.min(tau, 4 * (tc + theta));
    return new PIDController(Kp, Kp / Ti, 0);
  }

  /**
   * Tyreus-Luyben tuning (more conservative than Ziegler-Nichols).
   * Uses ultimate gain Ku and ultimate period Tu.
   * PI:  Kp = Ku/3.2, Ti = 2.2*Tu
   * PID: Kp = Ku/2.2, Ti = 2.2*Tu, Td = Tu/6.3
   */
  static tyreusLuyben(Ku, Tu, type = 'PID') {
    if (!(Ku > 0 && Tu > 0)) throw new Error('Tyreus-Luyben: Ku and Tu must be positive');
    const t = type.toUpperCase();
    if (t === 'PI') {
      const Kp = Ku / 3.2;
      const Ti = 2.2 * Tu;
      return new PIDController(Kp, Kp / Ti, 0);
    }
    // PID
    const Kp = Ku / 2.2;
    const Ti = 2.2 * Tu;
    const Td = Tu / 6.3;
    return new PIDController(Kp, Kp / Ti, Kp * Td);
  }

  /**
   * ITAE setpoint-optimal tuning for FOPDT G(s)=K·e^{-θs}/(τs+1).
   * Rovira et al. (1969) correlations for setpoint ITAE minimization.
   * Valid range: 0 < r = θ/τ < 1.
   * PI:  Kp = (0.586/K)*r^(-0.916), Ti = τ/(1.03 - 0.165*r)
   * PID: Kp = (0.965/K)*r^(-0.855), Ti = τ/(0.796 - 0.1465*r), Td = 0.308*τ*r^0.929
   */
  static itae(K, tau, theta, type = 'PID') {
    if (!(K !== 0 && tau > 0 && theta > 0)) throw new Error('ITAE: K≠0, τ>0, θ>0 required');
    const r = theta / tau;
    if (r <= 0 || r >= 1) throw new Error(`ITAE: dead-time ratio r=θ/τ=${r.toFixed(3)} must satisfy 0 < r < 1`);
    const t = type.toUpperCase();
    if (t === 'PI') {
      const Kp = (0.586 / K) * Math.pow(r, -0.916);
      const Ti = tau / (1.03 - 0.165 * r);
      return new PIDController(Kp, Kp / Ti, 0);
    }
    // PID
    const Kp = (0.965 / K) * Math.pow(r, -0.855);
    const Ti = tau / (0.796 - 0.1465 * r);
    const Td = 0.308 * tau * Math.pow(r, 0.929);
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

/**
 * Two-degree-of-freedom PID controller.
 * Reference: C_r(s) applied to setpoint r; C_y(s) applied to output y.
 * C_r(s) = β·Kp + Ki/s + γ·Kd·N·s/(s+N)
 * C_y(s) = Kp + Ki/s + Kd·N·s/(s+N)
 * β: proportional reference weight (0-1, β=1 → 1-DOF PID)
 * γ: derivative reference weight (0=no derivative kick on setpoint, recommended)
 */
export class TwoDOFPIDController {
  constructor(Kp = 1, Ki = 0, Kd = 0, N = 100, beta = 1, gamma = 0) {
    this.Kp = Kp;
    this.Ki = Ki;
    this.Kd = Kd;
    this.N = N;
    this.beta = beta;
    this.gamma = gamma;
  }

  /** C_y(s) — the feedback TF (same as standard PID, applied to error e=r-y) */
  toFeedbackTF() {
    return new PIDController(this.Kp, this.Ki, this.Kd, this.N).toTransferFunction();
  }

  /** C_r(s) — the setpoint TF with reference weighting */
  toSetpointTF() {
    return new PIDController(this.Kp * this.beta, this.Ki, this.Kd * this.gamma, this.N).toTransferFunction();
  }

  /**
   * Returns components needed to compute the 2-DOF closed-loop.
   * T_2dof(s) = C_r(s)·G(s) / (1 + C_y(s)·G(s))
   */
  closedLoopTF(plant) {
    const Cy = this.toFeedbackTF();
    const Cr = this.toSetpointTF();
    const L = Cy.series(plant);
    const oneDofCL = L.feedback(); // L/(1+L) — standard 1-DOF CL
    return { feedback: Cy, setpoint: Cr, plant, loopTf: L, oneDofCL };
  }
}
