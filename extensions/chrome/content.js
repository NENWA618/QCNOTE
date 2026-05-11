// Content script for highlighting selectable content

// Add some basic styling for selection
const style = document.createElement('style');
style.textContent = `
  .note-clipper-selection {
    background-color: rgba(59, 130, 246, 0.1) !important;
    border: 2px solid #3b82f6 !important;
  }
`;
document.head.appendChild(style);

// Listen for selection changes to provide visual feedback
document.addEventListener('selectionchange', function() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    // Could add visual feedback for selectable content
  }
});