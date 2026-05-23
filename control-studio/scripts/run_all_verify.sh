#!/usr/bin/env bash
# run_all_verify.sh — Execute every verify_*.mjs and compare_python_control.py
# Usage: bash scripts/run_all_verify.sh [--python]
# Exit code: 0 = all passed, 1 = any failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0
SKIP=0
ERRORS=()

# Use node for cross-platform millisecond timing
ms() { node -e "process.stdout.write(String(Date.now()))"; }

# ── Colour helpers ──────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Run a single script and record result ───────────────────────────────────
run_script() {
  local label="$1"
  shift
  local start end elapsed
  start=$(ms)
  if output=$(cd "${ROOT}" && eval "$*" 2>&1); then
    end=$(ms)
    elapsed=$(( end - start ))
    echo -e "  ${GREEN}✓${RESET} ${label}  ${CYAN}(${elapsed}ms)${RESET}"
    PASS=$(( PASS + 1 ))
  else
    end=$(ms)
    elapsed=$(( end - start ))
    echo -e "  ${RED}✗${RESET} ${label}  ${CYAN}(${elapsed}ms)${RESET}"
    echo "${output}" | grep -m 20 'FAIL\|Error\|error' | sed 's/^/      /' || true
    FAIL=$(( FAIL + 1 ))
    ERRORS+=("${label}")
  fi
}

# ── Header ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Control Studio — Full Verification Suite${RESET}"
echo -e "${BOLD}  $(date '+%Y-%m-%d %H:%M:%S')${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo ""

TOTAL_START=$(ms)

# ── Phase 9/10/11 — Math & Control Foundations ──────────────────────────────
echo -e "${BOLD}▶ Phase 9/10/11 — Math & Control Foundations${RESET}"
run_script "Phase 9  math core"             "node scripts/verify_phase9_math_core.mjs"
run_script "Phase 9/10 edge cases"          "node scripts/verify_phase9_phase10_edge_cases.mjs"
run_script "Phase 10 CARE robustness"       "node scripts/verify_phase10_care_robustness.mjs"
run_script "Phase 10 cross-method"          "node scripts/verify_phase10_cross_method.mjs"
run_script "Phase 10 high-order CARE"       "node scripts/verify_phase10_high_order_care.mjs"
run_script "Phase 10 math core"             "node scripts/verify_phase10_math_core.mjs"
run_script "Phase 10 MPC constraints"       "node scripts/verify_phase10_mpc_constraints.mjs"
run_script "Phase 11 DARE"                  "node scripts/verify_phase11_dare.mjs"
run_script "Phase 11 dynamic RGA"           "node scripts/verify_phase11_dynamic_rga.mjs"
run_script "Phase 11 H∞ norm"              "node scripts/verify_phase11_hinf.mjs"
run_script "Phase 11 setpoint/constraints"  "node scripts/verify_phase11_setpoint_and_state_constraints.mjs"
echo ""

# ── Phase 14–21 — Advanced Control ──────────────────────────────────────────
echo -e "${BOLD}▶ Phase 14–21 — Advanced Control${RESET}"
run_script "Phase 14 delay/Smith"           "node scripts/verify_p14_delay.mjs"
run_script "Phase 14 IMC/SIMC"             "node scripts/verify_p14_imc.mjs"
run_script "Phase 14 RNG"                  "node scripts/verify_p14_rng.mjs"
run_script "Phase 15 ARX SysID"            "node scripts/verify_p15_sysid.mjs"
run_script "Phase 16 GA tuner"             "node scripts/verify_p16_ga.mjs"
run_script "Phase 16 H∞ synth"            "node scripts/verify_p16_hinf.mjs"
run_script "Phase 17 advanced control"     "node scripts/verify_p17_advanced_control.mjs"
run_script "Phase 17 ARMAX + NSGA-II"     "node scripts/verify_p17_armax_nsga.mjs"
run_script "Phase 17 EKF/UKF"             "node scripts/verify_p17_ekf_ukf.mjs"
run_script "Phase 18 robust validation"    "node scripts/verify_p18_robust_validation.mjs"
run_script "Phase 19 H∞ Riccati"          "node scripts/verify_p19_hinf_riccati.mjs"
run_script "Phase 20 MPC engineering"      "node scripts/verify_p20_mpc_engineering.mjs"
run_script "Phase 21 SysID advanced"       "node scripts/verify_p21_sysid_advanced.mjs"
run_script "P23 freq sysid (FRF)"         "node scripts/verify_p23_freq_sysid.mjs"
run_script "P23 model order selection"    "node scripts/verify_p23_model_order.mjs"
run_script "P23 MISO ARX"                 "node scripts/verify_p23_miso.mjs"
run_script "P24 NMPC"                     "node scripts/verify_p24_nmpc.mjs"
run_script "P24 EMPC"                     "node scripts/verify_p24_empc.mjs"
run_script "P24 Tube/Explicit MPC"        "node scripts/verify_p24_tube_explicit_mpc.mjs"
run_script "P25 model reduction"          "node scripts/verify_p25_model_reduction.mjs"
run_script "P25-02 Hankel norm approx"   "node scripts/verify_p25_hankel.mjs"
run_script "P26 nonlinear control"        "node scripts/verify_p26_nonlinear.mjs"
run_script "P27 MIMO H∞"                  "node scripts/verify_p27_mimo_hinf.mjs"
run_script "P27 Loop Shaping H∞"          "node scripts/verify_p27_loop_shaping.mjs"
run_script "P29 QP solver"                "node scripts/verify_p29_qp.mjs"
run_script "P29 LP solver"                "node scripts/verify_p29_lp.mjs"
run_script "P29 SDP/LMI solver"           "node scripts/verify_p29_sdp.mjs"
run_script "P29 LPV synthesis"            "node scripts/verify_p29_lpv.mjs"
run_script "P29 D-K iteration (μ-synth)" "node scripts/verify_p29_dk.mjs"
run_script "P30 adaptive control"        "node scripts/verify_p30_adaptive.mjs"
run_script "P31 estimation & FDD/FTC"   "node scripts/verify_p31_estimation.mjs"
run_script "P32 nonlinear advanced"     "node scripts/verify_p32_nonlinear_advanced.mjs"
run_script "P33 productization"         "node scripts/verify_p33_productization.mjs"
run_script "P34 UI/UX experience"       "node scripts/verify_p34_ui.mjs"
run_script "P35 UI/UX P1 foundation"    "node scripts/verify_p35_uiux_foundation.mjs"
run_script "P36 UI/UX P1 remaining"    "node scripts/verify_p36_uiux_p1_remaining.mjs"
run_script "P37 UI/UX P2"              "node scripts/verify_p37_uiux_p2.mjs"
run_script "P38 UI/UX P2 batch1"      "node scripts/verify_p38_uiux_p2_batch1.mjs"
run_script "P39 UI/UX P2 batch2"      "node scripts/verify_p39_uiux_p2_batch2.mjs"
echo ""

# ── General Math & PID ───────────────────────────────────────────────────────
echo -e "${BOLD}▶ General Math & PID${RESET}"
run_script "Math core"                     "node scripts/verify_math_core.mjs"
run_script "TF/SS/ZPK/C2D"                "node scripts/verify_tf_ss_zpk_c2d.mjs"
run_script "Stress test (complex systems)" "node scripts/verify_stress_complex.mjs"
run_script "PID design"                    "node scripts/verify_pid_design.mjs"
echo ""

# ── Python cross-tool (optional) ─────────────────────────────────────────────
if [[ "${1:-}" == "--python" ]]; then
  echo -e "${BOLD}▶ Python cross-tool comparison${RESET}"
  if command -v python3 &>/dev/null; then
    run_script "compare_python_control.py" "python3 scripts/compare_python_control.py"
  else
    echo -e "  ${YELLOW}⚠${RESET}  python3 not found — skipping"
    SKIP=$(( SKIP + 1 ))
  fi
  echo ""
fi

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL_END=$(ms)
TOTAL_MS=$(( TOTAL_END - TOTAL_START ))
TOTAL=$(( PASS + FAIL ))

echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Results: ${GREEN}${PASS} passed${RESET}${BOLD}, ${RED}${FAIL} failed${RESET}${BOLD} out of ${TOTAL} scripts${RESET}"
if [[ ${SKIP} -gt 0 ]]; then
  echo -e "  Skipped: ${YELLOW}${SKIP}${RESET}"
fi
echo -e "${BOLD}  Total time: ${TOTAL_MS}ms${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"

if [[ ${FAIL} -gt 0 ]]; then
  echo ""
  echo -e "${RED}${BOLD}Failed scripts:${RESET}"
  for e in "${ERRORS[@]}"; do
    echo -e "  ${RED}• ${e}${RESET}"
  done
  echo ""
  exit 1
else
  echo ""
  echo -e "${GREEN}${BOLD}All verification scripts passed. ✓${RESET}"
  echo ""
  exit 0
fi
