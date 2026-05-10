/**
 * node.js — Visual Editor Block/Node
 */
export class EditorNode {
  constructor(id, type, x, y, options = {}) {
    this.id = id;
    this.type = type; // source, sum, tf, gain, scope
    this.x = x;
    this.y = y;
    this.width = options.width || 100;
    this.height = options.height || 60;
    this.label = options.label || type.toUpperCase();
    this.data = options.data || {};

    this.element = null;
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
    rect.setAttribute('rx', '4');
    g.appendChild(rect);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', this.width / 2);
    text.setAttribute('y', this.height / 2 + 5);
    text.textContent = this.label;
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

    this.element = g;
    return g;
  }

  createPort(x, y, type) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'port');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '5');
    circle.setAttribute('data-type', type);
    return circle;
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
