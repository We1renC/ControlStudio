/**
 * editor.js — Main Controller for Visual Block Diagram Editor
 * Supports topology analysis, node editing, deletion, undo/redo, and diagram save/load.
 */
import { EditorCanvas } from './canvas.js';
import { EditorNode } from './node.js';
import { EditorLink } from './link.js';

export class BlockEditor {
  constructor() {
    this.canvas = new EditorCanvas('canvas-container', 'editor-canvas');
    this.nodeCount = 0;
    this.linkCount = 0;

    this.isLinking = false;
    this.linkStartNode = null;

    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];

    this.init();
  }

  init() {
    // Toolbar buttons
    document.querySelectorAll('.node-tool').forEach(btn => {
      btn.addEventListener('click', () => this.addNewNode(btn.dataset.type));
    });

    document.getElementById('btn-editor-clear')?.addEventListener('click', () => {
      this.pushUndo('clear');
      this.canvas.clear();
      this.nodeCount = 0;
      this.linkCount = 0;
    });

    document.getElementById('btn-editor-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-editor-redo')?.addEventListener('click', () => this.redo());

    // Port interaction for linking
    this.canvas.svg.addEventListener('mousedown', this.handlePortClick.bind(this));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const editorVisible = document.getElementById('editor-workspace')?.style.display !== 'none';
      if (!editorVisible) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }
    });
  }

  // ========================================
  // Node Operations
  // ========================================
  addNewNode(type) {
    const id = `node_${++this.nodeCount}`;
    const x = 60 + (this.nodeCount % 6) * 130;
    const y = 80 + Math.floor(this.nodeCount / 6) * 100;

    let label = type.toUpperCase();
    if (type === 'tf') label = '1 / (s + 1)';
    if (type === 'gain') label = 'K=1';

    const node = new EditorNode(id, type, x, y, { label });
    this.pushUndo('addNode', { id, type, x, y, label });
    this.canvas.addNode(node);
  }

  deleteSelected() {
    const selectedNode = this.canvas.nodes.find(n => n.selected);
    if (!selectedNode) return;

    const relatedLinks = this.canvas.links.filter(
      l => l.from.id === selectedNode.id || l.to.id === selectedNode.id
    );

    this.pushUndo('deleteNode', {
      node: { id: selectedNode.id, type: selectedNode.type, x: selectedNode.x, y: selectedNode.y, label: selectedNode.label },
      links: relatedLinks.map(l => ({ id: l.id, fromId: l.from.id, toId: l.to.id })),
    });

    this.canvas.removeNode(selectedNode.id);
  }

  // ========================================
  // Port Click → Linking
  // ========================================
  handlePortClick(e) {
    const port = e.target.closest('.port');
    if (!port) return;

    e.stopPropagation();
    const nodeEl = port.closest('.canvas-node');
    const nodeId = nodeEl.dataset.id;
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    const portType = port.dataset.type;

    if (!this.isLinking && portType === 'output') {
      this.isLinking = true;
      this.linkStartNode = node;
      port.classList.add('active');
    } else if (this.isLinking && portType === 'input' && node !== this.linkStartNode) {
      // Create link
      const linkId = `link_${++this.linkCount}`;
      const link = new EditorLink(linkId, this.linkStartNode, node);
      this.pushUndo('addLink', { id: linkId, fromId: this.linkStartNode.id, toId: node.id });
      this.canvas.addLink(link);

      this.isLinking = false;
      this.linkStartNode = null;
      document.querySelectorAll('.port.active').forEach(p => p.classList.remove('active'));
    } else {
      // Cancel link
      this.isLinking = false;
      this.linkStartNode = null;
      document.querySelectorAll('.port.active').forEach(p => p.classList.remove('active'));
    }
  }

  // ========================================
  // Undo / Redo
  // ========================================
  pushUndo(action, data = null) {
    this.undoStack.push({ action, data, snapshot: this.serialize() });
    this.redoStack = [];
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const entry = this.undoStack.pop();
    this.redoStack.push({ action: 'redo', data: null, snapshot: this.serialize() });
    this.deserialize(entry.snapshot);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const entry = this.redoStack.pop();
    this.undoStack.push({ action: 'undo', data: null, snapshot: this.serialize() });
    this.deserialize(entry.snapshot);
  }

  // ========================================
  // Serialize / Deserialize (Diagram Save/Load)
  // ========================================
  serialize() {
    return {
      nodeCount: this.nodeCount,
      linkCount: this.linkCount,
      nodes: this.canvas.nodes.map(n => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        label: n.label,
        width: n.width,
        height: n.height,
      })),
      links: this.canvas.links.map(l => ({
        id: l.id,
        fromId: l.from.id,
        toId: l.to.id,
      })),
    };
  }

  deserialize(data) {
    if (!data) return;
    this.canvas.clear();
    this.nodeCount = data.nodeCount || 0;
    this.linkCount = data.linkCount || 0;

    for (const nd of (data.nodes || [])) {
      const node = new EditorNode(nd.id, nd.type, nd.x, nd.y, { label: nd.label, width: nd.width, height: nd.height });
      this.canvas.addNode(node);
    }
    for (const ld of (data.links || [])) {
      const from = this.canvas.nodes.find(n => n.id === ld.fromId);
      const to = this.canvas.nodes.find(n => n.id === ld.toId);
      if (from && to) {
        const link = new EditorLink(ld.id, from, to);
        this.canvas.addLink(link);
      }
    }
  }

  // ========================================
  // Topology Analysis — getSystemModel()
  // ========================================

  /**
   * Analyze the block diagram topology and produce a combined transfer function string.
   *
   * Supports:
   * - Series chain: source → TF → TF → ... → scope (multiply all TFs)
   * - Feedback loop: if a sum block exists and there is a path back to it,
   *   compute G/(1+G*H) where H is the feedback path TF (default 1).
   *
   * Returns "num / den" string or null if no valid topology found.
   */
  getSystemModel() {
    const nodes = this.canvas.nodes;
    const links = this.canvas.links;

    if (nodes.length === 0) return null;

    // Build adjacency
    const adj = new Map();      // nodeId → [nodeId, ...]
    const revAdj = new Map();   // nodeId → [nodeId, ...]
    for (const n of nodes) {
      adj.set(n.id, []);
      revAdj.set(n.id, []);
    }
    for (const l of links) {
      adj.get(l.from.id).push(l.to.id);
      revAdj.get(l.to.id).push(l.from.id);
    }

    // Find source nodes (no inputs or type === 'source')
    const sources = nodes.filter(n => n.type === 'source' || revAdj.get(n.id).length === 0);
    // Find sink nodes (no outputs or type === 'scope')
    const sinks = nodes.filter(n => n.type === 'scope' || adj.get(n.id).length === 0);

    if (sources.length === 0 || sinks.length === 0) {
      // Fallback: first TF node
      const tfNode = nodes.find(n => n.type === 'tf');
      return tfNode ? tfNode.label : null;
    }

    // Find forward path from a source to a sink using BFS
    const source = sources[0];
    const sink = sinks[sinks.length - 1];
    const path = this._findPath(source.id, sink.id, adj);

    if (!path || path.length === 0) {
      const tfNode = nodes.find(n => n.type === 'tf');
      return tfNode ? tfNode.label : null;
    }

    // Collect TF strings along forward path
    const forwardTFs = [];
    let sumNodeId = null;

    for (const nid of path) {
      const node = nodes.find(n => n.id === nid);
      if (!node) continue;
      if (node.type === 'tf') {
        forwardTFs.push(node.label);
      } else if (node.type === 'gain') {
        forwardTFs.push(node.label);
      } else if (node.type === 'sum') {
        sumNodeId = nid;
      }
    }

    if (forwardTFs.length === 0) return null;

    // Build forward path expression
    const forwardExpr = forwardTFs.join(' * ');

    // Check for feedback: a link from a post-sum node back to the sum node
    if (sumNodeId) {
      // Find feedback path: any node after the sum that has a link back to the sum
      const sumIdx = path.indexOf(sumNodeId);
      const postSumNodes = path.slice(sumIdx + 1);

      for (const nid of postSumNodes) {
        const outgoing = adj.get(nid) || [];
        if (outgoing.includes(sumNodeId)) {
          // Found feedback! Determine feedback TF
          // Check if the feedback link goes through any TF/gain blocks
          // For MVP: assume unity feedback
          return `(${forwardExpr}) / (1 + ${forwardExpr})`;
        }
      }

      // Check if any non-path node connects back to sum (feedback element)
      const pathSet = new Set(path);
      for (const n of nodes) {
        if (pathSet.has(n.id)) continue;
        const nOut = adj.get(n.id) || [];
        if (nOut.includes(sumNodeId)) {
          // This node feeds back to sum. Check if it receives from a post-sum path node
          const nIn = revAdj.get(n.id) || [];
          const feedbackSource = nIn.some(id => postSumNodes.includes(id));
          if (feedbackSource) {
            const fbExpr = n.type === 'tf' ? n.label : n.type === 'gain' ? n.label : '1';
            return `(${forwardExpr}) / (1 + (${forwardExpr}) * (${fbExpr}))`;
          }
        }
      }
    }

    // No feedback detected — pure series
    if (forwardTFs.length === 1) {
      return forwardTFs[0];
    }
    return forwardExpr;
  }

  /**
   * BFS path finding from startId to endId.
   */
  _findPath(startId, endId, adj) {
    const visited = new Set();
    const queue = [[startId]];
    visited.add(startId);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === endId) return path;

      for (const next of (adj.get(current) || [])) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    return null;
  }
}
