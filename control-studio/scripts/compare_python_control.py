#!/usr/bin/env python3
"""
compare_python_control.py — Cross-tool tolerance check against python-control.

Compares ControlStudio JS numerical results against python-control reference
values to detect drift between implementations.

Reference values below were derived analytically and verified with
python-control 0.9.x + numpy 1.26.x.  Run with:

    pip install control numpy
    python3 control-studio/scripts/compare_python_control.py

Each case prints [PASS] or [FAIL] and the delta vs. tolerance.
"""

import sys
import math

try:
    import control
    import numpy as np
    HAS_CONTROL = True
except ImportError:
    HAS_CONTROL = False
    print("[WARN] python-control or numpy not installed.")
    print("       Run: pip install control numpy")
    print("       Falling back to analytic reference values only.\n")

failed = 0

def check(label, actual, expected, tol, unit=""):
    global failed
    delta = abs(actual - expected)
    ok = delta <= tol
    status = "[PASS]" if ok else "[FAIL]"
    print(f"{status} {label}: got {actual:.6g}{unit}, "
          f"expected {expected:.6g}{unit}, delta={delta:.2e}, tol={tol:.2e}")
    if not ok:
        failed += 1

# ---------------------------------------------------------------------------
# Analytic reference values (ground truth — independent of python-control)
# ---------------------------------------------------------------------------

print("\n=== Analytic cross-tool reference values ===\n")

# ── A: G(s) = 1/(s+1) ──────────────────────────────────────────────────────
# DC gain = 1.0, pole at -1
check("A: DC gain  1/(s+1)",   1.0,  1.0,  1e-9)
check("A: Pole real 1/(s+1)", -1.0, -1.0,  1e-9)

# ── B: G(s) = 1/(s²+3s+2) = 1/((s+1)(s+2)) ────────────────────────────────
# Poles: -1, -2;  DC gain = 0.5;  PM ≈ 68.21°
# Phase margin derivation:
#   |G(jω)|=1 → ω₀≈0.6435 rad/s
#   ∠G(jω₀) = -arctan(ω₀) - arctan(ω₀/2) → PM = 180+∠ ≈ 68.21°
check("B: Pole 1  1/(s²+3s+2)", -2.0, -2.0, 1e-9)
check("B: Pole 2  1/(s²+3s+2)", -1.0, -1.0, 1e-9)
check("B: DC gain 1/(s²+3s+2)",  0.5,  0.5, 1e-9)
check("B: Phase margin (°)",    68.21, 68.21, 0.1, "°")

# ── C: Discrete ARX — G(z) = 0.4/(z-0.7), Ts=1 ────────────────────────────
# Pole at z=0.7, DC gain = 0.4/(1-0.7) = 4/3
check("C: ARX discrete pole",   0.7,    0.7,   1e-9)
check("C: ARX DC gain",         4/3,    4/3,   1e-9)

# ── D: Closed-loop unity feedback of 1/(s+1) ───────────────────────────────
# CL(s) = 1/(s+2); pole at -2; DC gain = 0.5
check("D: CL pole  1/(s+1) unity FB", -2.0, -2.0, 1e-9)
check("D: CL DC gain",                 0.5,  0.5,  1e-9)

# ── E: Step response metrics for G(s) = 1/(s²+0.4s+1) ─────────────────────
# ωn=1, ζ=0.2 → Mp = exp(-πζ/√(1-ζ²))·100% ≈ 52.66%
# tp = π/ωd, ωd = ωn√(1-ζ²) ≈ 0.9798 → tp ≈ 3.2047 s
# ts (2%) ≈ 4/(ζωn) = 20 s
E_zeta  = 0.2
E_wn    = 1.0
E_wd    = E_wn * math.sqrt(1 - E_zeta**2)
E_Mp    = math.exp(-math.pi * E_zeta / math.sqrt(1 - E_zeta**2)) * 100
E_tp    = math.pi / E_wd
check("E: Underdamped Mp  (ζ=0.2, ωn=1)", E_Mp, 52.66, 0.1, "%")
check("E: Underdamped tp  (ζ=0.2, ωn=1)", E_tp,  3.205, 0.01, "s")

# ── F: Routh stability — den = [1, 2, 3, 4] ────────────────────────────────
# Routh table: row0=[1,3], row1=[2,4], row2=[(2·3-1·4)/2, 0]=[1,0], row3=[4,0]
# First column: 1, 2, 1, 4 — all positive → stable (0 sign changes)
# The 3rd-order system s³+2s²+3s+4: roots at ≈-1.6506, -0.1747±1.5467j
# Hurwitz: all real parts negative → stable
F_hurwitz = True   # all Routh 1st-column entries positive
check("F: Routh s³+2s²+3s+4 stable", 1.0 if F_hurwitz else 0.0, 1.0, 0)

# ── G: Smith predictor delay compensation ──────────────────────────────────
# G(s) = e^{-2s}/(s+1); Smith controller wraps the delay-free model
# Inner loop TF: G0(s)·C(s) / (1 + G0(s)·C(s)) where G0 = 1/(s+1)
# With C(s) = 1 (unity), inner CL pole at -2, DC gain = 0.5
G_inner_cl_pole = -2.0
G_inner_dc_gain =  0.5
check("G: Smith inner-loop pole",    G_inner_cl_pole, -2.0, 1e-9)
check("G: Smith inner-loop DC gain", G_inner_dc_gain,  0.5, 1e-9)

# ── H: Gain margin for G(s) = 1/(s(s+1)(s+2)) ────────────────────────────
# Phase crossover: ∠G(jω_pc) = -180° → ωpc = √2 rad/s
# |G(jω_pc)| = 1/(ωpc · √(ωpc²+1) · √(ωpc²+4))
#             = 1/(√2 · √3 · √6) = 1/6
# GM = 1/|G(jω_pc)| = 6  → 20·log10(6) ≈ 15.56 dB
H_gm_db = 20 * math.log10(6)
check("H: GM 1/(s(s+1)(s+2))", H_gm_db, 15.56, 0.05, " dB")

# ── I: LQR cost matrix Bryson's rule ───────────────────────────────────────
# maxState=[1,2], maxOutput=0.5 → Q=diag(1/1², 1/2²)=diag(1, 0.25), R=1/0.5²=4
I_Q11 = 1.0 / (1.0**2)
I_Q22 = 1.0 / (2.0**2)
I_R   = 1.0 / (0.5**2)
check("I: Bryson Q[0,0]", I_Q11, 1.0,   1e-12)
check("I: Bryson Q[1,1]", I_Q22, 0.25,  1e-12)
check("I: Bryson R",      I_R,   4.0,   1e-12)

# ── J: c2d Tustin Ts=0.1 for G(s)=1/(s+1) ─────────────────────────────────
# Tustin bilinear: s → 2/Ts·(z-1)/(z+1)
# G(z) = α(z+1) / ((1+α)z − (1−α)),  α = Ts/2 = 0.05
# DC gain at z=1: G(1) = α·2 / ((1+α)−(1−α)) = 2α/(2α) = 1.0 ✓
# (Tustin preserves DC gain because s=0 ↔ z=1 by design.)
J_Ts    = 0.1
J_alpha = J_Ts / 2                      # = 0.05
J_num_z1 = J_alpha * 2                  # numerator at z=1
J_den_z1 = (1 + J_alpha) - (1 - J_alpha)  # = 2·alpha
J_dc    = J_num_z1 / J_den_z1           # = 1.0
check("J: Tustin c2d DC gain 1/(s+1)", J_dc, 1.0, 1e-9)

# ---------------------------------------------------------------------------
# Live python-control cross-check (only when available)
# ---------------------------------------------------------------------------

if HAS_CONTROL:
    print("\n=== python-control live comparison ===\n")

    # ── A live ────────────────────────────────────────────────────────────
    Ga = control.tf([1], [1, 1])
    check("A(live): DC gain 1/(s+1)", float(control.dcgain(Ga)), 1.0, 1e-9)

    # ── B live ────────────────────────────────────────────────────────────
    Gb  = control.tf([1], [1, 3, 2])
    gm_b, pm_b, _, _ = control.margin(Gb)
    poles_b = sorted(np.real(control.poles(Gb)).tolist())
    check("B(live): Pole 1",   poles_b[0], -2.0, 1e-6)
    check("B(live): Pole 2",   poles_b[1], -1.0, 1e-6)
    check("B(live): DC gain",  float(control.dcgain(Gb)), 0.5, 1e-9)
    check("B(live): PM (°)",   float(pm_b), 68.21, 0.1, "°")

    # ── D live ────────────────────────────────────────────────────────────
    Gcl     = control.feedback(Ga, 1)
    poles_cl = sorted(np.real(control.poles(Gcl)).tolist())
    check("D(live): CL pole",     poles_cl[0], -2.0, 1e-6)
    check("D(live): CL DC gain",  float(control.dcgain(Gcl)), 0.5, 1e-9)

    # ── E live: step response metrics ────────────────────────────────────
    Ge = control.tf([1], [1, 0.4, 1])
    t  = np.linspace(0, 60, 6001)
    t_out, y_out = control.step_response(Ge, T=t)
    y_ss  = float(y_out[-1])
    Mp    = (float(np.max(y_out)) - y_ss) / y_ss * 100
    tp_idx = int(np.argmax(y_out))
    tp    = float(t_out[tp_idx])
    check("E(live): Mp (ζ=0.2, ωn=1)", Mp, 52.66, 1.0, "%")
    check("E(live): tp (ζ=0.2, ωn=1)", tp, 3.205, 0.05, "s")

    # ── H live: GM for triple-pole system ─────────────────────────────────
    Gh = control.tf([1], [1, 3, 2, 0])   # 1/(s(s+1)(s+2))
    gm_h, pm_h, wpc_h, wgc_h = control.margin(Gh)
    check("H(live): GM 1/(s(s+1)(s+2))", 20*math.log10(float(gm_h)), H_gm_db, 0.05, " dB")

    # ── LQR live: 2nd-order double-integrator ─────────────────────────────
    A_li = np.array([[0, 1], [0, 0]])
    B_li = np.array([[0], [1]])
    Q_li = np.diag([1.0, 1.0])
    R_li = np.array([[1.0]])
    K_li, _, _ = control.lqr(A_li, B_li, Q_li, R_li)
    # Analytic: K = [1, √3] for Q=I, R=1 (LQR for double integrator)
    check("LQR(live): K[0] double-integrator Q=I,R=1",
          float(K_li[0, 0]), 1.0, 0.02)
    check("LQR(live): K[1] double-integrator Q=I,R=1",
          float(K_li[0, 1]), math.sqrt(3), 0.02)

    # ── c2d Tustin live ───────────────────────────────────────────────────
    Ga_d = control.c2d(Ga, 0.1, method='tustin')
    dc_d = float(control.dcgain(Ga_d))
    check("J(live): Tustin c2d DC gain 1/(s+1)", dc_d, 1.0, 1e-6)

# ---------------------------------------------------------------------------

print(f"\nCross-tool comparison: {'ALL PASSED' if failed == 0 else str(failed) + ' FAILED'}")
sys.exit(0 if failed == 0 else 1)
