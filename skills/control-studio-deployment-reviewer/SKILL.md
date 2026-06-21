---
name: control-studio-deployment-reviewer
description: Review ControlStudio controller codegen and HIL handoff for deployment readiness. Use when checking generated C, Rust, PLC, AUTOSAR, FreeRTOS, or HIL artifacts against sample time, traceability, timing, fixed-point, safety wrapper, and protocol evidence before implementation or release.
---

# ControlStudio Deployment Reviewer

Use this skill when an agent needs to decide whether a ControlStudio controller package is ready, conditional, or blocked for engineering deployment.

## Workflow

1. Identify the deployment target.
   - Record target: `c`, `rust`, `plc`, `autosar`, `freertos`, or `hil`.
   - Record sample time, controller type, plant dimensions, generated artifact list, and whether the deployment is safety critical.

2. Collect required evidence.
   - Codegen artifacts: target-specific source/config files plus codegen warnings.
   - Traceability: artifact id, revision, and source commit when available.
   - Timing: WCET, deadline, and measured or assumed sampling jitter.
   - Numeric implementation: floating-point or fixed-point word length, fraction bits, and maximum signal range.
   - Safety: CRC, watchdog, redundancy, and fail-safe assumptions for safety-critical deployments.
   - HIL: protocol, state/control channel count, sample-time match, latency, frame schema, and round-trip evidence.

3. Run or mirror the readiness gate.
   - Prefer `assessDeploymentReadiness()` from `control-studio/js/control/productization.js`.
   - Use `control-studio/scripts/verify_p76_deployment_readiness.mjs` as the deterministic baseline for expected pass/warn/fail semantics.

4. Classify the deployment.
   - `ready`: all required checks pass.
   - `conditional`: warnings remain, but no blocking failure exists.
   - `blocked`: missing sample time, target artifacts, unsafe timing, fixed-point overflow, missing safety wrapper, or invalid HIL evidence.

5. Produce required actions.
   - Every fail or warning must map to a concrete action and evidence id.
   - Do not replace missing engineering evidence with natural-language assurance.

6. If implementation changes are required, update tests and docs.
   - Add or extend deterministic checks in `verify_p76_deployment_readiness.mjs` or the closest productization verifier.
   - Sync `control-studio/ROADMAP.md`, `docs/src/control-studio/backlog.md`, `docs/src/control-studio/plan.md`, `docs/src/control-studio/skills.md`, and `docs/src/agents/continuation.md`.

## References

- Read `references/workflow.md` for the deployment review flow.
- Read `references/validation-checklist.md` before accepting a package as deployable.
- Use `examples/sample-input.json` and `examples/sample-output.md` for the expected request and result shape.

## Required Verification

For implementation changes:

```bash
node control-studio/scripts/verify_p76_deployment_readiness.mjs
npm run verify:all
node test_control.js
```

For documentation-only skill updates:

```bash
python3 /Users/w.rc/.config/agents/skills/.system/skill-creator/scripts/quick_validate.py skills/control-studio-deployment-reviewer
node control-studio/scripts/verify_p77_deployment_skill.mjs
git diff --check
```

## Boundaries

- Do not claim deployment readiness from generated code alone; timing, numeric range, safety, and HIL evidence must be checked.
- Do not treat HIL connectivity as equivalent to real-time suitability; latency, channel count, and sample-time matching are separate gates.
- Do not restart Teaching Mode, Electron packaging, Report Template, or Block Diagram expansion.
