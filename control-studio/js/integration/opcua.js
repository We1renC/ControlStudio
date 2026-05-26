/**
 * opcua.js - Tier J3: OPC UA gateway request helpers.
 */

export function connectOPCUA({ endpoint, nodeIds = [], gateway = null } = {}) {
  return {
    endpoint,
    nodeIds,
    readValue(nodeId) {
      const request = { op: 'read', endpoint, nodeId };
      return gateway?.request ? gateway.request(request) : request;
    },
    writeValue(nodeId, value) {
      const request = { op: 'write', endpoint, nodeId, value };
      return gateway?.request ? gateway.request(request) : request;
    },
  };
}

export default { connectOPCUA };
