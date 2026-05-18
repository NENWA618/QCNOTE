/**
 * QCNOTE.js — A purpose-built language for encrypted IndexedDB storage & TypeScript compilation
 * Philosophy: Fast · Light · Secure
 *
 * QCNOTE Syntax Overview:
 *
 *  store "users" {              // Define an encrypted store
 *    key: id auto               // Primary key (auto-increment)
 *    field name: str            // Typed field
 *    field age: num
 *    field email: str @index    // Indexed field
 *    field token: str @secret   // AES-256 encrypted field
 *    field meta: json           // JSON blob field
 *    ttl: 7d                    // Auto-expire records after 7 days
 *  }
 *
 *  put users { name: "Alice", age: 30, email: "a@b.com" }   // Insert/update
 *  get users where email = "a@b.com"                         // Query by index
 *  get users[42]                                             // Get by key
 *  find users where age > 25 limit 10 sort age desc         // Range query
 *  del users where id = 5                                    // Delete
 *  clear users                                               // Wipe store
 *  count users where age > 18                                // Count
 *
 *  // TypeScript interop
 *  ts: const x = 1 + 2;        // Raw TS passthrough
 *  export users as UserModel   // Generate TS interface
 */

// ─── Token Types ────────────────────────────────────────────────────────────

export enum TokenType {
  // Keywords
  STORE = 'STORE',
  KEY = 'KEY',
  FIELD = 'FIELD',
  INDEX = 'INDEX',
  SECRET = 'SECRET',
  AUTO = 'AUTO',
  TTL = 'TTL',
  PUT = 'PUT',
  GET = 'GET',
  FIND = 'FIND',
  DEL = 'DEL',
  CLEAR = 'CLEAR',
  COUNT = 'COUNT',
  WHERE = 'WHERE',
  LIMIT = 'LIMIT',
  SORT = 'SORT',
  ASC = 'ASC',
  DESC = 'DESC',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  EXPORT = 'EXPORT',
  AS = 'AS',
  TS = 'TS',

  // Types
  TYPE_STR = 'TYPE_STR',
  TYPE_NUM = 'TYPE_NUM',
  TYPE_BOOL = 'TYPE_BOOL',
  TYPE_JSON = 'TYPE_JSON',
  TYPE_BIN = 'TYPE_BIN',
  TYPE_DATE = 'TYPE_DATE',

  // Literals
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',
  TTL_DURATION = 'TTL_DURATION', // e.g. 7d, 1h, 30m

  // Identifiers
  IDENT = 'IDENT',
  RAW_TS = 'RAW_TS', // raw TypeScript passthrough

  // Operators
  EQ = 'EQ', // =
  NEQ = 'NEQ', // !=
  LT = 'LT', // <
  LTE = 'LTE', // <=
  GT = 'GT', // >
  GTE = 'GTE', // >=
  LIKE = 'LIKE', // ~=  (substring match)
  BETWEEN = 'BETWEEN', // ><  (range)
  IN = 'IN', // :=  (array contains)

  // Delimiters
  LBRACE = 'LBRACE', // {
  RBRACE = 'RBRACE', // }
  LBRACKET = 'LBRACKET', // [
  RBRACKET = 'RBRACKET', // ]
  LPAREN = 'LPAREN', // (
  RPAREN = 'RPAREN', // )
  COLON = 'COLON', // :
  COMMA = 'COMMA', // ,
  DOT = 'DOT', // .
  AT = 'AT', // @

  // Meta
  COMMENT = 'COMMENT',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ─── Lexer ───────────────────────────────────────────────────────────────────

const KEYWORDS: Record<string, TokenType> = {
  store: TokenType.STORE,
  key: TokenType.KEY,
  field: TokenType.FIELD,
  auto: TokenType.AUTO,
  ttl: TokenType.TTL,
  put: TokenType.PUT,
  get: TokenType.GET,
  find: TokenType.FIND,
  del: TokenType.DEL,
  clear: TokenType.CLEAR,
  count: TokenType.COUNT,
  where: TokenType.WHERE,
  limit: TokenType.LIMIT,
  sort: TokenType.SORT,
  asc: TokenType.ASC,
  desc: TokenType.DESC,
  and: TokenType.AND,
  or: TokenType.OR,
  not: TokenType.NOT,
  export: TokenType.EXPORT,
  as: TokenType.AS,
  ts: TokenType.TS,
  str: TokenType.TYPE_STR,
  num: TokenType.TYPE_NUM,
  bool: TokenType.TYPE_BOOL,
  json: TokenType.TYPE_JSON,
  bin: TokenType.TYPE_BIN,
  date: TokenType.TYPE_DATE,
  true: TokenType.BOOLEAN,
  false: TokenType.BOOLEAN,
  null: TokenType.NULL,
  in: TokenType.IN,
  between: TokenType.BETWEEN,
  like: TokenType.LIKE,
};

export class QCLexer {
  private src: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.src = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      if (this.pos >= this.src.length) break;

      const ch = this.src[this.pos];

      if (ch === '/' && this.src[this.pos + 1] === '/') {
        this.readLineComment();
        continue;
      }

      if (ch === '/' && this.src[this.pos + 1] === '*') {
        this.readBlockComment();
        continue;
      }

      if (ch === '"' || ch === "'") {
        this.readString(ch);
        continue;
      }
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }
      if (this.isAlpha(ch) || ch === '_') {
        this.readIdent();
        continue;
      }
      if (ch === '\n') {
        this.advance();
        continue;
      } // skip newlines

      switch (ch) {
        case '{':
          this.emit(TokenType.LBRACE, '{');
          this.advance();
          break;
        case '}':
          this.emit(TokenType.RBRACE, '}');
          this.advance();
          break;
        case '[':
          this.emit(TokenType.LBRACKET, '[');
          this.advance();
          break;
        case ']':
          this.emit(TokenType.RBRACKET, ']');
          this.advance();
          break;
        case '(':
          this.emit(TokenType.LPAREN, '(');
          this.advance();
          break;
        case ')':
          this.emit(TokenType.RPAREN, ')');
          this.advance();
          break;
        case ',':
          this.emit(TokenType.COMMA, ',');
          this.advance();
          break;
        case '.':
          this.emit(TokenType.DOT, '.');
          this.advance();
          break;
        case '@':
          this.advance();
          this.readDecorator();
          break;
        case ':':
          if (this.src[this.pos + 1] === '=') {
            this.emit(TokenType.IN, ':=');
            this.advance();
            this.advance();
          } else {
            this.emit(TokenType.COLON, ':');
            this.advance();
          }
          break;
        case '=':
          this.emit(TokenType.EQ, '=');
          this.advance();
          break;
        case '!':
          if (this.src[this.pos + 1] === '=') {
            this.emit(TokenType.NEQ, '!=');
            this.advance();
            this.advance();
          } else {
            this.advance();
          }
          break;
        case '<':
          if (this.src[this.pos + 1] === '=') {
            this.emit(TokenType.LTE, '<=');
            this.advance();
            this.advance();
          } else {
            this.emit(TokenType.LT, '<');
            this.advance();
          }
          break;
        case '>':
          if (this.src[this.pos + 1] === '=') {
            this.emit(TokenType.GTE, '>=');
            this.advance();
            this.advance();
          } else {
            this.emit(TokenType.GT, '>');
            this.advance();
          }
          break;
        case '~':
          if (this.src[this.pos + 1] === '=') {
            this.emit(TokenType.LIKE, '~=');
            this.advance();
            this.advance();
          } else {
            this.advance();
          }
          break;
        default:
          this.advance(); // skip unknown
      }
    }

    this.emit(TokenType.EOF, '');
    return this.tokens;
  }

  private readDecorator() {
    const start = this.pos;
    while (this.pos < this.src.length && this.isAlpha(this.src[this.pos])) {
      this.advance();
    }
    const word = this.src.slice(start, this.pos);
    if (word === 'index') this.emit(TokenType.INDEX, '@index');
    else if (word === 'secret') this.emit(TokenType.SECRET, '@secret');
    else this.emit(TokenType.AT, '@' + word);
  }

  private readIdent() {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;

    while (
      this.pos < this.src.length &&
      (this.isAlphaNum(this.src[this.pos]) || this.src[this.pos] === '_')
    ) {
      this.advance();
    }
    const word = this.src.slice(start, this.pos);

    // Check for TTL duration (e.g., 7d, 30m, 1h, 2w)
    if (/^\d+[smhdw]$/.test(word)) {
      this.tokens.push({
        type: TokenType.TTL_DURATION,
        value: word,
        line: startLine,
        col: startCol,
      });
      return;
    }

    const kwType = KEYWORDS[word.toLowerCase()];
    if (kwType) {
      // ts: keyword — read rest of line as raw TS
      if (kwType === TokenType.TS) {
        this.skipInlineWhitespace();
        if (this.src[this.pos] === ':') this.advance(); // skip ':'
        this.skipInlineWhitespace();
        const tsStart = this.pos;
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.advance();
        const rawTs = this.src.slice(tsStart, this.pos).trim();
        this.tokens.push({ type: TokenType.TS, value: 'ts', line: startLine, col: startCol });
        this.tokens.push({ type: TokenType.RAW_TS, value: rawTs, line: startLine, col: startCol });
        return;
      }
      this.tokens.push({ type: kwType, value: word, line: startLine, col: startCol });
    } else {
      this.tokens.push({ type: TokenType.IDENT, value: word, line: startLine, col: startCol });
    }
  }

  private readNumber() {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    while (
      this.pos < this.src.length &&
      (this.isDigit(this.src[this.pos]) || this.src[this.pos] === '.')
    ) {
      this.advance();
    }
    // Check for TTL suffix immediately after digits
    if (this.pos < this.src.length && 'smhdw'.includes(this.src[this.pos])) {
      this.advance();
      this.tokens.push({
        type: TokenType.TTL_DURATION,
        value: this.src.slice(start, this.pos),
        line: startLine,
        col: startCol,
      });
      return;
    }
    this.tokens.push({
      type: TokenType.NUMBER,
      value: this.src.slice(start, this.pos),
      line: startLine,
      col: startCol,
    });
  }

  private readString(quote: string) {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // skip opening quote
    let value = '';
    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === '\\' && this.pos + 1 < this.src.length) {
        this.advance();
        const esc = this.src[this.pos];
        const escMap: Record<string, string> = {
          n: '\n',
          t: '\t',
          r: '\r',
          '\\': '\\',
          '"': '"',
          "'": "'",
        };
        value += escMap[esc] ?? esc;
      } else {
        value += this.src[this.pos];
      }
      this.advance();
    }
    this.advance(); // skip closing quote
    this.tokens.push({ type: TokenType.STRING, value, line: startLine, col: startCol });
  }

  private readLineComment() {
    while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.advance();
  }

  private readBlockComment() {
    this.advance();
    this.advance(); // skip /*
    while (this.pos < this.src.length) {
      if (this.src[this.pos] === '*' && this.src[this.pos + 1] === '/') {
        this.advance();
        this.advance();
        break;
      }
      this.advance();
    }
  }

  private skipWhitespace() {
    while (
      this.pos < this.src.length &&
      (this.src[this.pos] === ' ' ||
        this.src[this.pos] === '\t' ||
        this.src[this.pos] === '\r' ||
        this.src[this.pos] === '\n')
    ) {
      this.advance();
    }
  }

  private skipInlineWhitespace() {
    while (
      this.pos < this.src.length &&
      (this.src[this.pos] === ' ' || this.src[this.pos] === '\t')
    ) {
      this.advance();
    }
  }

  private emit(type: TokenType, value: string) {
    this.tokens.push({ type, value, line: this.line, col: this.col });
  }

  private advance(): string {
    const ch = this.src[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private isDigit(ch: string) {
    return ch >= '0' && ch <= '9';
  }
  private isAlpha(ch: string) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }
  private isAlphaNum(ch: string) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }
}
