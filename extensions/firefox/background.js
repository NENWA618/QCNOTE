// Background script for QCNOTE Web Clipper

chrome.runtime.onInstalled.addListener(function() {
  // Set default QCNOTE app URL
  chrome.storage.sync.set({
    noteUrl: 'http://localhost:3000'
  });
});

// Handle extension icon click
chrome.action.onClicked.addListener(function(tab) {
  // Could open a quick clip interface here
});