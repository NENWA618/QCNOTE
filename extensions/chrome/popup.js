// QCNOTE Web Clipper - popup (Chrome MV3 / Firefox MV2 共用同一份代码)

const DEFAULT_NOTE_URL = 'http://localhost:3000';
// 与 QCNOTE 应用 lib/clipImport.ts 中的 MAX_CLIP_CONTENT_LENGTH / CLIP_HASH_KEY 保持一致
const MAX_CONTENT_LENGTH = 100000;
const CLIP_HASH_KEY = 'qcnote-clip';

document.addEventListener('DOMContentLoaded', function () {
  const clipPageBtn = document.getElementById('clipPage');
  const clipSelectionBtn = document.getElementById('clipSelection');
  const clipArticleBtn = document.getElementById('clipArticle');
  const noteUrlInput = document.getElementById('noteUrl');
  const saveUrlBtn = document.getElementById('saveUrl');
  const statusDiv = document.getElementById('status');

  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.style.color =
      type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#6b7280';
  }

  // 只接受 http(s) 地址，去掉末尾斜杠；无效返回 null
  function normalizeNoteUrl(value) {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.origin + url.pathname.replace(/\/+$/, '');
    } catch (e) {
      return null;
    }
  }

  function getNoteUrl(callback) {
    chrome.storage.sync.get(['noteUrl'], function (result) {
      callback(normalizeNoteUrl(result.noteUrl || '') || DEFAULT_NOTE_URL);
    });
  }

  function toBase64Url(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(function (b) {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // QCNOTE 的笔记存在浏览器本地（IndexedDB），服务器上没有可写的笔记库，
  // 所以把剪藏放进 URL hash（不会发往服务器）并打开应用页，由页面确认后写入本地。
  function sendToNote(data) {
    const clip = Object.assign({}, data, {
      content: String(data.content || '').slice(0, MAX_CONTENT_LENGTH),
    });
    getNoteUrl(function (noteUrl) {
      const url = `${noteUrl}/dashboard#${CLIP_HASH_KEY}=${toBase64Url(clip)}`;
      chrome.tabs.create({ url: url }, function () {
        if (chrome.runtime.lastError) {
          updateStatus('✗ 无法打开 QCNOTE：' + chrome.runtime.lastError.message, 'error');
        } else {
          updateStatus('✓ 已在 QCNOTE 中打开，请确认保存', 'success');
        }
      });
    });
  }

  // Chrome MV3 用 chrome.scripting；Firefox MV2 用 chrome.tabs.executeScript。
  // 回调统一收到该函数的返回值（出错或受限页面时为 undefined）。
  function runInActiveTab(fn, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const tab = tabs && tabs[0];
      if (!tab) return callback(undefined);
      const done = function (value) {
        callback(chrome.runtime.lastError ? undefined : value);
      };
      if (chrome.scripting && chrome.scripting.executeScript) {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn }, function (results) {
          done(results && results[0] ? results[0].result : undefined);
        });
      } else {
        chrome.tabs.executeScript(tab.id, { code: `(${fn.toString()})()` }, function (results) {
          done(results ? results[0] : undefined);
        });
      }
    });
  }

  function clipWith(fn, progressMessage, emptyMessage) {
    updateStatus(progressMessage);
    runInActiveTab(fn, function (data) {
      if (data) {
        sendToNote(data);
      } else {
        updateStatus(emptyMessage, 'error');
      }
    });
  }

  const cannotClip = '无法剪藏此页面（浏览器内置页面或商店页面不允许）';
  clipPageBtn.addEventListener('click', function () {
    clipWith(clipEntirePage, '正在剪藏页面...', cannotClip);
  });
  clipSelectionBtn.addEventListener('click', function () {
    clipWith(clipSelection, '正在剪藏选中内容...', '请先选中要剪藏的内容');
  });
  clipArticleBtn.addEventListener('click', function () {
    clipWith(clipArticle, '正在剪藏文章...', cannotClip);
  });

  getNoteUrl(function (noteUrl) {
    noteUrlInput.value = noteUrl;
  });
  saveUrlBtn.addEventListener('click', function () {
    const normalized = normalizeNoteUrl(noteUrlInput.value);
    if (!normalized) {
      updateStatus('请输入有效的 http(s) 地址', 'error');
      return;
    }
    chrome.storage.sync.set({ noteUrl: normalized }, function () {
      noteUrlInput.value = normalized;
      updateStatus('✓ 应用地址已保存', 'success');
    });
  });
});

// 以下函数会被注入到网页中执行，必须自包含（不能引用弹窗里的其他变量）
function clipEntirePage() {
  const title = document.title;
  const url = window.location.href;
  const content = document.body.innerText;

  return {
    title: `网页剪藏: ${title}`,
    content: `来源: ${url}\n\n${content}`,
    category: '网页剪藏',
    tags: ['网页剪藏', new URL(url).hostname],
    url: url,
    clippedAt: new Date().toISOString(),
  };
}

function clipSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const selectedText = selection.toString().trim();
  if (!selectedText) return null;

  const title = document.title;
  const url = window.location.href;

  return {
    title: `选中文本: ${title}`,
    content: `来源: ${url}\n\n选中文本:\n${selectedText}`,
    category: '网页剪藏',
    tags: ['网页剪藏', '选中文本', new URL(url).hostname],
    url: url,
    clippedAt: new Date().toISOString(),
  };
}

function clipArticle() {
  const articleSelectors = [
    'article',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.content',
  ];

  let articleElement = null;
  for (const selector of articleSelectors) {
    articleElement = document.querySelector(selector);
    if (articleElement) break;
  }

  const title = document.title || '无标题文章';
  const url = window.location.href;
  const content = articleElement ? articleElement.innerText : document.body.innerText;

  return {
    title: `文章剪藏: ${title}`,
    content: `来源: ${url}\n\n${content}`,
    category: '网页剪藏',
    tags: ['网页剪藏', '文章', new URL(url).hostname],
    url: url,
    clippedAt: new Date().toISOString(),
  };
}
