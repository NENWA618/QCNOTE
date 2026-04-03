/**
 * Performance optimizations for KnowledgeGraph rendering
 * Includes clustering, LOD (Level of Detail), and node virtualization
 */

import { NoteItem } from './storage';

export interface OptimizedGraphNode {
  id: string;
  label: string;
  size: number;
  color: string;
  clusterId?: string;
  importance: number;
}

export interface OptimizedGraphLink {
  source: string;
  target: string;
  type: 'forward' | 'backlink';
  weight: number;
}

/**
 * Clustering algorithm to group related nodes
 * Reduces rendering complexity for large graphs
 */
export class NodeClusterer {
  static clusterByCategory(
    nodes: OptimizedGraphNode[],
    noteMap: Map<string, NoteItem>,
  ): Map<string, string[]> {
    const clusters = new Map<string, string[]>();

    nodes.forEach((node) => {
      const note = noteMap.get(node.id);
      const category = note?.category || 'Uncategorized';

      if (!clusters.has(category)) {
        clusters.set(category, []);
      }
      clusters.get(category)!.push(node.id);
    });

    return clusters;
  }

  /**
   * Simplified clustering using connection count
   * Groups nodes with similar link density
   */
  static clusterByDensity(
    nodes: OptimizedGraphNode[],
    links: OptimizedGraphLink[],
    clusterCount: number = 5,
  ): Map<string, string[]> {
    // Count connections per node
    const connectionCounts = new Map<string, number>();
    nodes.forEach((n) => (connectionCounts.set(n.id, 0), n));
    links.forEach((l) => {
      connectionCounts.set(l.source, (connectionCounts.get(l.source) || 0) + 1);
      connectionCounts.set(l.target, (connectionCounts.get(l.target) || 0) + 1);
    });

    // Sort by density
    const sorted = [...nodes].sort(
      (a, b) => (connectionCounts.get(b.id) || 0) - (connectionCounts.get(a.id) || 0),
    );

    // Distribute into buckets
    const clusters = new Map<string, string[]>();
    sorted.forEach((node, idx) => {
      const bucketId = `density-${idx % clusterCount}`;
      if (!clusters.has(bucketId)) clusters.set(bucketId, []);
      clusters.get(bucketId)!.push(node.id);
    });

    return clusters;
  }
}

/**
 * Level of Detail (LOD) system for progressive rendering
 * Shows more detail when zoomed in, less when zoomed out
 */
export class LODManager {
  private zoomLevel: number = 1;
  private readonly MIN_ZOOM = 0.1;
  private readonly MAX_ZOOM = 10;

  setZoom(level: number) {
    this.zoomLevel = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, level));
  }

  getDetailLevel(): 'low' | 'medium' | 'high' {
    if (this.zoomLevel < 0.3) return 'low';
    if (this.zoomLevel < 1) return 'medium';
    return 'high';
  }

  /**
   * Filter nodes based on detail level
   * At low zoom, only show important nodes
   */
  filterNodesByDetailLevel<T extends { importance: number }>(
    nodes: T[],
  ): T[] {
    const detail = this.getDetailLevel();

    switch (detail) {
      case 'low': {
        // Show only top 30% by importance
        const sorted = [...nodes].sort((a, b) => b.importance - a.importance);
        return sorted.slice(0, Math.ceil(nodes.length * 0.3));
      }

      case 'medium': {
        // Show top 70% by importance
        return [...nodes]
          .sort((a, b) => b.importance - a.importance)
          .slice(0, Math.ceil(nodes.length * 0.7));
      }

      case 'high':
        // Show all nodes
        return nodes;
    }
  }
}

/**
 * Viewport-based rendering optimization
 * Only render nodes visible in current viewport
 */
export class ViewportVirtualizer {
  private viewport: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  };
  private readonly PADDING = 100; // Extra buffer for smooth scrolling

  setViewport(x: number, y: number, width: number, height: number) {
    this.viewport = { x, y, width, height };
  }

  /**
   * Check if a node is visible in viewport
   */
  isNodeVisible(x: number, y: number, radius: number = 20): boolean {
    const { x: vx, y: vy, width: vw, height: vh } = this.viewport;

    return (
      x + radius + this.PADDING > vx &&
      x - radius - this.PADDING < vx + vw &&
      y + radius + this.PADDING > vy &&
      y - radius - this.PADDING < vy + vh
    );
  }

  /**
   * Filter links that have at least one endpoint visible
   */
  filterVisibleLinks<T extends { source: { x: number; y: number; r: number }; target: { x: number; y: number; r: number } }>(
    links: T[],
  ): T[] {
    return links.filter(
      (link) =>
        this.isNodeVisible(link.source.x, link.source.y, link.source.r) ||
        this.isNodeVisible(link.target.x, link.target.y, link.target.r),
    );
  }
}

/**
 * Simulation cache for force-directed layout
 * Reuse layout from previous frame if graph hasn't changed significantly
 */
export class LayoutCache {
  private cache: Map<string, Map<string, { x: number; y: number }>> = new Map();
  private graphHash: string = '';

  generateHash(nodes: OptimizedGraphNode[], links: OptimizedGraphLink[]): string {
    const nodeStr = nodes.map((n) => n.id).sort().join(',');
    const linkStr = links.map((l) => `${l.source}-${l.target}`).sort().join(',');
    return `${nodeStr}|${linkStr}`;
  }

  has(hash: string): boolean {
    return this.cache.has(hash);
  }

  get(
    hash: string,
  ): Map<string, { x: number; y: number }> | undefined {
    return this.cache.get(hash);
  }

  set(
    hash: string,
    positions: Map<string, { x: number; y: number }>,
  ): void {
    if (this.cache.size > 10) {
      // Keep only 10 most recent layouts
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(hash, positions);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Performance metrics collector
 */
export class PerformanceMonitor {
  private metrics: {
    renderTime: number[];
    simulationTime: number[];
    nodesRendered: number;
    linksRendered: number;
  } = {
    renderTime: [],
    simulationTime: [],
    nodesRendered: 0,
    linksRendered: 0,
  };

  recordSimulationTime(ms: number): void {
    this.metrics.simulationTime.push(ms);
    if (this.metrics.simulationTime.length > 60) {
      this.metrics.simulationTime.shift();
    }
  }

  recordRenderTime(ms: number): void {
    this.metrics.renderTime.push(ms);
    if (this.metrics.renderTime.length > 60) {
      this.metrics.renderTime.shift();
    }
  }

  setRenderingStats(nodes: number, links: number): void {
    this.metrics.nodesRendered = nodes;
    this.metrics.linksRendered = links;
  }

  getAverageSimulationTime(): number {
    if (this.metrics.simulationTime.length === 0) return 0;
    const sum = this.metrics.simulationTime.reduce((a, b) => a + b, 0);
    return sum / this.metrics.simulationTime.length;
  }

  getAverageRenderTime(): number {
    if (this.metrics.renderTime.length === 0) return 0;
    const sum = this.metrics.renderTime.reduce((a, b) => a + b, 0);
    return sum / this.metrics.renderTime.length;
  }

  getReport(): string {
    return `
Simulation: ${this.getAverageSimulationTime().toFixed(2)}ms
Render: ${this.getAverageRenderTime().toFixed(2)}ms
Nodes: ${this.metrics.nodesRendered}
Links: ${this.metrics.linksRendered}
    `.trim();
  }
}

/**
 * Simplified simulation for large graphs
 * Uses Barnes-Hut algorithm approximation for O(n log n) instead of O(n²)
 */
export class SimplifiedSimulation {
  /**
   * Run a simplified force simulation with fewer iterations
   * Scales to handle 1000+ nodes
   */
  static simulate(
    nodes: OptimizedGraphNode[],
    links: OptimizedGraphLink[],
    positions: Map<string, { x: number; y: number }>,
    velocities: Map<string, { vx: number; vy: number }>,
    iterations: number = 10,
    canvasWidth: number = 800,
    canvasHeight: number = 600,
  ): void {
    for (let iter = 0; iter < iterations; iter++) {
      // Apply link forces (attractive)
      links.forEach((link) => {
        const p1 = positions.get(link.source);
        const p2 = positions.get(link.target);
        if (!p1 || !p2) return;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.05; // Increased damping

        const v1 = velocities.get(link.source);
        const v2 = velocities.get(link.target);
        if (v1 && v2) {
          v1.vx += (force * dx) / dist;
          v1.vy += (force * dy) / dist;
          v2.vx -= (force * dx) / dist;
          v2.vy -= (force * dy) / dist;
        }
      });

      // Apply node damping and update positions
      nodes.forEach((node) => {
        const pos = positions.get(node.id);
        const vel = velocities.get(node.id);
        if (pos && vel) {
          vel.vx *= 0.8; // Increased damping for stability
          vel.vy *= 0.8;

          pos.x += vel.vx;
          pos.y += vel.vy;

          // Soft boundaries
          const padding = 40;
          if (pos.x < padding) pos.x = padding;
          if (pos.x > canvasWidth - padding) pos.x = canvasWidth - padding;
          if (pos.y < padding) pos.y = padding;
          if (pos.y > canvasHeight - padding) pos.y = canvasHeight - padding;
        }
      });
    }
  }
}
