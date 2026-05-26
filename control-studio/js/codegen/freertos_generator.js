/**
 * freertos_generator.js - Tier H5: FreeRTOS controller task template.
 */

export function generateFreeRTOS({ period_ms = 1, priority = 2, taskName = 'ControlTask' } = {}) {
  return `#include "FreeRTOS.h"
#include "task.h"
#include "controller.h"

static void ${taskName}(void* ctx) {
  CS_PID pid;
  cs_pid_init(&pid);
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    (void)cs_pid_step(&pid, 0.0, 0.0);
    vTaskDelayUntil(&last, pdMS_TO_TICKS(${period_ms}));
  }
}

void controlstudio_start_task(void) {
  xTaskCreate(${taskName}, "${taskName}", 512, 0, ${priority}, 0);
}
`;
}

export default { generateFreeRTOS };
