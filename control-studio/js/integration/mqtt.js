/**
 * mqtt.js - Tier J5: MQTT topic routing facade.
 */

export function mqttConnect({ broker = 'wss://localhost:8083', clientId = 'controlstudio', transport = null } = {}) {
  const subs = new Map();
  return {
    broker,
    clientId,
    subscribe(topic, cb) { subs.set(topic, cb); },
    publish(topic, payload) {
      const message = { topic, payload };
      if (transport?.publish) transport.publish(message);
      for (const [sub, cb] of subs) {
        const prefix = sub.replace('/+', '');
        if (topic === sub || topic.startsWith(prefix)) cb(payload, topic);
      }
      return message;
    },
  };
}

export default { mqttConnect };
