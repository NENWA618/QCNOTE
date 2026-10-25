/**
 * 基于 Promise 的对话框，用来替代 window.confirm / alert / prompt。
 *
 * 原生对话框的问题：阻塞主线程、样式无法跟随主题（暗色下刺眼）、
 * 移动端浏览器常把它们折叠成“阻止此页面再弹出对话框”、也没法给按钮起有意义的名字。
 *
 * 实际渲染由 components/DialogHost.tsx 完成（在 _app 里挂载一次）。
 * 宿主未挂载时（单元测试、SSR 之外的极端情况）退回原生对话框，行为与改造前一致。
 */

export type DialogTone = 'default' | 'danger';

export interface ConfirmOptions {
  title?: string;
  /** 正文；支持用 \n 换行 */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger：确认按钮用警示色，且默认焦点落在“取消”上，避免回车误触 */
  tone?: DialogTone;
}

export interface AlertOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
}

export interface PromptOptions {
  title?: string;
  description: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

export type DialogRequest =
  | { id: number; kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: 'alert'; options: AlertOptions; resolve: () => void }
  | { id: number; kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void };

type Listener = (queue: DialogRequest[]) => void;

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(queue);
}

/** 宿主挂载后订阅队列；返回取消订阅函数。 */
export function subscribeDialogs(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => {
    listeners.delete(listener);
    // 宿主卸载后没人能回答排队中的对话框：一律按“取消”收尾，
    // 既不会让调用方的 await 永远挂起，也不会把未确认的危险操作当成已同意
    if (listeners.size === 0 && queue.length > 0) {
      const pending = queue;
      queue = [];
      for (const d of pending) {
        if (d.kind === 'confirm') d.resolve(false);
        else if (d.kind === 'alert') d.resolve();
        else d.resolve(null);
      }
    }
  };
}

/** 宿主调用：某个对话框已有结果，移出队列。 */
export function settleDialog(id: number) {
  queue = queue.filter((d) => d.id !== id);
  emit();
}

const hasHost = () => typeof window !== 'undefined' && listeners.size > 0;

function enqueue(request: Omit<DialogRequest, 'id'>): void {
  queue = [...queue, { ...request, id: nextId++ } as DialogRequest];
  emit();
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!hasHost()) {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(options.description));
  }
  return new Promise((resolve) => enqueue({ kind: 'confirm', options, resolve }));
}

export function alertDialog(options: AlertOptions): Promise<void> {
  if (!hasHost()) {
    if (typeof window !== 'undefined') window.alert(options.description);
    return Promise.resolve();
  }
  return new Promise((resolve) => enqueue({ kind: 'alert', options, resolve }));
}

/** 返回输入的文本；取消返回 null。 */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  if (!hasHost()) {
    return Promise.resolve(
      typeof window !== 'undefined' ? window.prompt(options.description) : null,
    );
  }
  return new Promise((resolve) => enqueue({ kind: 'prompt', options, resolve }));
}
