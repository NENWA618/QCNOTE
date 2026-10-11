// Provide basic type declarations for fake-indexeddb to appease TypeScript
// Vitest setup imports from 'fake-indexeddb/auto' which doesn't have its own types.

declare module 'fake-indexeddb';
declare module 'fake-indexeddb/auto';
