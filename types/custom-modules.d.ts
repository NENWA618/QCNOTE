declare module 'react-diff-viewer-continued' {
  const ReactDiffViewer: any;
  export default ReactDiffViewer;
}

declare module 'axe-playwright' {
  export function injectAxe(...args: any[]): any;
  export function checkA11y(...args: any[]): any;
}
