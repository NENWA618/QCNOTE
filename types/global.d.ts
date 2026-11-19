/**
 * Global type augmentations for the QCNOTE application.
 *
 * This file is intentionally loaded by TypeScript through the project
 * include settings, so the declarations here are available globally.
 */

import type { HTMLAttributes } from 'react';
import NoteStorage from '@/lib/storage';
import type Utils from '@/lib/utils';

/**
 * Browser global Window extensions used by the app.
 *
 * `window.storage` is a shared runtime entry for the local note storage manager.
 * `window.Utils` exposes the shared helpers from `@/lib/utils`.
 */
declare global {
  interface Window {
    storage?: NoteStorage;
    Utils?: typeof Utils;
  }
}

/**
 * Extend React's built-in style element props so `styled-jsx` attributes
 * like `jsx` and `global` can be used without type errors.
 *
 * Next.js / styled-jsx do not expose these props through the default
 * React DOM type definitions, so we augment them here.
 */
declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}

export {};
