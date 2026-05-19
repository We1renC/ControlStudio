# Benchmark: Second-Order Underdamped Step Response

Purpose: verify time-response metrics against analytic second-order behavior.

Model:

`G(s) = 1 / (s^2 + 2ζω_n s + ω_n^2)`

Expected:
- Poles: `-ζω_n ± jω_n sqrt(1 - ζ^2)`
- Percent overshoot: `100 exp(-ζπ / sqrt(1 - ζ^2))`
- Settling time approximation: `4 / (ζω_n)`

Fixture:
- Use deterministic sample count.
- Compare overshoot with engineering tolerance.
- Compare poles with numeric tolerance.
