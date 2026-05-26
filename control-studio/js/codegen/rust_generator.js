/**
 * rust_generator.js - Tier H2: Rust embedded template generation.
 */

export function generateRust({ controller = {}, noStd = true } = {}) {
  const kp = Number(controller.kp ?? controller.Kp ?? 0);
  const ki = Number(controller.ki ?? controller.Ki ?? 0);
  const kd = Number(controller.kd ?? controller.Kd ?? 0);
  const controllerRs = `${noStd ? '#![no_std]\n\n' : ''}pub struct Pid {
    kp: f64,
    ki: f64,
    kd: f64,
    integral: f64,
    prev_error: f64,
}

impl Pid {
    pub const fn new() -> Self {
        Self { kp: ${kp}, ki: ${ki}, kd: ${kd}, integral: 0.0, prev_error: 0.0 }
    }

    pub fn step(&mut self, reference: f64, measurement: f64, dt: f64) -> f64 {
        let error = reference - measurement;
        self.integral += error * dt;
        let derivative = (error - self.prev_error) / dt;
        self.prev_error = error;
        self.kp * error + self.ki * self.integral + self.kd * derivative
    }
}
`;
  return {
    'Cargo.toml': `[package]\nname = "controlstudio_controller"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
    'src/controller.rs': controllerRs,
    'src/main.rs': `${noStd ? '#![no_std]\n#![no_main]\n' : ''}mod controller;\n`,
  };
}

export default { generateRust };
