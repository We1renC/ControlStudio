/**
 * canvas.js — Visual Editor Canvas Controller
 * Handles zooming, panning, and basic interaction.
 */
export class EditorCanvas {
  constructor(containerId, svgId) {
    this.container = document.getElementById(containerId);
    this.svg = document.getElementById(svgId);
    this.nodesLayer = document.getElementById('canvas-nodes');
    this.linksLayer = document.getElementById('canvas-links');
    this.gridLayer = document.getElementById('canvas-grid');

    this.nodes = [];
    this.links = [];

    this.offset = { x: 0, y: 0 };
    this.zoom = 1;

    this.isDragging = false;
    this.dragTarget = null;
    this.dragStart = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.drawGrid();

    // Mouse events for dragging nodes or canvas
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Resize handling
    window.addEventListener('resize', () => this.drawGrid());
  }

  drawGrid() {
    this.gridLayer.innerHTML = '';
    const size = 20;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    for (let x = 0; x <= width; x += size) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', 0);
      line.setAttribute('x2', x);
      line.setAttribute('y2', height);
      line.setAttribute('stroke', 'var(--border-secondary)');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('opacity', '0.3');
      this.gridLayer.appendChild(line);
    }

    for (let y = 0; y <= height; y += size) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 0);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'var(--border-secondary)');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('opacity', '0.3');
      this.gridLayer.appendChild(line);
    }
  }

  onMouseDown(e) {
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked on a node
    const nodeEl = e.target.closest('.canvas-node');
    if (nodeEl) {
      this.isDragging = true;
      this.dragTarget = this.nodes.find(n => n.id === nodeEl.dataset.id);
      this.dragStart = { x, y };

      // Bring to front
      this.nodesLayer.appendChild(nodeEl);

      // Select
      this.nodes.forEach(n => n.setSelected(false));
      this.dragTarget.setSelected(true);
      return;
    }

    // Deselect if clicked on background
    this.nodes.forEach(n => n.setSelected(false));
  }

  onMouseMove(e) {
    if (!this.isDragging || !this.dragTarget) return;

    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - this.dragStart.x;
    const dy = y - this.dragStart.y;

    this.dragTarget.move(dx, dy);
    this.dragStart = { x, y };

    this.updateLinks();
  }

  onMouseUp() {
    this.isDragging = false;
    this.dragTarget = null;
  }

  addNode(node) {
    this.nodes.push(node);
    this.nodesLayer.appendChild(node.render());
  }

  addLink(link) {
    this.links.push(link);
    this.linksLayer.appendChild(link.render());
  }

  updateLinks() {
    this.links.forEach(l => l.update());
  }

  clear() {
    this.nodes = [];
    this.links = [];
    this.nodesLayer.innerHTML = '';
    this.linksLayer.innerHTML = '';
  }
}
