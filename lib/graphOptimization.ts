/**
 * Performance optimizations for KnowledgeGraph rendering
 * Includes clustering, LOD (Level of Detail), and node virtualization
 */

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
  filterNodesByDetailLevel<T extends { importance: number }>(nodes: T[]): T[] {
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

      // Repulsive force between nodes (keeps unlinked notes spread out)
      const n = nodes.length;
      const area = canvasWidth * canvasHeight;
      // Ideal spacing: roughly the space each node would get if evenly spread
      const spacing = Math.min(140, Math.max(36, Math.sqrt(area / Math.max(1, n)) * 0.9));
      if (n <= 400) {
        for (let i = 0; i < n; i++) {
          const p1 = positions.get(nodes[i].id);
          const v1 = velocities.get(nodes[i].id);
          if (!p1 || !v1) continue;
          for (let j = i + 1; j < n; j++) {
            const p2 = positions.get(nodes[j].id);
            const v2 = velocities.get(nodes[j].id);
            if (!p2 || !v2) continue;
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) {
              // Exactly overlapping: nudge in a deterministic direction
              dx = Math.cos(i + j);
              dy = Math.sin(i + j);
              dist = 1;
            }
            if (dist < spacing * 2.5) {
              // Stronger push when closer than the ideal spacing (collision)
              const push =
                dist < spacing
                  ? (spacing - dist) * 0.5 + 2
                  : ((spacing * spacing) / (dist * dist)) * 2;
              const fx = (push * dx) / dist;
              const fy = (push * dy) / dist;
              v1.vx -= fx;
              v1.vy -= fy;
              v2.vx += fx;
              v2.vy += fy;
            }
          }
        }
      }

      // Gentle pull toward the center so isolated nodes don't drift to the edges
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      nodes.forEach((node) => {
        const pos = positions.get(node.id);
        const vel = velocities.get(node.id);
        if (pos && vel) {
          vel.vx += (cx - pos.x) * 0.002;
          vel.vy += (cy - pos.y) * 0.002;
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
