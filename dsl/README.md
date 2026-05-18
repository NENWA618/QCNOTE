# QCNOTE.js

**Fast · Light · Secure** — A purpose-built language for encrypted IndexedDB storage with TypeScript compilation.

---

## What is QCNOTE.js?

QCNOTE.js is a domain-specific language (DSL) and compiler toolchain designed for browser-side encrypted data storage. It compiles to TypeScript and targets the IndexedDB API, with AES-256-GCM field-level encryption baked in.

### Core Goals

| Goal       | How                                                                      |
| ---------- | ------------------------------------------------------------------------ |
| **Fast**   | Direct IDB cursor access, zero-copy reads, no ORM overhead               |
| **Light**  | No dependencies — uses only Web Crypto API + IndexedDB                   |
| **Secure** | AES-256-GCM per-field encryption, PBKDF2 key derivation, TTL auto-expiry |

---

## File Layout

```
qcnote-lexer.ts      ← Tokenizer (source → tokens)
qcnote-parser.ts     ← Parser (tokens → AST)
qcnote-compiler.ts   ← Code generator (AST → TypeScript)
qcnote-runtime.ts    ← Browser runtime (IDB + AES-256)
qcnote.ts            ← Public API + CLI entry point
example.qc           ← Example QCNOTE source file
```

---

## Language Reference

### Store Definition

```qcnote
store "name" {
  key: <field> [auto]      // Primary key; auto = autoIncrement
  field <name>: <type> [@index] [@secret]
  ttl: <duration>          // Auto-expire: 30d, 1h, 5m, 10s
}
```

**Field types:**

| Type   | TypeScript                | Notes            |
| ------ | ------------------------- | ---------------- |
| `str`  | `string`                  | UTF-8 text       |
| `num`  | `number`                  | Float64          |
| `bool` | `boolean`                 |                  |
| `json` | `Record<string, unknown>` | Arbitrary object |
| `bin`  | `Uint8Array`              | Binary data      |
| `date` | `Date`                    | ISO timestamps   |

**Field decorators:**

| Decorator | Effect                                 |
| --------- | -------------------------------------- |
| `@index`  | Creates an IDB index for fast querying |
| `@secret` | Field is AES-256-GCM encrypted at rest |

---

### DML Statements

#### Insert / Update

```qcnote
put <store> { field: value, ... }
```

#### Get by key

```qcnote
get <store>[<key>]
```

#### Get first match

```qcnote
get <store> where <condition>
```

#### Find all matches

```qcnote
find <store>
  [where <condition>]
  [limit <n>]
  [sort <field> asc|desc]
```

#### Delete

```qcnote
del <store>[<key>]
del <store> where <condition>
```

#### Clear store

```qcnote
clear <store>
```

#### Count

```qcnote
count <store> [where <condition>]
```

---

### WHERE Expressions

```qcnote
field = value           // Equality
field != value          // Not equal
field > value           // Greater than
field >= value
field < value
field <= value
field ~= "text"         // Substring match
field between A B       // Inclusive range
field := [a, b, c]      // IN array

// Boolean logic
cond1 and cond2
cond1 or cond2
not cond1
(cond1 or cond2) and cond3
```

---

### TTL Durations

| Suffix | Unit    |
| ------ | ------- |
| `s`    | seconds |
| `m`    | minutes |
| `h`    | hours   |
| `d`    | days    |
| `w`    | weeks   |

Example: `ttl: 7d`, `ttl: 30m`, `ttl: 2w`

---

### TypeScript Interop

```qcnote
// Raw TypeScript passthrough
ts: const x: number = 42;
ts: import { foo } from "./bar";

// Generate TypeScript type alias from store
export users as User
export documents as Document
```

---

## Usage

### Compile a `.qc` file to TypeScript

```bash
npx ts-node qcnote.ts --file schema.qc --out schema.generated.ts
```

### Use in code (programmatic)

```typescript
import { qcnote } from './qcnote';

const source = `
  store "notes" {
    key: id auto
    field title: str @index
    field body: str @secret
    ttl: 7d
  }

  put notes { title: "Hello", body: "Secret content" }
  find notes where title ~= "Hello" limit 5
`;

const { ts, stores, errors } = qcnote(source, {
  dbName: 'my_app',
  dbVersion: 1,
});

console.log(ts);
```

### Runtime (in browser)

```typescript
import { QCRuntime } from './qcnote-runtime';
import { _schema } from './schema.generated'; // from compiled output

const db = await QCRuntime.open('my_app', _schema, 1, 'my-secret-passphrase');

await db.put('notes', { title: 'Secret', body: 'Encrypted content' });

const notes = await db.find('notes', {
  where: { field: 'title', op: '~=', value: 'Secret' },
  limit: 10,
  sort: { field: 'title', dir: 'asc' },
});

console.log(notes); // body is auto-decrypted
```

---

## Security Model

1. **Key Derivation** — PBKDF2 with 100,000 iterations + SHA-256 → AES-256-GCM key
2. **Per-field encryption** — Only `@secret` fields are encrypted; indexes remain queryable
3. **IV freshness** — Random 96-bit IV per field per write; no IV reuse
4. **TTL expiry** — Expired records are rejected on read and purged on `db.purgeExpired()`
5. **Salt persistence** — Derived salt stored in `localStorage`; passphrase never stored

---

## Architecture

```
Source (.qc)
    │
    ▼
 QCLexer          tokenize()     → Token[]
    │
    ▼
 QCParser         parse()        → QCNode[] (AST)
    │
    ▼
 QCCompiler       compile()      → TypeScript string
    │
    ▼
 TypeScript Compiler (tsc)       → JavaScript
    │
    ▼
 QCRuntime (browser)             → IndexedDB + AES-256
```

---

## License

MIT — QCNOTE.js is free to use, modify, and distribute.
