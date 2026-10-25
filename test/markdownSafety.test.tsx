import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NormalMarkdown, ColoredMarkdown } from '../components/ColoredMarkdown';
import { filterInlineStyle, isSafeCssColor } from '../lib/markdownSafety';

const render = (content: string) => renderToStaticMarkup(<NormalMarkdown content={content} />);

describe('isSafeCssColor', () => {
  it('accepts hex, named and functional colors', () => {
    for (const c of [
      '#f00',
      '#ff6b6b',
      '#ff6b6bcc',
      'red',
      'rgb(1, 2, 3)',
      'rgba(1,2,3,0.5)',
      'hsl(120deg 50% 50%)',
    ]) {
      expect(isSafeCssColor(c), c).toBe(true);
    }
  });

  it('rejects anything that could smuggle extra CSS', () => {
    for (const c of [
      'red; position:fixed',
      'url(https://evil.example/x)',
      'expression(alert(1))',
      'red" onload="x',
      'var(--x)',
      '',
      undefined,
    ]) {
      expect(isSafeCssColor(c), String(c)).toBe(false);
    }
  });
});

describe('filterInlineStyle', () => {
  it('keeps only a safe color declaration', () => {
    expect(filterInlineStyle('position:fixed; color: #f00; inset:0')).toBe('color: #f00');
    expect(filterInlineStyle('position:fixed;inset:0;z-index:9999')).toBeNull();
    expect(filterInlineStyle('color: url(x)')).toBeNull();
  });
});

describe('Markdown rendering hardening', () => {
  it('strips overlay styles and utility classes from user-written HTML', () => {
    const html = render(
      '<div style="position:fixed;inset:0;background:white;z-index:9999" class="fixed inset-0 z-50">please sign in</div>',
    );
    expect(html).toContain('please sign in');
    expect(html).not.toMatch(/position/i);
    expect(html).not.toMatch(/inset/i);
    expect(html).not.toMatch(/z-index/i);
    expect(html).not.toMatch(/class="[^"]*fixed/);
  });

  it('keeps a plain color on user-written spans', () => {
    const html = render('<span style="color:#ff0000; position:fixed">hi</span>');
    expect(html).toContain('style="color:#ff0000"');
    expect(html).not.toMatch(/position/i);
  });

  it('still removes scripts, event handlers and javascript: links', () => {
    const html = render(
      '<script>alert(1)</script><img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))',
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('does not break KaTeX layout (inline and display math)', () => {
    const inline = render('Euler: $e^{i\\pi}+1=0$');
    expect(inline).toContain('class="katex"');
    // KaTeX 自己生成的布局样式必须保留
    expect(inline).toMatch(/style="[^"]*(height|margin|vertical-align|top)/);

    const display = render('$$\n\\frac{a}{b}\n$$');
    expect(display).toContain('katex-display');
    expect(display).toMatch(/style="[^"]*(height|margin|vertical-align|top)/);
  });

  it('caps sizes written in formulas so they cannot cover the page', () => {
    for (const formula of ['\\rule{500em}{500em}', '\\raisebox{500em}{X}', '\\kern{500em}x']) {
      const html = render(`$${formula}$`);
      expect(html).toContain('class="katex"');
      // 公式原文会留在 MathML 的 <annotation> 里，只看生成的样式
      const styles = (html.match(/style="[^"]*"/g) ?? []).join(' ');
      const sizes = [...styles.matchAll(/(-?[\d.]+)em/g)].map((m) => Math.abs(Number(m[1])));
      // 截断到 maxSize（10em），再加上字符本身的高度
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...sizes)).toBeLessThan(20);
    }
  });

  it('clips whatever is drawn outside the note area', () => {
    // maxSize 不截断负值，这一层靠外层容器裁剪
    const html = render('$\\kern{-500em}X$');
    expect(html).toMatch(/margin-right:-500em/);
    expect(html).toMatch(/^<div class="overflow-x-auto overflow-y-hidden">/);
  });

  it('cannot forge KaTeX markup by writing katex classes by hand', () => {
    const html = render('<span class="katex" style="position:fixed;inset:0">fake</span>');
    expect(html).not.toContain('class="katex"');
    expect(html).not.toMatch(/position/i);
  });

  it('keeps KaTeX MathML for screen readers and hides the visual layer', () => {
    const html = render('$$\n' + String.raw`\frac{1}{2} \color{red}{x}` + '\n$$');
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(html).toContain('<mfrac>');
    expect(html).toContain('mathcolor=');
    expect(html).toContain('<annotation encoding="application/x-tex">');
    expect(html).toContain('class="katex-html" aria-hidden="true"');
  });

  it('strips links, styles and external glyphs from hand-written MathML', () => {
    const html = render(
      '<math href="javascript:alert(1)" style="position:fixed" onclick="alert(1)">' +
        '<mi href="javascript:alert(2)" style="color:red">x</mi>' +
        '<mglyph src="https://evil.example/a.png"/></math>',
    );
    expect(html).toContain('<mi>x</mi>');
    expect(html).not.toMatch(/href|javascript|style=|onclick|mglyph|evil\.example/i);
  });

  it('keeps the SVG KaTeX draws for roots, wide accents and arrows', () => {
    const html = render('$$\n' + String.raw`\sqrt[3]{x} \widehat{abc} \cancel{y}` + '\n$$');
    expect(html).toMatch(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="400em"[^>]*viewBox=/);
    expect(html).toMatch(/<path d="M[^"]+"/);
    expect(html).toContain('<line x1="0"');
    expect(html).not.toContain('katex-error');
  });

  it('removes hand-written SVG anywhere in the note', () => {
    const html = render(
      '<svg onload="alert(1)" style="position:fixed;inset:0"><path d="M0 0"/>' +
        '<a href="javascript:alert(2)"><text>click</text></a><use href="#x"/></svg>\n\n' +
        '<span><SVG><PATH d="M1 1"/></SVG>inner</span>\n\n' +
        '<math><mtext><svg><path d="M2 2"/></svg></mtext></math>\n\n' +
        '<path d="M3 3"/><line x1="1"/>',
    );
    expect(html).toContain('<span>inner</span>');
    expect(html).not.toMatch(/<svg|<path|<line|<use|onload|javascript|position|click/i);
  });

  it('ignores unsafe stored colors in colored ranges', () => {
    const content = 'hello world';
    const out = renderToStaticMarkup(
      <ColoredMarkdown
        content={content}
        coloredRanges={[
          { startIndex: 0, endIndex: 5, color: 'red; position:fixed' },
          { startIndex: 6, endIndex: 11, color: '#4ecdc4' },
        ]}
      />,
    );
    expect(out).not.toMatch(/position/i);
    expect(out).toContain('style="color:#4ecdc4"');
    expect(out).toContain('hello');
  });
});
