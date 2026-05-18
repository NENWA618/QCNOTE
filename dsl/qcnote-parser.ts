/**
 * QCNOTE.js — Parser
 * Produces an AST from the token stream
 */

import { Token, TokenType, QCLexer } from './qcnote-lexer';

// ─── AST Node Types ──────────────────────────────────────────────────────────

export type FieldType = 'str' | 'num' | 'bool' | 'json' | 'bin' | 'date';

export interface FieldDef {
  kind: 'FieldDef';
  name: string;
  type: FieldType;
  indexed: boolean;
  secret: boolean;
}

export interface StoreDef {
  kind: 'StoreDef';
  name: string;
  keyField: string;
  keyAuto: boolean;
  fields: FieldDef[];
  ttl?: string; // e.g., "7d"
}

export type CompareOp = '=' | '!=' | '<' | '<=' | '>' | '>=' | '~=' | 'between' | 'in' | 'like';

export interface Condition {
  kind: 'Condition';
  field: string;
  op: CompareOp;
  value: QCValue | [QCValue, QCValue]; // between uses tuple
}

export type LogicOp = 'and' | 'or';

export interface LogicExpr {
  kind: 'LogicExpr';
  op: LogicOp;
  left: WhereExpr;
  right: WhereExpr;
}

export interface NotExpr {
  kind: 'NotExpr';
  expr: WhereExpr;
}

export type WhereExpr = Condition | LogicExpr | NotExpr;

export type QCValue = string | number | boolean | null | QCValue[];

export interface PutStmt {
  kind: 'PutStmt';
  store: string;
  record: Record<string, QCValue>;
}

export interface GetStmt {
  kind: 'GetStmt';
  store: string;
  byKey?: QCValue; // get users[42]
  where?: WhereExpr; // get users where email = "..."
  limit?: number;
  sort?: { field: string; dir: 'asc' | 'desc' };
}

export interface FindStmt {
  kind: 'FindStmt';
  store: string;
  where?: WhereExpr;
  limit?: number;
  sort?: { field: string; dir: 'asc' | 'desc' };
}

export interface DelStmt {
  kind: 'DelStmt';
  store: string;
  byKey?: QCValue;
  where?: WhereExpr;
}

export interface ClearStmt {
  kind: 'ClearStmt';
  store: string;
}

export interface CountStmt {
  kind: 'CountStmt';
  store: string;
  where?: WhereExpr;
}

export interface ExportStmt {
  kind: 'ExportStmt';
  store: string;
  alias: string;
}

export interface RawTSStmt {
  kind: 'RawTSStmt';
  code: string;
}

export type QCNode =
  | StoreDef
  | PutStmt
  | GetStmt
  | FindStmt
  | DelStmt
  | ClearStmt
  | CountStmt
  | ExportStmt
  | RawTSStmt;

// ─── Parser ──────────────────────────────────────────────────────────────────

export class QCParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter(
      (t) => t.type !== TokenType.COMMENT && t.type !== TokenType.NEWLINE,
    );
  }

  parse(): QCNode[] {
    const nodes: QCNode[] = [];
    while (!this.atEnd()) {
      nodes.push(this.parseStatement());
    }
    return nodes;
  }

  // ── Statements ──────────────────────────────────────────────────────────

  private parseStatement(): QCNode {
    const tok = this.peek();
    switch (tok.type) {
      case TokenType.STORE:
        return this.parseStoreDef();
      case TokenType.PUT:
        return this.parsePut();
      case TokenType.GET:
        return this.parseGet();
      case TokenType.FIND:
        return this.parseFind();
      case TokenType.DEL:
        return this.parseDel();
      case TokenType.CLEAR:
        return this.parseClear();
      case TokenType.COUNT:
        return this.parseCount();
      case TokenType.EXPORT:
        return this.parseExport();
      case TokenType.TS: {
        this.consume(TokenType.TS);
        const code = this.consume(TokenType.RAW_TS).value;
        return { kind: 'RawTSStmt', code };
      }
      default:
        throw new Error(`[QCNOTE] Unexpected token '${tok.value}' at line ${tok.line}:${tok.col}`);
    }
  }

  // ── Store Definition ─────────────────────────────────────────────────────

  private parseStoreDef(): StoreDef {
    this.consume(TokenType.STORE);
    const name = this.consumeIdent();
    this.consume(TokenType.LBRACE);

    let keyField = 'id';
    let keyAuto = false;
    const fields: FieldDef[] = [];
    let ttl: string | undefined;

    while (!this.check(TokenType.RBRACE)) {
      if (this.check(TokenType.KEY)) {
        this.consume(TokenType.KEY);
        this.consume(TokenType.COLON);
        keyField = this.consumeIdent();
        if (this.check(TokenType.AUTO)) {
          this.consume(TokenType.AUTO);
          keyAuto = true;
        }
      } else if (this.check(TokenType.FIELD)) {
        this.consume(TokenType.FIELD);
        const fname = this.consumeIdent();
        this.consume(TokenType.COLON);
        const ftype = this.parseFieldType();
        let indexed = false;
        let secret = false;
        while (this.check(TokenType.INDEX) || this.check(TokenType.SECRET)) {
          if (this.check(TokenType.INDEX)) {
            this.consume(TokenType.INDEX);
            indexed = true;
          }
          if (this.check(TokenType.SECRET)) {
            this.consume(TokenType.SECRET);
            secret = true;
          }
        }
        fields.push({ kind: 'FieldDef', name: fname, type: ftype, indexed, secret });
      } else if (this.check(TokenType.TTL)) {
        this.consume(TokenType.TTL);
        this.consume(TokenType.COLON);
        ttl = this.consume(TokenType.TTL_DURATION).value;
      } else {
        break;
      }
    }

    this.consume(TokenType.RBRACE);
    return { kind: 'StoreDef', name, keyField, keyAuto, fields, ttl };
  }

  // ── DML Statements ───────────────────────────────────────────────────────

  private parsePut(): PutStmt {
    this.consume(TokenType.PUT);
    const store = this.consumeIdent();
    const record = this.parseRecord();
    return { kind: 'PutStmt', store, record };
  }

  private parseGet(): GetStmt {
    this.consume(TokenType.GET);
    const store = this.consumeIdent();

    // get users[42]
    if (this.check(TokenType.LBRACKET)) {
      this.consume(TokenType.LBRACKET);
      const key = this.parseLiteral();
      this.consume(TokenType.RBRACKET);
      return { kind: 'GetStmt', store, byKey: key };
    }

    let where: WhereExpr | undefined;
    let limit: number | undefined;
    let sort: { field: string; dir: 'asc' | 'desc' } | undefined;

    if (this.check(TokenType.WHERE)) {
      this.consume(TokenType.WHERE);
      where = this.parseWhereExpr();
    }
    if (this.check(TokenType.LIMIT)) {
      this.consume(TokenType.LIMIT);
      limit = Number(this.consume(TokenType.NUMBER).value);
    }
    if (this.check(TokenType.SORT)) {
      this.consume(TokenType.SORT);
      const field = this.consumeIdent();
      const dir = this.check(TokenType.DESC)
        ? (this.consume(TokenType.DESC), 'desc')
        : (this.tryConsume(TokenType.ASC), 'asc');
      sort = { field, dir: dir as 'asc' | 'desc' };
    }

    return { kind: 'GetStmt', store, where, limit, sort };
  }

  private parseFind(): FindStmt {
    this.consume(TokenType.FIND);
    const store = this.consumeIdent();

    let where: WhereExpr | undefined;
    let limit: number | undefined;
    let sort: { field: string; dir: 'asc' | 'desc' } | undefined;

    if (this.check(TokenType.WHERE)) {
      this.consume(TokenType.WHERE);
      where = this.parseWhereExpr();
    }
    if (this.check(TokenType.LIMIT)) {
      this.consume(TokenType.LIMIT);
      limit = Number(this.consume(TokenType.NUMBER).value);
    }
    if (this.check(TokenType.SORT)) {
      this.consume(TokenType.SORT);
      const field = this.consumeIdent();
      const dir = this.check(TokenType.DESC)
        ? (this.consume(TokenType.DESC), 'desc')
        : (this.tryConsume(TokenType.ASC), 'asc');
      sort = { field, dir: dir as 'asc' | 'desc' };
    }

    return { kind: 'FindStmt', store, where, limit, sort };
  }

  private parseDel(): DelStmt {
    this.consume(TokenType.DEL);
    const store = this.consumeIdent();

    if (this.check(TokenType.LBRACKET)) {
      this.consume(TokenType.LBRACKET);
      const key = this.parseLiteral();
      this.consume(TokenType.RBRACKET);
      return { kind: 'DelStmt', store, byKey: key };
    }

    let where: WhereExpr | undefined;
    if (this.check(TokenType.WHERE)) {
      this.consume(TokenType.WHERE);
      where = this.parseWhereExpr();
    }
    return { kind: 'DelStmt', store, where };
  }

  private parseClear(): ClearStmt {
    this.consume(TokenType.CLEAR);
    const store = this.consumeIdent();
    return { kind: 'ClearStmt', store };
  }

  private parseCount(): CountStmt {
    this.consume(TokenType.COUNT);
    const store = this.consumeIdent();
    let where: WhereExpr | undefined;
    if (this.check(TokenType.WHERE)) {
      this.consume(TokenType.WHERE);
      where = this.parseWhereExpr();
    }
    return { kind: 'CountStmt', store, where };
  }

  private parseExport(): ExportStmt {
    this.consume(TokenType.EXPORT);
    const store = this.consumeIdent();
    this.consume(TokenType.AS);
    const alias = this.consumeIdent();
    return { kind: 'ExportStmt', store, alias };
  }

  // ── WHERE clause ─────────────────────────────────────────────────────────

  private parseWhereExpr(): WhereExpr {
    return this.parseOr();
  }

  private parseOr(): WhereExpr {
    let left = this.parseAnd();
    while (this.check(TokenType.OR)) {
      this.consume(TokenType.OR);
      const right = this.parseAnd();
      left = { kind: 'LogicExpr', op: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): WhereExpr {
    let left = this.parseNot();
    while (this.check(TokenType.AND)) {
      this.consume(TokenType.AND);
      const right = this.parseNot();
      left = { kind: 'LogicExpr', op: 'and', left, right };
    }
    return left;
  }

  private parseNot(): WhereExpr {
    if (this.check(TokenType.NOT)) {
      this.consume(TokenType.NOT);
      return { kind: 'NotExpr', expr: this.parseCondition() };
    }
    return this.parseCondition();
  }

  private parseCondition(): WhereExpr {
    if (this.check(TokenType.LPAREN)) {
      this.consume(TokenType.LPAREN);
      const expr = this.parseWhereExpr();
      this.consume(TokenType.RPAREN);
      return expr;
    }

    const field = this.consumeIdent();
    const op = this.parseOp();

    if (op === 'between') {
      const a = this.parseLiteral();
      this.consumeIdent(); // 'and'
      const b = this.parseLiteral();
      return { kind: 'Condition', field, op, value: [a, b] };
    }

    const value = this.parseLiteral();
    return { kind: 'Condition', field, op, value };
  }

  private parseOp(): CompareOp {
    const t = this.peek();
    switch (t.type) {
      case TokenType.EQ:
        this.advance();
        return '=';
      case TokenType.NEQ:
        this.advance();
        return '!=';
      case TokenType.LT:
        this.advance();
        return '<';
      case TokenType.LTE:
        this.advance();
        return '<=';
      case TokenType.GT:
        this.advance();
        return '>';
      case TokenType.GTE:
        this.advance();
        return '>=';
      case TokenType.LIKE:
        this.advance();
        return '~=';
      case TokenType.BETWEEN:
        this.advance();
        return 'between';
      case TokenType.IN:
        this.advance();
        return 'in';
      default:
        throw new Error(`[QCNOTE] Expected operator at line ${t.line}:${t.col}, got '${t.value}'`);
    }
  }

  // ── Value / Record parsing ────────────────────────────────────────────────

  private parseRecord(): Record<string, QCValue> {
    this.consume(TokenType.LBRACE);
    const rec: Record<string, QCValue> = {};
    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdent();
      this.consume(TokenType.COLON);
      rec[key] = this.parseLiteral();
      this.tryConsume(TokenType.COMMA);
    }
    this.consume(TokenType.RBRACE);
    return rec;
  }

  private parseLiteral(): QCValue {
    const t = this.peek();
    switch (t.type) {
      case TokenType.STRING:
        this.advance();
        return t.value;
      case TokenType.NUMBER:
        this.advance();
        return Number(t.value);
      case TokenType.BOOLEAN:
        this.advance();
        return t.value === 'true';
      case TokenType.NULL:
        this.advance();
        return null;
      case TokenType.LBRACKET: {
        // Array literal: [1, 2, 3]
        this.advance();
        const arr: QCValue[] = [];
        while (!this.check(TokenType.RBRACKET)) {
          arr.push(this.parseLiteral());
          this.tryConsume(TokenType.COMMA);
        }
        this.consume(TokenType.RBRACKET);
        return arr;
      }
      default:
        throw new Error(
          `[QCNOTE] Expected literal value at line ${t.line}:${t.col}, got '${t.value}'`,
        );
    }
  }

  private parseFieldType(): FieldType {
    const t = this.peek();
    const map: Partial<Record<TokenType, FieldType>> = {
      [TokenType.TYPE_STR]: 'str',
      [TokenType.TYPE_NUM]: 'num',
      [TokenType.TYPE_BOOL]: 'bool',
      [TokenType.TYPE_JSON]: 'json',
      [TokenType.TYPE_BIN]: 'bin',
      [TokenType.TYPE_DATE]: 'date',
    };
    const ft = map[t.type];
    if (!ft) throw new Error(`[QCNOTE] Unknown field type '${t.value}' at line ${t.line}`);
    this.advance();
    return ft;
  }

  // ── Token utilities ───────────────────────────────────────────────────────

  private consumeIdent(): string {
    const t = this.peek();
    // Allow keyword tokens as identifiers (field names, store names)
    this.advance();
    return t.value;
  }

  private consume(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new Error(
        `[QCNOTE] Expected ${type} but got '${t.value}' (${t.type}) at line ${t.line}:${t.col}`,
      );
    }
    return this.advance();
  }

  private tryConsume(type: TokenType): Token | null {
    if (this.check(type)) return this.advance();
    return null;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', line: 0, col: 0 };
  }

  private advance(): Token {
    return this.tokens[this.pos++] ?? { type: TokenType.EOF, value: '', line: 0, col: 0 };
  }

  private atEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }
}

// ── Convenience parse function ───────────────────────────────────────────────

export function parseQCNOTE(source: string): QCNode[] {
  const tokens = new QCLexer(source).tokenize();
  return new QCParser(tokens).parse();
}
