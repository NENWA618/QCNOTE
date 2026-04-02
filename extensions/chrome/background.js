// Background script for NOTE Web Clipper

chrome.runtime.onInstalled.addListener(function() {
  // Set default NOTE app URL
  chrome.storage.sync.set({
    noteUrl: 'http://localhost:3000'
  });
});

// Handle extension icon click
chrome.action.onClicked.addListener(function(tab) {
  // Could open a quick clip interface here
});