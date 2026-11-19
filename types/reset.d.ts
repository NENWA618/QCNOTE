/**
 * 让 JSON.parse 和 Response.json() 返回 unknown 而不是 any，
 * 强制调用方先校验或显式断言，避免 any 从外部数据悄悄扩散。
 * （思路同 @total-typescript/ts-reset）
 */
interface JSON {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
}

interface Body {
  json(): Promise<unknown>;
}
