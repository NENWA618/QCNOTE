import { useSyncExternalStore } from 'react';

const subscribeNothing = () => () => {};

/**
 * 快捷键提示里“修饰键”的写法：苹果设备上是 ⌘，其他是 Ctrl。
 * 服务端渲染和首次水合时固定为 Ctrl，水合后再换成真实平台，避免 HTML 不一致。
 */
export function useModKeyLabel(): 'Ctrl' | '⌘' {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'),
    () => 'Ctrl',
  );
}
