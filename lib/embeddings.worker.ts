/**
 * 语义搜索 embedding Worker
 *
 * 完全离线运行：模型第一次使用时从 Hugging Face 下载一次，
 * 之后由浏览器 Cache API 自动缓存，不会重复下载，也不会把笔记内容发到任何服务器。
 *
 * （CSP script-src 已加入 'blob:'，onnxruntime-web 的 WASM 胶水代码走 blob: URL 加载。）
 */
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

// 模型由多个文件组成（tokenizer/config/权重等），progress_callback 按文件单独报告进度，
// 这里按已加载字节数汇总成一个整体百分比，避免进度条在切换文件时突然回退。
const fileProgress = new Map<string, { loaded: number; total: number }>();

function reportAggregatedProgress(): void {
  let loaded = 0;
  let total = 0;
  for (const entry of fileProgress.values()) {
    loaded += entry.loaded;
    total += entry.total;
  }
  if (total > 0) {
    postMessage({ type: 'progress', progress: (loaded / total) * 100 });
  }
}

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      progress_callback: (event: unknown) => {
        const e = event as { status?: string; file?: string; loaded?: number; total?: number };
        if (
          e.status === 'progress' &&
          e.file &&
          typeof e.loaded === 'number' &&
          typeof e.total === 'number' &&
          e.total > 0
        ) {
          fileProgress.set(e.file, { loaded: e.loaded, total: e.total });
          reportAggregatedProgress();
        }
      },
    }) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

interface EmbedRequest {
  type: 'embed';
  id: number;
  texts: string[];
}

self.onmessage = async (event: MessageEvent<EmbedRequest>) => {
  const { type, id, texts } = event.data;
  if (type !== 'embed') return;

  try {
    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const vectors = output.tolist() as number[][];
    postMessage({ type: 'result', id, vectors });
  } catch (error) {
    postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
