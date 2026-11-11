/**
 * 语义搜索用的 embedding 模型。Worker（浏览器里推理）和 scripts/tune-thresholds.ts（Node 里调阈值）
 * 必须用同一个模型，否则调出来的阈值对线上没有意义，所以放在这里共用。
 */
export const EMBEDDING_MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
