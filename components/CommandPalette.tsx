import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { NoteItem } from '../lib/storage';
import { highlightSegments, rankByFuzzy, type FuzzyMatch } from '../lib/fuzzy';
import { isImeComposing } from '../lib/ime';
import { toPlainPreview } from '../lib/notePreview';
import { useFocusTrap } from '../lib/hooks/useFocusTrap';
import { useModKeyLabel } from '../lib/hooks/useModKeyLabel';

export interface PaletteCommand {
  id: string;
  label: string;
  /** 行首的 emoji 图标 */
  icon?: string;
  /** 额外的搜索词（不显示），如 "calendar 日历 月视图" */
  keywords?: string;
  /** 右侧显示的快捷键提示 */
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  /** 可跳转的笔记（不含回收站里的） */
  notes: NoteItem[];
  commands: PaletteCommand[];
  onClose: () => void;
  onOpenNote: (note: NoteItem) => void;
  /** 用查询词作为标题新建笔记 */
  onCreateNote: (title: string) => void;
}

type Row =
  | { kind: 'note'; id: string; note: NoteItem; match: FuzzyMatch | null }
  | { kind: 'create'; id: string; title: string }
  | { kind: 'command'; id: string; command: PaletteCommand; match: FuzzyMatch | null };

const MAX_NOTES = 8;
const MAX_COMMANDS = 6;
const EMPTY_QUERY_NOTES = 6;

function Highlighted({ text, indices }: { text: string; indices: readonly number[] }) {
  return (
    <>
      {highlightSegments(text, indices).map((seg, i) =>
        seg.match ? (
          <span key={i} className="font-semibold text-ink-pink">
            {seg.text}
          </span>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function PaletteDialog({
  notes,
  commands,
  onClose,
  onOpenNote,
  onCreateNote,
}: Omit<CommandPaletteProps, 'isOpen'>) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const mod = useModKeyLabel();

  useFocusTrap(panelRef, true, () => inputRef.current);

  const q = query.trim();

  const { noteRows, commandRows, createRow } = useMemo(() => {
    const byRecent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

    if (!q) {
      return {
        noteRows: byRecent
          .slice(0, EMPTY_QUERY_NOTES)
          .map((note): Row => ({ kind: 'note', id: `n-${note.id}`, note, match: null })),
        commandRows: commands.map((command): Row => ({
          kind: 'command',
          id: `c-${command.id}`,
          command,
          match: null,
        })),
        createRow: null,
      };
    }

    const titleOf = (n: NoteItem) => n.title || '无标题';
    const byTitle = rankByFuzzy(byRecent, q, titleOf);
    const matched = new Set(byTitle.map((r) => r.item.id));
    // 标题没命中的，再看标签和分类（这类命中不在标题上高亮）
    const byMeta = rankByFuzzy(
      byRecent.filter((n) => !matched.has(n.id)),
      q,
      (n) => `${n.tags.map((t) => `#${t}`).join(' ')} ${n.category}`,
    );
    const noteRows = [
      ...byTitle.map(({ item, match }): Row => ({
        kind: 'note',
        id: `n-${item.id}`,
        note: item,
        match,
      })),
      ...byMeta.map(({ item }): Row => ({
        kind: 'note',
        id: `n-${item.id}`,
        note: item,
        match: null,
      })),
    ].slice(0, MAX_NOTES);

    const commandRows = rankByFuzzy(commands, q, (c) => `${c.label} ${c.keywords ?? ''}`)
      .slice(0, MAX_COMMANDS)
      .map(({ item, match }): Row => ({
        kind: 'command',
        id: `c-${item.id}`,
        command: item,
        // 只高亮落在标签上的命中，关键词命中不高亮
        match: { ...match, indices: match.indices.filter((i) => i < item.label.length) },
      }));

    // 已经有同名笔记时不再提示“新建”，避免做出重名笔记（双链按标题解析，重名会有歧义）
    const exists = notes.some((n) => n.title.trim().toLowerCase() === q.toLowerCase());
    const createRow: Row | null = exists ? null : { kind: 'create', id: 'create', title: q };

    return { noteRows, commandRows, createRow };
  }, [notes, commands, q]);

  const rows = useMemo(
    () => [...noteRows, ...(createRow ? [createRow] : []), ...commandRows],
    [noteRows, createRow, commandRows],
  );
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  const optionId = (row: Row) => `${baseId}-${row.id}`;

  // 键盘移动选中项时，让它保持在可视范围内
  useEffect(() => {
    const row = rows[activeIndex];
    if (!row) return;
    listRef.current
      ?.querySelector(`[id="${baseId}-${row.id}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, rows, baseId]);

  const execute = (row: Row) => {
    // 先关闭再执行：关闭会把焦点还给打开前的元素，随后动作（如打开编辑器）再接管焦点
    onClose();
    if (row.kind === 'note') onOpenNote(row.note);
    else if (row.kind === 'create') onCreateNote(row.title);
    else row.command.run();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 输入法选词时的 Enter/方向键/Esc 是给输入法的，不能当成面板操作
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(rows.length ? (activeIndex + 1) % rows.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(rows.length ? (activeIndex - 1 + rows.length) % rows.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) execute(row);
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isImeComposing(e.nativeEvent)) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const renderRow = (row: Row) => {
    const selected = rows[activeIndex] === row;
    const common = {
      id: optionId(row),
      role: 'option' as const,
      'aria-selected': selected,
      className: 'palette-option',
      // mousedown 默认会让输入框失焦：阻止它，点击后焦点还在面板里
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onMouseMove: () => {
        const i = rows.indexOf(row);
        if (i !== activeIndex) setActive(i);
      },
      onClick: () => execute(row),
    };

    if (row.kind === 'note') {
      const { note } = row;
      const title = note.title || '无标题';
      const snippet = toPlainPreview(note.content, 80);
      return (
        <li key={row.id} {...common}>
          <span aria-hidden="true">📝</span>
          {/* 子元素之间的 {' '}：flex 容器会忽略空白节点所以不影响布局，但读屏软件据此断词 */}
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              <Highlighted text={title} indices={row.match?.indices ?? []} />
            </span>
            {(snippet || note.tags.length > 0) && (
              <>
                {' '}
                <span className="block truncate text-xs text-text-light">
                  {note.tags.length > 0 && <>{note.tags.map((t) => `#${t}`).join(' ')} </>}
                  {snippet}
                </span>
              </>
            )}
          </span>
          {note.category && (
            <>
              {' '}
              <span className="shrink-0 text-xs text-text-light">{note.category}</span>
            </>
          )}
        </li>
      );
    }

    if (row.kind === 'create') {
      return (
        <li key={row.id} {...common}>
          <span aria-hidden="true">➕</span>
          <span className="min-w-0 flex-1 truncate">
            新建笔记「<span className="font-semibold">{row.title}</span>」
          </span>
        </li>
      );
    }

    const { command } = row;
    return (
      <li key={row.id} {...common}>
        <span aria-hidden="true">{command.icon ?? '⚡'}</span>
        <span className="min-w-0 flex-1 truncate">
          <Highlighted text={command.label} indices={row.match?.indices ?? []} />
        </span>
        {command.shortcut && (
          <>
            {' '}
            <kbd className="shrink-0 rounded border border-primary-dark/30 px-1.5 text-xs text-text-light dark:border-dark-border">
              {command.shortcut}
            </kbd>
          </>
        )}
      </li>
    );
  };

  const noteGroup = [...noteRows, ...(createRow ? [createRow] : [])];
  const groups: { label: string; rows: Row[] }[] = [
    { label: q ? '笔记' : '最近编辑', rows: noteGroup },
    { label: '命令', rows: commandRows },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="palette-root" role="presentation">
      <div className="dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="快速跳转与命令"
        className="palette-panel"
        onKeyDown={onPanelKeyDown}
      >
        <div className="border-b border-primary-dark/15 px-4 py-3 dark:border-dark-border">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-activedescendant={rows[activeIndex] ? optionId(rows[activeIndex]) : undefined}
            aria-autocomplete="list"
            aria-label="搜索笔记或输入命令"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="跳转到笔记，或输入命令…"
            // 刻意不用 .input：面板自己已经有边框，这里要一个干净的输入行
            className="w-full bg-transparent text-base text-ink outline-hidden placeholder:text-text-light dark:text-dark-text"
          />
        </div>

        <div
          ref={listRef}
          id={`${baseId}-list`}
          role="listbox"
          aria-label="结果"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="mb-1 last:mb-0">
              <div
                aria-hidden="true"
                className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-text-light"
              >
                {group.label}
              </div>
              <ul role="presentation" className="m-0 list-none p-0">
                {group.rows.map(renderRow)}
              </ul>
            </div>
          ))}
        </div>

        <div className="hidden items-center justify-between border-t border-primary-dark/15 px-4 py-2 text-xs text-text-light sm:flex dark:border-dark-border">
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span>{mod} K 随时唤起</span>
        </div>
      </div>
    </div>
  );
}

/** 命令面板：Ctrl/⌘+K 唤起，模糊跳转笔记、新建笔记、执行命令 */
const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  return <PaletteDialog {...rest} />;
};

export default CommandPalette;
