/**
 * 语义搜索 embedding 客户端 - 主线程侧
 *
 * 懒加载 Worker：只有第一次真正调用 embedTexts 时才会创建 Worker（进而触发模型下载），
 * 用户不开启语义搜索就完全不会有任何网络请求或额外开销。
 */

type ProgressCallback = (progress: number) => void;

interface PendingRequest {
  resolve: (vectors: number[][]) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
let progressListeners = new Set<ProgressCallback>();

function getWorker(): Worker {
  if (worker) return worker;

  const w = new Worker(new URL('./embeddings.worker.ts', import.meta.url), { type: 'module' });

  w.onmessage = (event: MessageEvent) => {
    const data = event.data as
      | { type: 'result'; id: number; vectors: number[][] }
      | { type: 'error'; id: number; error: string }
      | { type: 'progress'; progress: number };

    if (data.type === 'progress') {
      progressListeners.forEach((cb) => cb(data.progress));
      return;
    }

    const handlers = pending.get(data.id);
    if (!handlers) return;
    pending.delete(data.id);

    if (data.type === 'result') {
      handlers.resolve(data.vectors);
    } else {
      handlers.reject(new Error(data.error));
    }
  };

  w.onerror = (event) => {
    const reason = event.message || 'Embedding worker error';
    pending.forEach(({ reject }) => reject(new Error(reason)));
    pending.clear();
  };

  worker = w;
  return worker;
}

export function isSemanticSearchAvailable(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export function onEmbeddingProgress(callback: ProgressCallback): () => void {
  progressListeners.add(callback);
  return () => progressListeners.delete(callback);
}

export function embedTexts(texts: string[]): Promise<number[][]> {
  if (!isSemanticSearchAvailable()) {
    return Promise.reject(new Error('当前环境不支持语义搜索（Worker 不可用）'));
  }
  if (texts.length === 0) return Promise.resolve([]);

  const w = getWorker();
  const id = nextId++;

  return new Promise<number[][]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: 'embed', id, texts });
  });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // 模型输出已经 normalize: true，向量是单位向量，点积即余弦相似度
  return dot;
}
