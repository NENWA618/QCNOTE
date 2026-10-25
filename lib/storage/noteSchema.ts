import type { QCStoreSchema } from '../../qcruntime/qcnote-runtime';

export const NOTE_STORE_SCHEMA: QCStoreSchema = {
  name: 'notes',
  keyField: 'id',
  keyAuto: false,
  fields: [
    // Everything the user wrote, or that is derived from it, is secret:
    // title/content, but also their version history, tags, category, the
    // [[titles]] they link to, text colouring and sentiment. Only ids,
    // timestamps, flags and the note colour stay in plaintext. (A field
    // missing from this list is stored as-is, so new note fields that carry
    // user content must be added here.)
    { name: 'id', type: 'str', indexed: true, secret: false },
    { name: 'title', type: 'str', indexed: false, secret: true },
    { name: 'content', type: 'str', indexed: false, secret: true },
    // `indexed` only affects databases created from now on; an index on
    // ciphertext is useless, and existing databases keep a harmless one.
    { name: 'category', type: 'str', indexed: false, secret: true },
    { name: 'tags', type: 'json', indexed: false, secret: true },
    { name: 'color', type: 'str', indexed: false, secret: false },
    { name: 'coloredRanges', type: 'json', indexed: false, secret: true },
    { name: 'createdAt', type: 'num', indexed: false, secret: false },
    { name: 'updatedAt', type: 'num', indexed: false, secret: false },
    { name: 'links', type: 'json', indexed: false, secret: true },
    { name: 'backlinks', type: 'json', indexed: false, secret: false },
    { name: 'versions', type: 'json', indexed: false, secret: true },
    { name: 'sentimentScore', type: 'num', indexed: false, secret: true },
    { name: 'sentimentComparative', type: 'num', indexed: false, secret: true },
    { name: 'sentimentCategory', type: 'str', indexed: false, secret: true },
    { name: 'isDeleted', type: 'bool', indexed: false, secret: false },
    { name: 'deletedAt', type: 'num', indexed: false, secret: false },
    { name: 'ownerId', type: 'str', indexed: true, secret: false },
  ],
};
