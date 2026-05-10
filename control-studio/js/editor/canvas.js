/**
 * canvas.js — Visual Editor Canvas Controller
 * Handles zooming, panning, node/link management, and basic interaction.
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
    this.isPanning = false;
    this.dragTarget = null;
    this.dragStart = { x: 0, y: 0 };
    this.panStart = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.drawGrid();

    // Mouse events for dragging nodes or canvas
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Wheel zoom
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // Resize handling
    window.addEventListener('resize', () => this.drawGrid());
  }

  // ============================================================
  // Zoom / Pan
  // ============================================================
  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    this.zoom = Math.max(0.25, Math.min(3, this.zoom + delta));
    this.applyTransform();
  }

  applyTransform() {
    const content = this.svg.querySelector('#canvas-grid');
    const nodesL = this.svg.querySelector('#canvas-nodes');
    const linksL = this.svg.querySelector('#canvas-links');

    const t = `translate(${this.offset.x}, ${this.offset.y}) scale(${this.zoom})`;
    if (content) content.setAttribute('transform', t);
    if (nodesL) nodesL.setAttribute('transform', t);
    if (linksL) linksL.setAttribute('transform', t);
  }

  drawGrid() {
    this.gridLayer.innerHTML = '';
    const size = 20;
    const width = Math.max(this.container?.clientWidth || 800, 2000);
    const height = Math.max(this.container?.clientHeight || 600, 2000);

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

  // ============================================================
  // Mouse Handling
  // ============================================================
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

    // Middle mouse or space+click for panning
    if (e.button === 1 || e.altKey) {
      this.isPanning = true;
      this.panStart = { x: x - this.offset.x, y: y - this.offset.y };
      e.preventDefault();
      return;
    }

    // Deselect if clicked on background
    this.nodes.forEach(n => n.setSelected(false));
  }

  onMouseMove(e) {
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isPanning) {
      this.offset.x = x - this.panStart.x;
      this.offset.y = y - this.panStart.y;
      this.applyTransform();
      return;
    }

    if (!this.isDragging || !this.dragTarget) return;

    const dx = (x - this.dragStart.x) / this.zoom;
    const dy = (y - this.dragStart.y) / this.zoom;

    this.dragTarget.move(dx, dy);
    this.dragStart = { x, y };

    this.updateLinks();
  }

  onMouseUp() {
    this.isDragging = false;
    this.isPanning = false;
    this.dragTarget = null;
  }

  // ============================================================
  // Node & Link Management
  // ============================================================
  addNode(node) {
    this.nodes.push(node);
    this.nodesLayer.appendChild(node.render());
  }

  addLink(link) {
    this.links.push(link);
    this.linksLayer.appendChild(link.render());
  }

  removeNode(nodeId) {
    // Remove related links first
    const relatedLinks = this.links.filter(l => l.from.id === nodeId || l.to.id === nodeId);
    for (const link of relatedLinks) {
      this.removeLink(link.id);
    }
    // Remove node
    const idx = this.nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      const node = this.nodes[idx];
      if (node.element && node.element.parentNode) {
        node.element.parentNode.removeChild(node.element);
      }
      this.nodes.splice(idx, 1);
    }
  }

  removeLink(linkId) {
    const idx = this.links.findIndex(l => l.id === linkId);
    if (idx !== -1) {
      const link = this.links[idx];
      if (link.element && link.element.parentNode) {
        link.element.parentNode.removeChild(link.element);
      }
      this.links.splice(idx, 1);
    }
  }

  updateLinks() {
    this.links.forEach(l => l.update());
  }

  clear() {
    this.nodes = [];
    this.links = [];
    this.nodesLayer.innerHTML = '';
    this.linksLayer.innerHTML = '';
    this.offset = { x: 0, y: 0 };
    this.zoom = 1;
    this.applyTransform();
  }
}
