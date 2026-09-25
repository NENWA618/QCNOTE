---
name: 'qcnote-new-note'
description: "Create a new note, or append to an existing note, on qcnote.com (QCNOTE dashboard) in the user's own Chrome, then verify it saved."
---

# Create or update a note in QCNOTE

QCNOTE (https://qcnote.com/dashboard) keeps all notes in the browser's **local storage**; nothing is stored on a server. Only the user's own Chrome profile holds their notes. Do not replay screen coordinates; find elements by their visible text.

## Browser: always use Claude in Chrome, never the built-in browser

- **Do NOT use the built-in browser** (`Claude_Browser__*` tools), even though it is the preferred browser. It has its own separate profile, so QCNOTE opens there empty ("还没有笔记") and anything written there is lost to the user.
- Go straight to **Claude in Chrome** (`mcp__claude-in-chrome__*`).
  - When running in the Chrome side panel, the tools are already loaded and the current tab id is given in the tab context: skip ToolSearch and `tabs_context_mcp`, and use that tab if it is already on qcnote.com/dashboard.
  - Otherwise read the chrome-browser skill, then load the tools in ONE ToolSearch call:
    `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__browser_batch`
    then `tabs_context_mcp` with `createIfEmpty: true` → `navigate` that tab to https://qcnote.com/dashboard.
- Use `browser_batch` to chain steps (click → JS → screenshot) in one round trip.
- If Chrome is unreachable, tell the user that Chrome needs to be open with the Claude extension. Do not fall back to the built-in browser.
- Sanity check: the dashboard should show the user's note cards. If it says 还没有笔记 when notes should exist, you are in the wrong browser/profile. A 登录 button in the header is normal (notes are local, no sign-in needed); only stop and ask the user if a full login page blocks the dashboard.

## Inputs

- **Mode**: new note, or append to an existing note (by title)
- **Title** (new notes; default 新笔记)
- **Content**: Markdown/LaTeX, may be empty. For long content, write it to a local .md file first
- **Category** (new notes): 生活 / 工作 / 学习 / 灵感 / 其他 (default 生活)
- Optional: tags (comma-separated), color theme
  If the user gave none of these, ask once for title and content; otherwise use the defaults.

## Finding elements

Use `find` with plain descriptions, or the JS selectors below:

- "新建笔记 button" (toolbar, rightmost; shows as 新建 on narrow screens): opens an empty 编辑笔记 dialog with title 新笔记. 标签管理, 云端同步, 回收站, 导入/导出 live in the **⋯ 更多** menu, not on the toolbar
- "note card titled <Title>": clicking the card heading opens that note in the 编辑笔记 dialog, in edit mode
- Title input: `input[placeholder="笔记标题"]` (other text inputs exist on the page, e.g. 搜索笔记, so always use this selector)
- Tags input: `input[placeholder="标签1, 标签2, 标签3"]`
- Content: the only `textarea` on the page while the dialog is open
- "保存 button", "取消 button", "分类 select" (options 生活/工作/学习/灵感/其他), "预览 button"
- Dialog header buttons, left to right: (⏱️ 历史 — existing notes only) · 预览 · **删除** · 取消 · 保存. 删除 sits directly beside 取消 even on a brand-new note, so always click by `find` ref, never by position.

## Writing content reliably (what worked)

Typing long text or using form_input on the textarea is slow and fragile. Set the textarea with JavaScript through React's native setter, then fire an input event:

1. Encode the Markdown as a JS string literal: `python3 -c "import json;print(json.dumps(open('notes.md').read()))"`. This escapes backticks, quotes, newlines and emoji safely.
2. **Read the existing content first** (`document.querySelector('textarea').value`) and never overwrite it unless the user asked for that.
3. Run in `javascript_tool`:

```js
const add = <JSON string literal>;
const t = document.querySelector('textarea');
const orig = t.value;
if (orig.includes('<unique marker from add>')) { 'already appended' } else {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(t, orig.trimEnd() + '\n' + add);   // for a new note: setter.call(t, add)
  t.dispatchEvent(new Event('input', { bubbles: true }));
  ({ origLen: orig.length, newLen: t.value.length, keptOriginal: t.value.startsWith(orig.trimEnd()) })
}
```

Start appended content with `\n---\n\n# <heading>` so it is clearly separated. The marker check keeps a rerun from appending twice.

4. For a new note, set the title input (`input[placeholder="笔记标题"]`) the same way with the `HTMLInputElement.prototype` setter (this replaces the default 新笔记), and the tags input the same way if given. Choose the category with `form_input` on the 分类 select, and pick a color theme if requested.
5. Click **保存** (ref from `find`).

## Verify

1. `find` the card again: its date should now be today. For a new note, the sidebar's 统计信息 → 总笔记 count also goes up by one (the sidebar may be collapsed on narrow screens; skip this check there and rely on the card).
2. Reopen the card and check with JS: `textarea.value.length` matches the new length, the original opening text is still there, and the last section is present. Optionally click **预览** (the button then becomes 编辑) to confirm the Markdown and LaTeX render.
3. Close the dialog with **取消**. You already saved, so this discards nothing.
4. The ⏱️ 历史 (n) button keeps earlier versions, so the user can roll back.

## Dry run (testing the skill)

To test without leaving a note behind: open 新建笔记, set title and content via JS, click 预览, then 取消 without saving, and confirm with JS that no textarea remains and the test title is not on the page.

## Report back

One or two lines: which note, what was added, confirmation that the original content is intact and the save was verified. If saving failed or the card is missing, say what was on screen.

## Never

- Click 删除 in the dialog, 更多 → 清空所有笔记… (it prompts for typing 清空; never type it), or 更多 → 回收站 → empty
- Touch 更多 → 云端同步 or the WebDAV / OneDrive sync settings, or enter credentials there
- Replace existing note content unless the user asked for it
