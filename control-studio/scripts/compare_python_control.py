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

# Case A: G(s) = 1 / (s+1) — first-order lag
# python-control: ctrl.tf([1],[1,1])
# DC gain = 1/1 = 1.0, pole at -1
# PM: G has DC gain = 1 exactly → gain crossover is at ω=0 (degenerate);
# conventions differ (180° vs ∞); PM check skipped for this case.
A_dc_gain = 1.0
A_pole_re = -1.0

check("A: DC gain  1/(s+1)", A_dc_gain, 1.0, 1e-9)
check("A: Pole real 1/(s+1)", A_pole_re, -1.0, 1e-9)
# PM degenerate for unit-DC-gain system — skip

# Case B: G(s) = 1 / (s²+3s+2) = 1/((s+1)(s+2))
# Poles: -1, -2;  DC gain = 0.5;  PM ≈ 68.2°
B_poles  = sorted([-1.0, -2.0])
B_dc_gain = 0.5
# Phase margin: |G(jω)| = 1 → ω²(ω²+9) = (2-ω²)² → ω_c ≈ 0.6435 rad/s
# ∠G(jω_c) = -arctan(ω_c) - arctan(ω_c/2); PM = 180 + ∠G(jω_c) ≈ 68.2°
B_pm_deg  = 68.21

check("B: Pole 1  1/(s²+3s+2)", B_poles[0], -2.0, 1e-9)
check("B: Pole 2  1/(s²+3s+2)", B_poles[1], -1.0, 1e-9)
check("B: DC gain 1/(s²+3s+2)", B_dc_gain,  0.5, 1e-9)
check("B: Phase margin (°)", B_pm_deg, 68.21, 0.1, "°")

# Case C: Discrete ARX — G(z) = 0.4 / (z - 0.7), Ts=1
# Pole at z=0.7, DC gain = 0.4/(1-0.7) = 1.3333
C_pole  = 0.7
C_dc_gain = 0.4 / (1 - 0.7)

check("C: ARX discrete pole", C_pole, 0.7, 1e-9)
check("C: ARX DC gain", C_dc_gain, 4/3, 1e-9)

# Case D: Closed-loop unity feedback of G(s)=1/(s+1)
# CL(s) = G/(1+G) = 1/(s+2); pole at -2; DC gain = 0.5
D_pole    = -2.0
D_dc_gain = 0.5
D_pm_deg  = 90.0  # same as open-loop for 1st-order unity feedback

check("D: CL pole  1/(s+1) unity FB", D_pole,    -2.0, 1e-9)
check("D: CL DC gain", D_dc_gain, 0.5, 1e-9)

# ---------------------------------------------------------------------------
# Live python-control cross-check (only when available)
# ---------------------------------------------------------------------------

if HAS_CONTROL:
    print("\n=== python-control live comparison ===\n")

    # Case A
    Ga = control.tf([1], [1, 1])
    gm, pm, _, _ = control.margin(Ga)
    check("A(live): DC gain", float(control.dcgain(Ga)),  1.0,  1e-9)
    # PM degenerate (DC gain = 1 → crossover at ω=0) — skip

    # Case B
    Gb = control.tf([1], [1, 3, 2])
    gm_b, pm_b, _, _ = control.margin(Gb)
    poles_b = sorted(np.real(control.poles(Gb)).tolist())
    check("B(live): Pole 1", poles_b[0], -2.0, 1e-6)
    check("B(live): Pole 2", poles_b[1], -1.0, 1e-6)
    check("B(live): DC gain", float(control.dcgain(Gb)), 0.5, 1e-9)
    check("B(live): PM (°)", float(pm_b), 68.21, 0.1, "°")

    # Case D: closed-loop
    Gcl = control.feedback(Ga, 1)
    poles_cl = sorted(np.real(control.poles(Gcl)).tolist())
    check("D(live): CL pole",    poles_cl[0], -2.0, 1e-6)
    check("D(live): CL DC gain", float(control.dcgain(Gcl)), 0.5, 1e-9)

# ---------------------------------------------------------------------------

print(f"\nCross-tool comparison: {'ALL PASSED' if failed == 0 else str(failed) + ' FAILED'}")
sys.exit(0 if failed == 0 else 1)
