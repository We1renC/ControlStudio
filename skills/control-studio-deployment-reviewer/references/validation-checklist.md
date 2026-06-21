# Deployment Validation Checklist

## Artifact Checks

- Target-specific files exist and are non-empty.
- Codegen warnings are captured and classified.
- Artifact id and revision are recorded.
- Source commit is recorded when the package is built from a repository state.
- The generated code target matches the controller and plant domain.

## Timing Checks

- Sample time is finite and positive.
- WCET is finite and below deadline.
- Deadline is compatible with the configured sample time.
- Jitter is finite and small relative to the sample time.
- Measurement source is stated when the result is intended for release.

## Numeric Checks

- Floating-point or fixed-point mode is explicit.
- Fixed-point word length and fraction bits are recorded.
- Maximum expected signal magnitude has enough representable headroom.
- Saturation or overflow behavior is stated.

## Safety Checks

- Safety-critical deployments include CRC evidence.
- Watchdog behavior is enabled or explicitly justified.
- Redundancy count is sufficient for the declared safety assumption.
- Fail-safe behavior is not inferred from nominal simulation.

## HIL Checks

- Protocol is named.
- State and control channel counts match the plant/controller interface.
- HIL sample time matches controller sample time.
- Latency is below the allowed budget.
- Frame schema includes type, time, state, and input.
- Round-trip parsing has been demonstrated.

## Rejection Rules

- Missing sample time blocks deployment.
- Missing required target artifact blocks deployment.
- WCET above deadline blocks deployment.
- Fixed-point overflow risk blocks deployment.
- Missing safety wrapper blocks safety-critical deployment.
- HIL channel, sample-time, or frame-schema mismatch blocks HIL release.
