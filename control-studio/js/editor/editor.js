/**
 * editor.js — Main Controller for Visual Block Diagram Editor
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

    this.init();
  }

  init() {
    // Toolbar buttons
    document.querySelectorAll('.node-tool').forEach(btn => {
      btn.addEventListener('click', () => this.addNewNode(btn.dataset.type));
    });

    document.getElementById('btn-editor-clear')?.addEventListener('click', () => this.canvas.clear());

    // Port interaction for linking
    this.canvas.svg.addEventListener('mousedown', this.handlePortClick.bind(this));
  }

  addNewNode(type) {
    const id = `node_${++this.nodeCount}`;
    const x = 50 + (this.nodeCount % 5) * 40;
    const y = 50 + (this.nodeCount % 5) * 40;

    let label = type.toUpperCase();
    if (type === 'tf') label = '1 / (s + 1)';

    const node = new EditorNode(id, type, x, y, { label });
    this.canvas.addNode(node);
  }

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

  /**
   * Generates a combined TransferFunction from the diagram.
   * Currently supports a simple series chain + single unity feedback.
   */
  getSystemModel() {
    // TODO: Implement Mason's Gain Formula or node-based reduction
    // For MVP: Find the first TF block and use it
    const tfNode = this.canvas.nodes.find(n => n.type === 'tf');
    return tfNode ? tfNode.label : '1 / (s + 1)';
  }
}
