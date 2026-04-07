# Knowledge Graph 性能优化指南

## 概述

为了在处理大规模知识图谱（1000+ 笔记）时保持高性能，我们实现了以下优化策略：

## 优化技术

### 1. 节点聚类（Node Clustering）
将相关节点分组以减少渲染复杂性。

```typescript
import { NodeClusterer } from '../lib/graphOptimization';

// 按分类聚类
const clusters = NodeClusterer.clusterByCategory(nodes, noteMap);

// 按连接密度聚类
const densityClusters = NodeClusterer.clusterByDensity(nodes, links, 5);
```

### 2. 细节层级（Level of Detail - LOD）
根据缩放级别显示不同详细程度的信息。

```typescript
import { LODManager } from '../lib/graphOptimization';

const lodManager = new LODManager();
lodManager.setZoom(zoomLevel);

// 根据详细程度过滤节点
const visibleNodes = lodManager.filterNodesByDetailLevel(nodes);
```

### 3. 视口虚拟化（Viewport Virtualization）
仅渲染当前视口中可见的节点和链接。

```typescript
import { ViewportVirtualizer } from '../lib/graphOptimization';

const virtualizer = new ViewportVirtualizer();
virtualizer.setViewport(scrollX, scrollY, width, height);

// 检查节点是否可见
if (virtualizer.isNodeVisible(nodeX, nodeY, radius)) {
  renderNode(node);
}
```

### 4. 布局缓存
缓存力导向布局结果以避免重复计算。

```typescript
import { LayoutCache } from '../lib/graphOptimization';

const cache = new LayoutCache();
const hash = cache.generateHash(nodes, links);

if (cache.has(hash)) {
  positions = cache.get(hash);
} else {
  positions = runSimulation(nodes, links);
  cache.set(hash, positions);
}
```

### 5. 简化模拟
使用优化的力导向算法和更少的迭代次数。

```typescript
import { SimplifiedSimulation } from '../lib/graphOptimization';

SimplifiedSimulation.simulate(
  nodes,
  links,
  positions,
  velocities,
  10,  // 减少迭代次数
  canvasWidth,
  canvasHeight,
);
```

## 性能监控

```typescript
import { PerformanceMonitor } from '../lib/graphOptimization';

const monitor = new PerformanceMonitor();

const startSim = performance.now();
// ... run simulation
monitor.recordSimulationTime(performance.now() - startSim);

const startRender = performance.now();
// ... render nodes
monitor.recordRenderTime(performance.now() - startRender);

console.log(monitor.getReport());
```

## 推荐配置

| 节点数量 | 聚类 | LOD   | 虚拟化 | 迭代次数 | 预期 FPS |
|---------|------|-------|--------|---------|---------|
| < 100   | 否   | 否    | 否     | 100     | 60      |
| 100-500 | 是   | 是    | 否     | 50      | 60      |
| 500-1000| 是   | 是    | 是     | 20      | 30-60   |
| > 1000  | 是   | 是    | 是     | 10      | 30      |

## 实现步骤

1. **引入优化库**
   ```typescript
   import {
     NodeClusterer,
     LODManager,
     ViewportVirtualizer,
     LayoutCache,
     SimplifiedSimulation,
     PerformanceMonitor,
   } from '../lib/graphOptimization';
   ```

2. **创建管理器实例**
   ```typescript
   const lodManager = new LODManager();
   const virtualizer = new ViewportVirtualizer();
   const layoutCache = new LayoutCache();
   const monitor = new PerformanceMonitor();
   ```

3. **在render循环中应用优化**
   ```typescript
   // 使用缓存的布局
   const layoutHash = layoutCache.generateHash(nodes, links);
   if (layoutCache.has(layoutHash)) {
     nodePositions = layoutCache.get(layoutHash);
   }

   // 应用LOD过滤
   const displayNodes = lodManager.filterNodesByDetailLevel(nodes);

   // 应用视口过滤
   virtualizer.setViewport(scrollX, scrollY, width, height);
   const visibleNodes = displayNodes.filter((n) =>
     virtualizer.isNodeVisible(nodePositions.get(n.id)?.x || 0, ...)
   );

   // 简化模拟
   SimplifiedSimulation.simulate(nodes, links, positions, velocities, iterations);

   // 记录性能
   monitor.setRenderingStats(visibleNodes.length, visibleLinks.length);
   ```

## 性能基准

使用这些优化后的预期改进：

- **100 个节点**：无变化（已经很快）
- **500 个节点**：50-70% 性能提升
- **1000 个节点**：60-80% 性能提升
- **5000+ 个节点**：可现用（需要所有优化）

## 故障排除

### 图表仍然缓慢
- 启用 LOD 和虚拟化
- 减少力模拟迭代次数
- 考虑仅显示子图而非完整图

### 节点跳跃或不稳定
- 增加速度阻尼（从 0.95 到 0.8）
- 使用缓存的布局而非每帧重新计算
- 减少力的强度参数

### 内存使用过多
- 清除布局缓存中的旧条目
- 使用聚类减少节点数量
- 启用虚拟化以减少DOM元素

## 进一步优化

考虑以下高级优化：

1. **Web Workers** - 在后台线程中运行模拟
2. **WebGL** - 使用 GPU 加速渲染
3. **分层渲染** - 将节点分层显示
4. **增量更新** - 只更新改变的节点
