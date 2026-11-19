import React, { useEffect, useId, useRef, useState } from 'react';
import { subscribeDialogs, settleDialog, type DialogRequest } from '../lib/dialog';
import { isImeComposing } from '../lib/ime';

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const DEFAULT_TITLE = { confirm: '请确认', alert: '提示', prompt: '请输入' } as const;

function DialogView({ request }: { request: DialogRequest }) {
  const { kind } = request;
  const options = request.options;
  const tone = kind === 'alert' ? 'default' : (options as { tone?: string }).tone;
  const danger = tone === 'danger';

  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const titleId = useId();
  const descId = useId();

  const finish = (confirmed: boolean) => {
    if (request.kind === 'confirm') request.resolve(confirmed);
    else if (request.kind === 'alert') request.resolve();
    else request.resolve(confirmed ? value : null);
    settleDialog(request.id);
  };
  // 键盘监听挂在 document 上，始终要拿到最新的 finish（在 effect 里同步，避免渲染期写 ref）
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // 打开时记住原焦点，关闭后还回去；并设定初始焦点
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // 危险操作默认聚焦“取消”：用户习惯性按回车不会误删数据
    const initial =
      kind === 'prompt' ? inputRef.current : danger ? cancelRef.current : confirmRef.current;
    initial?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [kind, danger]);

  useEffect(() => {
    // 捕获阶段 + stopPropagation：对话框打开时按 Esc 只关对话框，
    // 不会同时触发下面编辑器/菜单上的 Esc 处理器
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImeComposing(e)) return; // 输入法取消候选，不是在关对话框
        e.preventDefault();
        e.stopPropagation();
        finishRef.current(false);
        return;
      }
      if (e.key !== 'Tab') return;
      // 焦点锁在对话框内循环
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const confirmLabel = options.confirmLabel ?? (kind === 'alert' ? '知道了' : '确定');
  const cancelLabel =
    kind === 'alert' ? null : ((options as { cancelLabel?: string }).cancelLabel ?? '取消');

  return (
    <div className="dialog-root" role="presentation">
      <div className="dialog-backdrop" onClick={() => finish(false)} aria-hidden="true" />
      <div
        ref={panelRef}
        role={kind === 'prompt' ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="dialog-panel"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink dark:text-dark-text">
          {options.title ?? DEFAULT_TITLE[kind]}
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed whitespace-pre-line text-text-light break-words"
        >
          {options.description}
        </p>

        {kind === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={(options as { placeholder?: string }).placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // 输入法选词时的回车是确认候选，不是提交
              if (e.key === 'Enter' && !isImeComposing(e.nativeEvent)) {
                e.preventDefault();
                finish(true);
              }
            }}
            className="input mt-4"
            autoComplete="off"
          />
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelLabel && (
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-secondary"
              onClick={() => finish(false)}
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => finish(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 在 _app 中挂载一次；渲染队列里的第一个对话框。 */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);
  const current = queue[0];
  if (!current) return null;
  return <DialogView key={current.id} request={current} />;
}
