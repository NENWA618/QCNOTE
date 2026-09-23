// Background script for QCNOTE Web Clipper

chrome.runtime.onInstalled.addListener(function () {
  // 只在尚未配置时写入默认应用地址，避免更新扩展时覆盖用户的设置
  chrome.storage.sync.get(['noteUrl'], function (result) {
    if (!result.noteUrl) {
      chrome.storage.sync.set({ noteUrl: 'http://localhost:3000' });
    }
  });
});
