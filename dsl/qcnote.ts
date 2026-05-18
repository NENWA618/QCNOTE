/**
 * QCNOTE.js — Public API & CLI
 * Entry point for the QCNOTE.js language toolchain
 */

export { QCLexer, TokenType } from './qcnote-lexer';
export type { Token } from './qcnote-lexer';

export { QCParser, parseQCNOTE } from './qcnote-parser';
export type {
  QCNode,
  StoreDef,
  FieldDef,
  FieldType,
  PutStmt,
  GetStmt,
  FindStmt,
  DelStmt,
  ClearStmt,
  CountStmt,
  ExportStmt,
  RawTSStmt,
  WhereExpr,
  QCValue,
} from './qcnote-parser';

export { QCCompiler, compileQCNOTE } from './qcnote-compiler';
export type { CompilerOptions } from './qcnote-compiler';

export { QCRuntime, QCDb, deriveKey } from './qcnote-runtime';
export type {
  QCStoreSchema,
  QCFieldSchema,
  QCQueryOpts,
  QCWhere,
  QCCondition,
} from './qcnote-runtime';

// ─── High-level compile pipeline ─────────────────────────────────────────────

import { QCLexer } from './qcnote-lexer';
import { QCParser } from './qcnote-parser';
import { QCCompiler, CompilerOptions } from './qcnote-compiler';

export interface CompileResult {
  ts: string;
  stores: string[];
  errors: string[];
}

export function qcnote(source: string, opts: CompilerOptions = {}): CompileResult {
  const errors: string[] = [];
  try {
    const tokens = new QCLexer(source).tokenize();
    const ast = new QCParser(tokens).parse();
    const ts = new QCCompiler(opts).compile(ast);
    const stores = ast.filter((n) => n.kind === 'StoreDef').map((n) => (n as any).name);
    return { ts, stores, errors };
  } catch (e) {
    errors.push(String(e));
    return { ts: '', stores: [], errors };
  }
}

// ─── CLI (Node.js) ────────────────────────────────────────────────────────────

// Run: npx ts-node qcnote.ts --file schema.qc --out schema.ts

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('qcnote.ts')) {
  (async () => {
    const { readFileSync, writeFileSync } = await import('fs');
    const { resolve } = await import('path');

    const args = process.argv.slice(2);
    const get = (flag: string) => {
      const i = args.indexOf(flag);
      return i !== -1 ? args[i + 1] : null;
    };

    const file = get('--file') ?? get('-f');
    const out = get('--out') ?? get('-o');
    const dbName = get('--db') ?? undefined;
    const version = get('--version') ? Number(get('--version')) : undefined;

    if (!file) {
      console.error(
        'Usage: qcnote --file <input.qc> [--out <output.ts>] [--db <name>] [--version <n>]',
      );
      process.exit(1);
    }

    const source = readFileSync(resolve(file), 'utf-8');
    const result = qcnote(source, { dbName, dbVersion: version });

    if (result.errors.length) {
      console.error('QCNOTE compile errors:');
      result.errors.forEach((e) => console.error(' ✗', e));
      process.exit(1);
    }

    if (out) {
      writeFileSync(resolve(out), result.ts, 'utf-8');
      console.log(`✓ QCNOTE compiled → ${out}`);
      console.log(`  Stores: ${result.stores.join(', ')}`);
    } else {
      console.log(result.ts);
    }
  })();
}
