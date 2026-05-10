/**
 * node.js — Visual Editor Block/Node
 * Supports double-click inline editing for TF and Gain labels.
 */
export class EditorNode {
  constructor(id, type, x, y, options = {}) {
    this.id = id;
    this.type = type; // source, sum, tf, gain, scope
    this.x = x;
    this.y = y;
    this.width = options.width || 120;
    this.height = options.height || 60;
    this.label = options.label || type.toUpperCase();
    this.data = options.data || {};

    this.element = null;
    this.textElement = null;
    this.selected = false;
  }

  render() {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'canvas-node');
    g.setAttribute('data-id', this.id);
    g.setAttribute('transform', `translate(${this.x}, ${this.y})`);

    // Main rectangle
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', this.width);
    rect.setAttribute('height', this.height);
    rect.setAttribute('rx', '6');
    g.appendChild(rect);

    // Type badge
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    badge.setAttribute('x', this.width / 2);
    badge.setAttribute('y', 14);
    badge.setAttribute('class', 'node-badge');
    badge.textContent = this.type.toUpperCase();
    g.appendChild(badge);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', this.width / 2);
    text.setAttribute('y', this.height / 2 + 8);
    text.textContent = this.label;
    this.textElement = text;
    g.appendChild(text);

    // Ports (Simplified: Left = Input, Right = Output)
    if (this.type !== 'source') {
      const input = this.createPort(0, this.height / 2, 'input');
      g.appendChild(input);
    }
    if (this.type !== 'scope') {
      const output = this.createPort(this.width, this.height / 2, 'output');
      g.appendChild(output);
    }

    // Double-click to edit label (only for TF and Gain)
    if (this.type === 'tf' || this.type === 'gain') {
      g.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startEditing();
      });
    }

    this.element = g;
    return g;
  }

  createPort(x, y, type) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'port');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '6');
    circle.setAttribute('data-type', type);
    return circle;
  }

  startEditing() {
    const svg = this.element.ownerSVGElement;
    if (!svg) return;
    const container = svg.parentElement;
    if (!container) return;

    // Create an overlay input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.label;
    input.style.cssText = `
      position: absolute;
      left: ${this.x + 4}px;
      top: ${this.y + this.height / 2 - 10}px;
      width: ${this.width - 8}px;
      height: 24px;
      font-size: 12px;
      font-family: 'Inter', monospace;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 2px solid var(--color-accent);
      border-radius: 4px;
      padding: 2px 6px;
      z-index: 100;
      text-align: center;
    `;

    const finishEdit = () => {
      const newLabel = input.value.trim();
      if (newLabel) {
        this.label = newLabel;
        if (this.textElement) this.textElement.textContent = newLabel;
      }
      input.remove();
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { finishEdit(); }
      if (e.key === 'Escape') { input.remove(); }
    });

    container.appendChild(input);
    input.focus();
    input.select();
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.element.setAttribute('transform', `translate(${this.x}, ${this.y})`);
  }

  setSelected(sel) {
    this.selected = sel;
    if (sel) this.element.classList.add('selected');
    else this.element.classList.remove('selected');
  }

  getOutputPos() {
    return { x: this.x + this.width, y: this.y + this.height / 2 };
  }

  getInputPos() {
    return { x: this.x, y: this.y + this.height / 2 };
  }
}
