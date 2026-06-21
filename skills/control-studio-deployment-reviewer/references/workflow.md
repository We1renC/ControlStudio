# Deployment Review Workflow

## Inputs

- Deployment target: `c`, `rust`, `plc`, `autosar`, `freertos`, or `hil`
- Sample time in seconds
- Controller summary: type, gains or state-space matrices, discretization assumptions
- Plant summary: state count, input count, output count, nominal operating range
- Codegen package: file names, metadata, warnings, artifact id, revision, source commit
- Timing evidence: WCET, deadline, jitter, measurement source
- Numeric evidence: floating-point or fixed-point configuration and signal ranges
- Safety evidence: CRC, watchdog, redundancy, fault response
- HIL evidence: protocol, channel counts, frame schema, latency, round-trip result

## Review Steps

1. Validate sample time and target compatibility.
2. Check target-specific artifact completeness.
3. Review codegen warnings and traceability fields.
4. Compare WCET against scheduler deadline and jitter against sample time.
5. Check fixed-point headroom when fixed-point output is requested.
6. Enforce CRC, watchdog, and redundancy evidence when `safety.critical=true`.
7. Validate HIL protocol, channel count, sample-time match, latency, and frame schema.
8. Run `assessDeploymentReadiness()` or reproduce the same evidence ids.
9. Return deployment class and required actions.

## Output Contract

Return:

- status: `pass`, `warn`, or `fail`
- deploymentClass: `ready`, `conditional`, or `blocked`
- score: numeric readiness score
- checks: list of evidence-backed check results
- requiredActions: concrete actions keyed to failed or warning checks
- summary: short deployment decision

## Recommended Module Mapping

- Readiness gate: `control-studio/js/control/productization.js`
- Deterministic fixture: `control-studio/scripts/verify_p76_deployment_readiness.mjs`
- Embedded C generator: `control-studio/js/codegen/c_generator.js`
- Rust generator: `control-studio/js/codegen/rust_generator.js`
- Safety wrapper: `control-studio/js/codegen/safety_wrapper.js`
- HIL frame contract: `control-studio/js/integration/hil_ws.js`
