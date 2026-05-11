// QCNOTE Web Clipper - Chrome Extension

document.addEventListener('DOMContentLoaded', function() {
  const clipPageBtn = document.getElementById('clipPage');
  const clipSelectionBtn = document.getElementById('clipSelection');
  const clipArticleBtn = document.getElementById('clipArticle');
  const statusDiv = document.getElementById('status');

  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.style.color = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#6b7280';
  }

  function sendToNote(data) {
    // Get QCNOTE app URL from storage or use default
    chrome.storage.sync.get(['noteUrl'], function(result) {
      const noteUrl = result.noteUrl || 'http://localhost:3000';

      fetch(`${noteUrl}/api/clip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })
      .then(response => {
        if (response.ok) {
          updateStatus('✓ 剪藏成功！', 'success');
        } else {
          throw new Error('剪藏失败');
        }
      })
      .catch(error => {
        console.error('Clipping failed:', error);
        updateStatus('✗ 剪藏失败，请检查 QCNOTE 应用是否运行', 'error');
      });
    });
  }

  clipPageBtn.addEventListener('click', function() {
    updateStatus('正在剪藏页面...');

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: clipEntirePage
      }, function(results) {
        if (results && results[0]) {
          sendToNote(results[0].result);
        }
      });
    });
  });

  clipSelectionBtn.addEventListener('click', function() {
    updateStatus('正在剪藏选中内容...');

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: clipSelection
      }, function(results) {
        if (results && results[0] && results[0].result) {
          sendToNote(results[0].result);
        } else {
          updateStatus('请先选中要剪藏的内容', 'error');
        }
      });
    });
  });

  clipArticleBtn.addEventListener('click', function() {
    updateStatus('正在剪藏文章...');

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: clipArticle
      }, function(results) {
        if (results && results[0]) {
          sendToNote(results[0].result);
        }
      });
    });
  });
});

// Content script functions
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
    clippedAt: new Date().toISOString()
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
    clippedAt: new Date().toISOString()
  };
}

function clipArticle() {
  // Try to find main article content
  const articleSelectors = [
    'article',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.content'
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
    clippedAt: new Date().toISOString()
  };
}