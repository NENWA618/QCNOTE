import { act, fireEvent, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';

/**
 * CodeMirror 是 contenteditable，jsdom 里没法像 <textarea> 那样 `fireEvent.change` / `user.type`。
 * 这里通过 CodeMirror 自己的 transaction 模拟输入，用 keydown 事件模拟按键。
 */

/** 可编辑元素（role=textbox，名称是“笔记内容”） */
export const editorContent = () => screen.getByRole('textbox', { name: '笔记内容' });

export function editorView(): EditorView {
  const view = EditorView.findFromDOM(editorContent().closest('.cm-editor') as HTMLElement);
  if (!view) throw new Error('找不到 CodeMirror 编辑器实例');
  return view;
}

export const editorText = () => editorView().state.doc.toString();

export const editorSelection = () => {
  const { from, to } = editorView().state.selection.main;
  return { from, to };
};

/** 整体替换内容并设置选区（默认光标在末尾），等价于用户输入后再选中 */
export function setContent(value: string, start = value.length, end = start) {
  act(() => {
    const view = editorView();
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: start, head: end },
      userEvent: 'input',
    });
  });
}

/** 在光标处逐字输入（每个字符一个 transaction，和真实输入一样） */
export async function typeText(text: string) {
  for (const ch of Array.from(text)) {
    await act(async () => {
      const view = editorView();
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: ch },
        selection: { anchor: from + ch.length },
        userEvent: 'input.type',
      });
    });
  }
}

/** 在编辑器上按键；返回 false 表示被 preventDefault（编辑器接管了这个键） */
export async function pressKey(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.keyDown(editorContent(), { key, ...init });
  });
  return notPrevented;
}
