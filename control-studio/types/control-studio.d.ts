/**
 * control-studio.d.ts — TypeScript type definitions for Control Studio
 *
 * Generated for Phase P28-01. Covers all public exports from:
 *   js/math/   — Complex, polynomial, matrix, ODE, RNG, SVD, Schur
 *   js/control/ — TF, SS, MPC, NMPC, SysID, H∞, robust, nonlinear, MOR
 *
 * Usage (ESM with TypeScript):
 *   import { TransferFunction } from './js/control/transfer-function.js';
 *   // or via path mapping in tsconfig.json
 */

// ============================================================================
// Shared primitive types
// ============================================================================

/** Dense 2-D matrix (row-major, number[][]) */
export type Matrix = number[][];

/** Dense vector */
export type Vector = number[];

/** State-space realization { A, B, C, D } in continuous or discrete time */
export interface StateSpace {
  A: Matrix;
  B: Matrix;
  C: Matrix;
  D: Matrix;
}

// ============================================================================
// js/math/complex.js
// ============================================================================

export class Complex {
  readonly re: number;
  readonly im: number;
  constructor(re: number, im?: number);

  add(other: Complex): Complex;
  sub(other: Complex): Complex;
  mul(other: Complex): Complex;
  div(other: Complex): Complex;
  abs(): number;
  arg(): number;
  conj(): Complex;
  neg(): Complex;
  toString(): string;
  static fromPolar(r: number, theta: number): Complex;
}

// ============================================================================
// js/math/polynomial.js
// ============================================================================

/** Polynomial coefficients in descending order: [a_n, …, a_1, a_0] */
export type Polynomial = number[];

export function polyadd(a: Polynomial, b: Polynomial): Polynomial;
export function polysub(a: Polynomial, b: Polynomial): Polynomial;
export function polymul(a: Polynomial, b: Polynomial): Polynomial;
export function polydiv(a: Polynomial, b: Polynomial): { q: Polynomial; r: Polynomial };
export function polyscale(poly: Polynomial, k: number): Polynomial;
export function polyderiv(coeffs: Polynomial): Polynomial;
export function polyval(coeffs: Polynomial, s: Complex | number): Complex;
export function polyvalReal(coeffs: Polynomial, x: number): number;
export function polyroots(poly: Polynomial): Complex[];
export function rootsToRealPoly(roots: Complex[]): Polynomial;
export function polydegree(poly: Polynomial): number;
export function trimPoly(poly: Polynomial): Polynomial;
export function parseRootsString(str: string): Complex[];

// ============================================================================
// js/math/matrix.js
// ============================================================================

export function matCreate(rows: number, cols: number, fill?: number): Matrix;
export function matIdentity(n: number): Matrix;
export function matAdd(A: Matrix, B: Matrix): Matrix;
export function matSub(A: Matrix, B: Matrix): Matrix;
export function matMul(A: Matrix, B: Matrix): Matrix;
export function matScale(A: Matrix, s: number): Matrix;
export function matTranspose(A: Matrix): Matrix;
export function matSymmetrize(A: Matrix): Matrix;
export function matInverse(A: Matrix): Matrix;
export function matRank(A: Matrix, tol?: number): number;
export function matIsPositiveDefinite(A: Matrix): boolean;
export function matEigenvaluesSymmetric(A: Matrix): number[];
export function controllabilityMatrix(A: Matrix, B: Matrix): Matrix;
export function singularValues(G: Matrix): number[];
export function vecAdd(a: Vector, b: Vector): Vector;
export function vecScale(v: Vector, s: number): Vector;

export class SingularMatrixError extends Error {}

// ============================================================================
// js/math/svd.js
// ============================================================================

export interface SVDResult {
  U: Matrix;
  S: number[];
  Vt: Matrix;
}
export function computeSVD(A: Matrix, tol?: number, maxIter?: number): SVDResult;

// ============================================================================
// js/math/realschur.js
// ============================================================================

export interface SchurResult {
  Q: Matrix;
  eigenvalues: Complex[];
}
export function realSchur(A: Matrix): SchurResult;
export function hamiltonianStableSubspace(
  H: Matrix, n: number, options?: { tol?: number; useSignDiagonal?: boolean }
): { X: Matrix; Y: Matrix; stableCount: number };

// ============================================================================
// js/math/ode.js
// ============================================================================

export function rk4(
  f: (t: number, y: Vector) => Vector,
  y0: Vector, t0: number, tEnd: number, dt: number
): { t: number[]; y: Vector[] };

export interface RK45Options {
  rtol?: number;
  atol?: number;
  maxSteps?: number;
  dtMin?: number;
  dtMax?: number;
}
export function rk45(
  f: (t: number, y: Vector) => Vector,
  y0: Vector, t0: number, tEnd: number, opts?: RK45Options
): { t: number[]; y: Vector[] };

// ============================================================================
// js/math/rng.js
// ============================================================================

export function setSeed(seed: number): void;
export function getSeed(): number;
export function resetSeed(): void;
export function rand(): number;
export function randn(): number;

// ============================================================================
// js/control/transfer-function.js
// ============================================================================

export class TransferFunction {
  readonly num: Polynomial;
  readonly den: Polynomial;
  constructor(num: Polynomial, den: Polynomial);

  poles(): Complex[];
  zeros(): Complex[];
  isStable(): boolean;
  dcGain(): number;
  series(other: TransferFunction): TransferFunction;
  parallel(other: TransferFunction): TransferFunction;
  feedback(H?: TransferFunction | null): TransferFunction;
  minreal(tol?: number): TransferFunction;
  toZPK(): { zeros: Complex[]; poles: Complex[]; gain: number };
  toString(): string;
  evalAtJw?(omega: number): Complex;
}

// ============================================================================
// js/control/discrete-transfer-function.js
// ============================================================================

export class DiscreteTransferFunction {
  readonly num: Polynomial;
  readonly den: Polynomial;
  readonly Ts: number;
  constructor(num: Polynomial, den: Polynomial, Ts: number);

  isStable(): boolean;
  poles(): Complex[];
  simulate(u: number[]): number[];
}

// ============================================================================
// js/control/zpk.js
// ============================================================================

export class ZPK {
  readonly zeros: Complex[];
  readonly poles: Complex[];
  readonly gain: number;
  constructor(zeros: Complex[], poles: Complex[], gain: number);
  toTransferFunction(): TransferFunction;
}

export function zpkToTF(zeros: Complex[], poles: Complex[], gain: number): TransferFunction;
export function zpkToTransferFunction(zeros: Complex[], poles: Complex[], gain: number): TransferFunction;
export function tfToZPK(tf: TransferFunction): ZPK;

// ============================================================================
// js/control/mimo.js
// ============================================================================

export class MIMOStateSpace {
  readonly A: Matrix;
  readonly B: Matrix;
  readonly C: Matrix;
  readonly D: Matrix;
  readonly ny: number;
  readonly nu: number;
  readonly n: number;
  constructor(A: Matrix, B: Matrix, C: Matrix, D: Matrix);

  evalAtJw(omega: number): Matrix;
  isStable(): boolean;
  dcGain(): Matrix;
}

export function stateSpaceToTransferFunction(
  A: Matrix, B: Matrix, C: Matrix, D: Matrix
): TransferFunction;
export function staticDecoupler(mimoSys: MIMOStateSpace): Matrix;
export function applyDecoupler(mimoSys: MIMOStateSpace, W: Matrix): MIMOStateSpace;
export function dynamicDecouplerAtFrequency(mimoSys: MIMOStateSpace, omega: number): Matrix;
export function rgaSteady(mimoSys: MIMOStateSpace): Matrix;
export function dynamicRGA(mimoSys: MIMOStateSpace, omegas: number[]): Matrix[][];
export function dynamicRGADiagonal(mimoSys: MIMOStateSpace, omegas: number[]): number[][];
export function dynamicRGAMagnitude(mimoSys: MIMOStateSpace, omegas: number[]): number[][];
export function rgaDiagnosis(rga: Matrix): string;
export function rgaInvariants(rga: Matrix): { trace: number; det: number };
export function dcGain(mimoSys: MIMOStateSpace): Matrix;
export function evalAtJw(mimoSys: MIMOStateSpace, omega: number): Matrix;
export function singularValueBode(mimoSys: MIMOStateSpace, omegas: number[]): { sigma_max: number[]; sigma_min: number[] };
export function gershgorinBands(mimoSys: MIMOStateSpace, omegas: number[]): { lower: number[]; upper: number[] };
export function characteristicLoci(mimoSys: MIMOStateSpace, omegas: number[]): Complex[][];

// ============================================================================
// js/control/pid.js
// ============================================================================

export interface PIDParams {
  Kp: number;
  Ki?: number;
  Kd?: number;
  Tf?: number;  // derivative filter time constant
}

export class PIDController {
  readonly Kp: number;
  readonly Ki: number;
  readonly Kd: number;
  readonly Tf: number;
  constructor(params: PIDParams);
  toTransferFunction(): TransferFunction;
  step(e: number, dt: number): number;
  reset(): void;
}

export class TwoDOFPIDController {
  constructor(params: PIDParams & { b?: number; c?: number });
  step(r: number, y: number, dt: number): number;
  toTransferFunction(): { C: TransferFunction; F: TransferFunction };
  reset(): void;
}

export function autoTunePIDToSpec(
  plant: TransferFunction,
  spec: { targetPM: number; targetWc: number; type?: 'P' | 'PI' | 'PID'; tiTdRatio?: number }
): PIDParams;

// ============================================================================
// js/control/c2d.js  (continuous-to-discrete conversion)
// ============================================================================

export function c2dTustin(sys: TransferFunction, Ts: number): DiscreteTransferFunction;
export function c2dTustinPrewarp(sys: TransferFunction, Ts: number, omegaPrewarp: number): DiscreteTransferFunction;
export function c2dZOH(sys: TransferFunction, Ts: number): DiscreteTransferFunction;
export function c2dMatchedZ(sys: TransferFunction, Ts: number): DiscreteTransferFunction;
export function c2dImpulseInvariant(sys: TransferFunction, Ts: number): DiscreteTransferFunction;
export function d2cTustin(dtf: DiscreteTransferFunction): TransferFunction;
export function discretizeZOH(A: Matrix, B: Matrix, Ts: number): { Ad: Matrix; Bd: Matrix };

// ============================================================================
// js/control/state-feedback.js
// ============================================================================

export interface LQROptions {
  symmetrize?: boolean;
  maxIter?: number;
  tol?: number;
}

export interface LQRResult {
  K: Matrix;
  P: Matrix;
  closedLoopPoles: Complex[];
}

export function solveLqr(
  A: Matrix, B: Matrix, Q?: Matrix, R?: Matrix, options?: LQROptions
): LQRResult;
export function solveLqrMIMO(
  A: Matrix, B: Matrix, Q?: Matrix, R?: Matrix, options?: LQROptions
): LQRResult;
export function solveLqe(
  A: Matrix, C: Matrix, Qn: Matrix, Rn: Matrix, options?: LQROptions
): { L: Matrix; P: Matrix };
export function solveCareHamiltonianSchur(
  A: Matrix, B: Matrix, Q?: Matrix, R?: Matrix, options?: LQROptions
): { P: Matrix; K: Matrix; closedLoopPoles?: Complex[] };
export function solveDAREHamiltonianSign(
  Ad: Matrix, Bd: Matrix, Q?: Matrix, R?: Matrix, options?: LQROptions
): { P: Matrix; K: Matrix };
export function solveContinuousLyapunov(A: Matrix, Q?: Matrix): Matrix;
export function analyzeLyapunov(A: Matrix, Q?: Matrix): { P: Matrix; isStable: boolean };
export function solveHinfFilter(
  A: Matrix, C: Matrix, Qw: Matrix, Rv: Matrix, gamma: number
): { L: Matrix; P: Matrix };
export function placeStateFeedback(A: Matrix, B: Matrix, desiredPoles: (number | Complex)[]): Matrix;
export function placeObserver(A: Matrix, C: Matrix, desiredPoles: (number | Complex)[]): Matrix;
export function closedLoopA(A: Matrix, B: Matrix, K: Matrix): Matrix;
export function closedLoopTransferFromStateFeedback(
  model: StateSpace, K: Matrix
): TransferFunction;
export function designIntegralLQR(
  A: Matrix, B: Matrix, C: Matrix, Qaug: Matrix, R: Matrix
): { K: Matrix; Ki: Matrix };
export function augmentWithIntegralAction(A: Matrix, B: Matrix, C: Matrix): StateSpace;
export function brysonsRule(maxStates: Vector, maxOutput: Vector): { Q: Matrix; R: Matrix };
export function specsToTargetPoles(
  spec: { overshoot: number; settlingTime: number; criterion?: number }
): Complex[];
export function checkPoleRegion(poles: Complex[], region: { alpha?: number; omega?: number }): boolean;

// ============================================================================
// js/control/stability.js
// ============================================================================

export interface StabilityResult {
  isStable: boolean;
  gainMarginDB: number;
  phaseMarginDeg: number;
  gainCrossoverHz: number;
  phaseCrossoverHz: number;
  delayMarginMs?: number;
}

export function analyzeStability(sys: TransferFunction, options?: { Ts?: number }): StabilityResult;
export function stabilityMargins(sys: TransferFunction): StabilityResult;
export function stepInfo(
  tArr: number[], yArr: number[], finalValue?: number | null, reference?: number | null
): { riseTime: number; settlingTime: number; overshoot: number; steadyStateError: number };
export function routhTable(den: Polynomial): { table: number[][]; unstableRoots: number };

// ============================================================================
// js/control/mpc.js
// ============================================================================

export interface MPCConstraints {
  uMin?: number | number[];
  uMax?: number | number[];
  xMin?: number[];
  xMax?: number[];
  yMin?: number[];
  yMax?: number[];
  deltaUMax?: number | number[];
}

export interface MPCResult {
  x: Vector[];
  u: Vector[];
  cost: number[];
}

export function simulateUnconstrainedMpc(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x0: Vector, options?: { Qf?: Matrix; steps?: number; ref?: Vector | Vector[] }
): MPCResult;

export function simulateConstrainedMpc(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x0: Vector,
  constraints?: MPCConstraints, options?: { steps?: number; Qf?: Matrix }
): MPCResult;

export function simulateMpcTracking(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x0: Vector, reference: Vector | Vector[],
  constraints?: MPCConstraints, options?: object
): MPCResult;

export function simulateOffsetFreeMpc(
  Ad: Matrix, Bd: Matrix, C: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x0: Vector, yRef: Vector, options?: object
): MPCResult & { d: Vector[] };

export function firstMpcAction(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x: Vector, Qf?: Matrix | null, options?: object
): Vector;

export function firstMpcActionConstrained(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x: Vector, constraints?: MPCConstraints,
  Qf?: Matrix | null, options?: object
): Vector;

export function firstMpcActionTracking(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x: Vector, reference: Vector, constraints?: MPCConstraints,
  Qf?: Matrix | null, options?: object
): Vector;

export function finiteHorizonLqr(
  Ad: Matrix, Bd: Matrix, Q?: Matrix, R?: Matrix,
  horizon?: number, Qf?: Matrix | null, options?: object
): { K: Matrix[]; P: Matrix[] };

export function validateMpcModel(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix, horizon: number
): { isValid: boolean; errors: string[] };

export function checkMpcFeasibility(
  Ad: Matrix, Bd: Matrix, C: Matrix, horizon: number,
  x0: Vector, constraints?: MPCConstraints
): { isFeasible: boolean; reason?: string };

export function solveSetpointSteadyState(Ad: Matrix, Bd: Matrix, r: Vector): { xs: Vector; us: Vector };
export function solveOutputSetpointSteadyState(
  Ad: Matrix, Bd: Matrix, C: Matrix, D: Matrix, yRef: Vector, options?: object
): { xs: Vector; us: Vector };

// ============================================================================
// js/control/nmpc.js
// ============================================================================

export interface NMPCOptions {
  Qf?: Matrix;
  ref?: Vector | Vector[];
  uPrev?: Vector;
  jacH?: number;
  constraintFn?: (u: Vector) => Vector;
}

export interface NMPCResult {
  x: Vector[];
  u: Vector[];
  cost: number[];
}

export function simulateNMPC(
  f: (x: Vector, u: Vector) => Vector,
  Q: Matrix, R: Matrix,
  horizon: number, x0: Vector, steps: number,
  opts?: NMPCOptions
): NMPCResult;

// ============================================================================
// js/control/empc.js
// ============================================================================

export interface EMPCOptions {
  termCost?: (x: Vector) => number;
  uMin?: Vector;
  uMax?: Vector;
  popSize?: number;
  maxGen?: number;
  F?: number;
  CR?: number;
  seed?: number;
  uInit?: Vector;
}

export interface EMPCResult {
  x: Vector[];
  u: Vector[];
  stageCosts: number[];
  totalCost: number;
  deInfo: { fx: number; generations: number }[];
}

export function simulateEMPC(
  Ad: Matrix, Bd: Matrix,
  stageCost: (x: Vector, u: Vector) => number,
  horizon: number, x0: Vector, steps: number,
  opts?: EMPCOptions
): EMPCResult;

export function differentialEvolution(
  fn: (x: Vector) => number,
  lb: Vector,
  ub: Vector,
  opts?: { popSize?: number; maxGen?: number; F?: number; CR?: number; seed?: number; tol?: number; initialCandidate?: Vector }
): { x: Vector; fx: number; generations: number };

// ============================================================================
// js/control/tube_mpc.js
// ============================================================================

export interface TubeMPCDesign {
  K: Matrix;
  disturbanceBound: Vector;
  radiusSchedule: Vector[];
  tightening: Vector;
  tightenedConstraints: { uMin: Vector; uMax: Vector };
  feasible: boolean;
  diagnostics: object[];
}

export function propagateTubeRadius(
  Ad: Matrix, Bd: Matrix, K: Matrix, radius: Vector, disturbanceBound: Vector
): Vector;

export function designTubeMpc(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, constraints?: MPCConstraints,
  options?: { K?: Matrix; Qf?: Matrix; disturbanceBound?: Vector; initialRadius?: Vector }
): TubeMPCDesign;

export function simulateTubeMPC(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, x0: Vector | Matrix,
  constraints?: MPCConstraints,
  options?: object
): {
  x: Matrix[];
  z: Matrix[];
  u: Matrix[];
  v: Matrix[];
  e: Matrix[];
  radius: Vector[];
  K: Matrix;
  feasible: boolean;
  finalErrorNormInf: number;
};

// ============================================================================
// js/control/explicit_mpc.js
// ============================================================================

export interface ExplicitMPCRegion {
  xMin: number;
  xMax: number;
  slope: number;
  intercept: number;
  maxError: number;
  activeAt: (string | null)[];
}

export interface ExplicitMPCPolicy {
  type: 'explicit-mpc-scalar-pwl';
  Ad: Matrix;
  Bd: Matrix;
  Q: Matrix;
  R: Matrix;
  horizon: number;
  constraints: MPCConstraints;
  xDomain: [number, number];
  gridSize: number;
  regions: ExplicitMPCRegion[];
  samples: object[];
  maxFitError: number;
  allOnlineConverged: boolean;
}

export function buildExplicitMPC(
  Ad: Matrix, Bd: Matrix, Q: Matrix, R: Matrix,
  horizon: number, constraints?: MPCConstraints,
  options?: { xMin?: number; xMax?: number; gridSize?: number; mergeTolerance?: number; Qf?: Matrix }
): ExplicitMPCPolicy;

export function evaluateExplicitMPC(
  policy: ExplicitMPCPolicy, x: number | Vector | Matrix
): { u: Matrix; x: number; region: ExplicitMPCRegion; clipped: boolean };

export function simulateExplicitMPC(
  policy: ExplicitMPCPolicy, x0: number | Vector | Matrix, steps: number,
  options?: { disturbanceFn?: (k: number, x: number, u: number) => number }
): { x: number[][]; u: number[][]; regionLog: ExplicitMPCRegion[]; finalStateAbs: number; steps: number };

// ============================================================================
// js/control/sysid.js
// ============================================================================

export interface SysIDResult {
  a: number[];
  b: number[];
  yhat: number[];
  residual: number[];
  fitPercent: number;
  mse: number;
  aic: number;
  bic?: number;
  nParams: number;
}

export interface MISOSysIDResult extends SysIDResult {
  b_each: number[][];
  aicc?: number;
}

export interface AutoModelOrderResult {
  best: ModelCandidate;
  candidates: ModelCandidate[];
}

export interface ModelCandidate {
  structure: 'ARX' | 'ARMAX' | 'OE' | 'BJ';
  orders: object;
  criterion: number;
  aic: number;
  aicc: number;
  bic: number;
  trainFit: number;
  validFit?: number;
  nParams: number;
}

export function identifyARX(
  u: number[], y: number[], na: number, nb: number, nk?: number, Ts?: number
): SysIDResult;

export function identifyARMAX(
  u: number[], y: number[], na: number, nb: number, nc: number, nk?: number, Ts?: number,
  options?: { maxIter?: number; tol?: number }
): SysIDResult;

export function identifyOE(
  u: number[], y: number[], nb: number, nf: number, nk?: number, Ts?: number,
  options?: { maxIter?: number }
): SysIDResult;

export function identifyBJ(
  u: number[], y: number[], nb: number, nf: number, nc: number, nd: number,
  nk?: number, Ts?: number, options?: { maxIter?: number }
): SysIDResult;

export function identifyMISOARX(
  U_matrix: number[][], y: number[],
  na: number, nb_vec: number[], nk_vec?: number[], Ts?: number
): MISOSysIDResult;

export function autoModelOrder(
  u: number[], y: number[], options?: {
    structures?: Array<'ARX' | 'ARMAX' | 'OE' | 'BJ'>;
    criterion?: 'AICc' | 'AIC' | 'BIC';
    maxNa?: number; maxNb?: number; maxNc?: number; maxNd?: number;
    crossValidate?: boolean; trainFraction?: number;
  }
): AutoModelOrderResult;

export function autoARXOrder(
  u: number[], y: number[], options?: { maxNa?: number; maxNb?: number; criterion?: string }
): { na: number; nb: number; criterion: number };

export function computeParameterCovariance(Phi: Matrix, sigma2: number): Matrix;
export function residualWhitenessTest(residuals: number[], nlags?: number): { chi2: number; pValue: number; isWhite: boolean };
export function crossCorrelationTest(residuals: number[], u: number[], nlags?: number): { maxAbsCorr: number; isUncorrelated: boolean };

// ============================================================================
// js/control/sysid_freq.js  (FRF estimation & Levy fitting)
// ============================================================================

export interface FRFResult {
  omega: number[];
  freq: number[];
  magDB: number[];
  phaseRad: number[];
  H_re: number[];
  H_im: number[];
  coherence: number[];
  nSegments: number;
}

export interface FRFfitResult {
  num: Polynomial;
  den: Polynomial;
  fitPercent: number;
}

export function estimateFRF(
  u: number[], y: number[], Ts: number,
  opts?: { segmentLength?: number; overlap?: number; window?: 'hann' | 'rect' }
): FRFResult;

export function fitTFfromFRF(
  omega: number[], H_re: number[], H_im: number[],
  na: number, nb: number,
  opts?: { skIterations?: number; tol?: number }
): FRFfitResult;

// ============================================================================
// js/control/sysid_signals.js
// ============================================================================

export function generatePRBS(length: number, registerSize?: number, amplitude?: number): number[];
export function generateChirp(
  length: number, f0: number, f1: number, Ts?: number, method?: 'linear' | 'log'
): number[];
export function generateMultiSine(
  length: number, frequencies: number[], phases?: number[] | null, Ts?: number
): number[];

// ============================================================================
// js/control/hinf_riccati.js  (H∞ synthesis)
// ============================================================================

export interface HinfWeights {
  W1?: TransferFunction;
  W2?: TransferFunction;
  W3?: TransferFunction;
}

export interface HinfResult {
  gamma: number;
  controller: StateSpace;
  controllerTf?: TransferFunction | null;
  Xinf: Matrix;
  Yinf: Matrix;
  rhoXY: number;
  xResidual: number;
  yResidual: number;
  controllerPoles?: Complex[];
  closedLoopNorm?: number | null;
  iterations: number;
  method: string;
}

export interface LoopShapingResult {
  epsilon: number;
  gamma: number;
  gammaUsed: number;
  rhoXY: number;
  xResidual: number;
  yResidual: number;
  X: Matrix;
  Y: Matrix;
  controllerSS: StateSpace;
  shapedPlantSS: StateSpace;
  method: 'mcfarlane-glover';
}

export function synthesizeHinfRiccati(
  plant: TransferFunction,
  weights: HinfWeights,
  options?: { gammaLo?: number; gammaHi?: number; gammaTol?: number; maxBisect?: number }
): HinfResult;

export function loopShapingHinf(
  G: TransferFunction,
  W1?: TransferFunction | null,
  W2?: TransferFunction | null,
  options?: { margin?: number; gammaMax?: number }
): LoopShapingResult;

export function tfToSS(tf: TransferFunction): StateSpace | null;

// ============================================================================
// js/control/hinf_synth.js
// ============================================================================

export interface MixedSensitivityWeights {
  W1?: TransferFunction;
  W2?: TransferFunction;
  W3?: TransferFunction;
  wB?: number;
  M?: number;
  Alow?: number;
  controlPenalty?: number;
}

export function defaultMixedSensitivityWeights(opts?: {
  wB?: number; M?: number; Alow?: number; controlPenalty?: number
}): MixedSensitivityWeights;

export function mixedSensitivityCost(
  W1: TransferFunction | null, W2: TransferFunction | null, W3: TransferFunction | null,
  loopTf: TransferFunction, controllerTf: TransferFunction, omegas: number[]
): { peak: number; omega_peak: number };

export function tunePIDForMixedSensitivity(
  plant: TransferFunction, weights: MixedSensitivityWeights,
  options?: { maxIter?: number; tol?: number }
): { Kp: number; Ki: number; Kd: number; gamma: number };

// ============================================================================
// js/control/robust.js  (μ-analysis, disk margin, etc.)
// ============================================================================

export interface RobustMargins {
  diskMarginDB: number;
  gmDB: number;
  pmDeg: number;
}

export function diskMargin(
  loopTf: TransferFunction, omegas: number[], controllerTf?: TransferFunction | null
): RobustMargins;

export function robustPeaks(
  loopTf: TransferFunction, omegas: number[], controllerTf?: TransferFunction | null
): { MS: number; MT: number; MS_omega: number; MT_omega: number };

export function sensitivityBode(
  loopTf: TransferFunction, omegas: number[], controllerTf?: TransferFunction | null
): { magS: number[]; magT: number[] };

export function sensitivityAt(
  loopTf: TransferFunction, omega: number, controllerTf?: TransferFunction | null
): { S: number; T: number };

export function structuredMuSweep(
  mimoSys: MIMOStateSpace, omegas: number[], options?: object
): { mu_upper: number[]; mu_lower: number[] };

export function structuredMuUpperBound(M: Matrix, options?: object): number;
export function structuredMuSynthesisSurrogate(
  mimoSys: MIMOStateSpace, omegas: number[], options?: object
): { gamma: number; controller?: StateSpace };

export function hInfNorm(sys: MIMOStateSpace | TransferFunction, omegas?: number[]): number;

// ============================================================================
// js/control/nonlinear.js  (gain scheduling, SMC)
// ============================================================================

export interface GainScheduledPIDParams {
  Kp: number;
  Ki: number;
  Kd: number;
}

export interface GainScheduledPID {
  getGains(rho: number): GainScheduledPIDParams;
  compute(e: number, dedt: number, intE: number, rho: number): number;
}

export function gainScheduledPID(
  breakpoints: number[],
  pidParams: GainScheduledPIDParams[],
  opts?: { uMin?: number; uMax?: number }
): GainScheduledPID;

export function simulateGainScheduledPID(
  gs: GainScheduledPID, a: number, b: number, Ts: number,
  N: number, ref: number[], schedulingFn: (k: number, y: number) => number,
  opts?: { x0?: number }
): { y: number[]; u: number[]; e: number[]; intE: number[] };

export interface SMCController {
  compute(x1: number, x2: number, r: number, rdot: number): { u: number; sigma: number };
}

export interface SMCOptions {
  uMin?: number;
  uMax?: number;
}

export function designSMC(
  c: number, eta: number, eps: number,
  fCoeff: number, gVal: number, opts?: SMCOptions
): SMCController;

export function simulateSMC(
  smc: SMCController, a: number, b: number,
  Ts: number, N: number, ref: number[],
  disturbanceFn?: ((k: number) => number) | null,
  opts?: { x0?: [number, number] }
): { x1: number[]; x2: number[]; u: number[]; sigma: number[] };

// ============================================================================
// js/control/model_reduction.js  (balanced truncation, minreal SS)
// ============================================================================

export interface BalancedTruncationResult {
  A: Matrix; B: Matrix; C: Matrix; D: Matrix;
  order: number;
  hsvd: number[];
  errorBound: number;
  originalOrder: number;
}

export interface MinrealSSResult {
  A: Matrix; B: Matrix; C: Matrix; D: Matrix;
  order: number;
  removedStates: number;
  isControllable: boolean;
  isObservable: boolean;
  controllableRank: number;
  observableRank: number;
}

export function balancedTruncation(
  A: Matrix, B: Matrix, C: Matrix, D: Matrix,
  order: number, opts?: { tol?: number }
): BalancedTruncationResult;

export function minrealSS(
  A: Matrix, B: Matrix, C: Matrix, D: Matrix,
  opts?: { tol?: number }
): MinrealSSResult;

// ============================================================================
// js/control/ekf.js  (Extended/Unscented Kalman Filter)
// ============================================================================

export interface EKFResult {
  xhat: Vector[];
  P: Matrix[];
  y_pred: Vector[];
  residuals: Vector[];
}

export function simulateEKF(
  f: (x: Vector, u: Vector) => Vector,
  hFunc: (x: Vector) => Vector,
  uSeq: Vector[], ySeq: Vector[],
  Q: Matrix, R: Matrix, P0: Matrix, x0hat: Vector,
  options?: { dt?: number }
): EKFResult;

export function simulateUKF(
  f: (x: Vector, u: Vector) => Vector,
  hFunc: (x: Vector) => Vector,
  uSeq: Vector[], ySeq: Vector[],
  Q: Matrix, R: Matrix, P0: Matrix, x0hat: Vector,
  options?: { alpha?: number; beta?: number; kappa?: number }
): EKFResult;

export function runLinearEKF(
  model: StateSpace & { Ts: number },
  uSeq: Vector[], Q: Matrix, R: Matrix,
  options?: object
): EKFResult;

// ============================================================================
// js/control/ga_tuner.js  (GA / NSGA-II PID tuning)
// ============================================================================

export interface NSGAResult {
  Kp: number;
  Ki: number;
  Kd: number;
  objectives: number[];
  paretoFront?: Array<{ Kp: number; Ki: number; Kd: number; objectives: number[] }>;
}

export function nsga2TunePID(
  plant: TransferFunction,
  options?: { populationSize?: number; generations?: number; seed?: number }
): NSGAResult;

export function gaTunePID(
  plant: TransferFunction,
  options?: { populationSize?: number; generations?: number; seed?: number }
): { Kp: number; Ki: number; Kd: number; fitness: number };

// ============================================================================
// js/control/compensator.js  (lead/lag compensators)
// ============================================================================

export function designLeadCompensator(spec: {
  phaseBoostDeg: number; crossoverFreq: number; gainStrategy?: string
}): TransferFunction;

export function designLeadForPM(
  plant: TransferFunction, spec: { targetPM: number; safetyMargin?: number }
): TransferFunction;

export function designLagCompensator(spec: {
  improvementFactor: number; crossoverFreq: number; zeroRatio?: number
}): TransferFunction;

export function designLeadLagCompensator(spec: {
  phaseBoostDeg: number; crossoverFreq: number; improvementFactor: number; zeroRatio?: number
}): TransferFunction;

export function notchFilter(omegaN: number, zetaNum: number, zetaDen: number): TransferFunction;

// ============================================================================
// js/control/delay.js
// ============================================================================

export function padeApprox(T: number, n?: number): TransferFunction;
export function padeCoefficients(T: number, n: number): { num: Polynomial; den: Polynomial };
export function applyDelay(G: TransferFunction, delaySeconds: number, order?: number): TransferFunction;
export function delayPhase(omega: number, delaySeconds: number): number;
export function delayMargin(phaseMarginDeg: number, gainCrossoverOmega: number): number;
export function smithPredictor(controllerTf: TransferFunction, plantModelGm: TransferFunction): TransferFunction;

// ============================================================================
// js/control/productization.js  (codegen/report/interop/deployment readiness)
// ============================================================================

export interface DeploymentReadinessCheck {
  id: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'minor' | 'major' | 'critical';
  message: string;
  evidence: Record<string, unknown>;
}

export interface DeploymentReadinessConfig {
  target?: 'c' | 'rust' | 'plc' | 'autosar' | 'freertos' | 'hil' | string;
  sampleTime?: number;
  dt?: number;
  controller?: Record<string, unknown> & { Ts?: number };
  plant?: { nStates?: number; nInputs?: number; states?: number; inputs?: number };
  codegen?: {
    files?: Record<string, string>;
    artifacts?: Record<string, string>;
    code?: string;
    warnings?: string[];
    metadata?: Record<string, unknown>;
    artifactId?: string;
    revision?: string;
    commit?: string;
    target?: string;
  };
  timing?: {
    wcetMs?: number;
    worstCaseMs?: number;
    computeMs?: number;
    deadlineMs?: number;
    deadline?: number;
    jitterMs?: number;
    maxJitterMs?: number;
  };
  numeric?: {
    fixedPoint?: boolean;
    qFormat?: string;
    wordLength?: number;
    fractionBits?: number;
    maxAbsSignal?: number;
    maxAbsValue?: number;
  };
  safety?: {
    critical?: boolean;
    crc?: string | boolean | null;
    checksum?: string | boolean | null;
    watchdog?: boolean;
    redundancy?: number;
  };
  safetyCritical?: boolean;
  requireHIL?: boolean;
  hil?: {
    required?: boolean;
    protocol?: string;
    stateChannels?: number;
    controlChannels?: number;
    nStates?: number;
    nInputs?: number;
    sampleTime?: number;
    Ts?: number;
    latencyMs?: number;
    maxLatencyMs?: number;
    frameSchema?: string[];
    roundTrip?: boolean;
  };
}

export interface DeploymentReadinessResult {
  status: 'pass' | 'warn' | 'fail';
  deploymentClass: 'ready' | 'conditional' | 'blocked';
  score: number;
  checks: DeploymentReadinessCheck[];
  requiredActions: string[];
  summary: {
    target: string;
    sampleTime: number | null;
    samplePeriodMs: number | null;
    failed: number;
    warnings: number;
    totalChecks: number;
  };
}

export function assessDeploymentReadiness(config?: DeploymentReadinessConfig): DeploymentReadinessResult;
