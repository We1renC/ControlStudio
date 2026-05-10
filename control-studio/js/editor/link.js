/**
 * link.js — Visual Editor Link (Connection)
 */
export class EditorLink {
  constructor(id, fromNode, toNode) {
    this.id = id;
    this.from = fromNode;
    this.to = toNode;
    this.element = null;
  }

  render() {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'canvas-link');
    path.setAttribute('data-id', this.id);
    this.element = path;
    this.update();
    return path;
  }

  update() {
    if (!this.element) return;
    const start = this.from.getOutputPos();
    const end = this.to.getInputPos();

    // Orthogonal routing (simple step)
    const midX = (start.x + end.x) / 2;
    const d = `M ${start.x} ${start.y} H ${midX} V ${end.y} H ${end.x}`;

    this.element.setAttribute('id', `link-${this.id}`);
    this.element.setAttribute('d', d);
  }
}
