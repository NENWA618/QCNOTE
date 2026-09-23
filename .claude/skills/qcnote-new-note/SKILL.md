---
name: 'qcnote-new-note'
description: "Create a new note, or append to an existing note, on qcnote.com (QCNOTE dashboard) in the user's own Chrome, then verify it saved."
---

# Create or update a note in QCNOTE

QCNOTE (https://qcnote.com/dashboard) keeps all notes in the browser's **local storage**; nothing is stored on a server. Only the user's own Chrome profile holds their notes. Do not replay screen coordinates; find elements by their visible text.

## Browser: always use Claude in Chrome, never the built-in browser

- **Do NOT use the built-in browser** (`Claude_Browser__*` tools), even though it is the preferred browser. It has its own separate profile, so QCNOTE opens there empty ("还没有笔记") and anything written there is lost to the user.
- Go straight to **Claude in Chrome** (`mcp__claude-in-chrome__*`). Read the chrome-browser skill, then load the tools in ONE ToolSearch call:
  `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text`
- `tabs_context_mcp` with `createIfEmpty: true` → `navigate` that tab to https://qcnote.com/dashboard.
- If Chrome is unreachable, tell the user that Chrome needs to be open with the Claude extension. Do not fall back to the built-in browser.
- Sanity check: the dashboard should show the user's note cards. If it says 还没有笔记 when notes should exist, you are in the wrong browser/profile. If a login page appears, stop and ask the user to sign in.

## Inputs

- **Mode**: new note, or append to an existing note (by title)
- **Title** (new notes; default 新笔记)
- **Content**: Markdown/LaTeX, may be empty. For long content, write it to a local .md file first
- **Category** (new notes): 生活 / 学习 / 其他 … (default 生活)
- Optional: color theme

If the user gave none of these, ask once for title and content; otherwise use the defaults.

## Finding elements

Use `find` with plain descriptions:

- "新建笔记 button" (toolbar, next to 标签管理): opens an empty 编辑笔记 dialog
- "note card titled <Title>": clicking the card heading opens that note in the 编辑笔记 dialog, in edit mode
- "note content textarea in edit dialog", "保存 button", "取消 button", "分类 select"

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

Start appended content with `\n---\n\n# <heading>` so it is clearly separated. The marker check keeps a rerun from appending twice. 4. For a new note, set the 标题 input the same way (use the `HTMLInputElement.prototype` setter and clear the default text), choose the category with `form_input` on the 分类 select, and pick a color theme if requested. 5. Click **保存** (ref from `find`).

## Verify

1. `find` the card again: its date should now be today. For a new note, the 统计信息 → 总笔记 count also goes up by one.
2. Reopen the card and check with JS: `textarea.value.length` matches the new length, the original opening text is still there, and the last section is present. Optionally click **预览** to confirm the Markdown renders.
3. Close the dialog with **取消**. You already saved, so this discards nothing.
4. The 历史 button keeps earlier versions, so the user can roll back.

## Report back

One or two lines: which note, what was added, confirmation that the original content is intact and the save was verified. If saving failed or the card is missing, say what was on screen.

## Never

- Click 清空所有, 删除, or 回收站 → empty
- Touch the WebDAV / OneDrive sync settings or enter credentials there
- Replace existing note content unless the user asked for it
