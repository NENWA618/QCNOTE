import { describe, it, expect } from 'vitest';
import { toPlainPreview } from '../lib/notePreview';

describe('toPlainPreview', () => {
  it('标题、强调去掉符号，段落之间折叠成一个空格', () => {
    expect(toPlainPreview('# Heading\n\n**bold** body')).toBe('Heading bold body');
  });

  it('[[双链]] 显示标题，[文字](链接) 显示文字，图片显示 alt', () => {
    expect(toPlainPreview('见 [[项目计划]] 和 [官网](https://a.com) ![图](x.png)')).toBe(
      '见 项目计划 和 官网 图',
    );
  });

  it('列表、待办、编号、引用的前缀都去掉', () => {
    const md = '- 买菜\n- [ ] 写周报\n- [x] 开会\n1. 一\n2) 二\n> 引用';
    expect(toPlainPreview(md)).toBe('买菜 写周报 开会 一 二 引用');
  });

  it('代码围栏行去掉，代码文字保留', () => {
    expect(toPlainPreview('```ts\nconst a = 1\n```')).toBe('const a = 1');
  });

  it('分隔线整行去掉（包括 * * * 这种写法）', () => {
    expect(toPlainPreview('上\n---\n中\n* * *\n下')).toBe('上 中 下');
  });

  it('正文里的 #、>、== 不是 Markdown 语法，要保留', () => {
    expect(toPlainPreview('用 C# 写，见 issue #12，a -> b，x == y')).toBe(
      '用 C# 写，见 issue #12，a -> b，x == y',
    );
  });

  it('行内代码与删除线去掉标记', () => {
    expect(toPlainPreview('用 `npm i` 安装 ~~旧~~ 新')).toBe('用 npm i 安装 旧 新');
  });

  it('超长内容截断并加省略号，不拆开 emoji', () => {
    const out = toPlainPreview('字'.repeat(300), 10);
    expect(out).toBe('字'.repeat(10) + '…');
    const emoji = toPlainPreview('a' + '😀'.repeat(20), 4);
    expect(emoji.endsWith('…')).toBe(true);
    expect(emoji).not.toMatch(/[\ud800-\udbff]…$/);
  });

  it('空内容返回空串', () => {
    expect(toPlainPreview('')).toBe('');
    expect(toPlainPreview('  \n ')).toBe('');
  });
});
