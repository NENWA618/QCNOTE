import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColoredMarkdown } from '../components/ColoredMarkdown';
import type { ColoredRange } from '../lib/storage';

const render = (content: string, ranges: ColoredRange[]) =>
  renderToStaticMarkup(<ColoredMarkdown content={content} coloredRanges={ranges} />);

/** Range covering the first occurrence of `text` in `content`. */
const rangeOf = (content: string, text: string, color = 'red'): ColoredRange => {
  const startIndex = content.indexOf(text);
  return { startIndex, endIndex: startIndex + text.length, color };
};

describe('text colors', () => {
  it('colors plain text', () => {
    const content = 'hello world';
    expect(render(content, [rangeOf(content, 'world')])).toContain(
      'hello <span style="color:red">world</span>',
    );
  });

  it('colors text inside inline code without showing tags or entities', () => {
    const content = 'see `a<b` end';
    const html = render(content, [rangeOf(content, '`a<b`')]);
    expect(html).toContain('<span style="color:red">a&lt;b</span>');
    expect(html).not.toContain('&amp;lt;');
  });

  it('colors part of a code block, not its fence or info string', () => {
    const content = '```js\nx < y\nj = 1\n```';
    const html = render(content, [rangeOf(content, 'x < y')]);
    expect(html).toContain('<span style="color:red">x &lt; y</span>');
    expect(html).not.toContain('&lt;span');
    expect(html).toContain('j = 1');
  });

  it('keeps markdown working inside a colored range', () => {
    const content = 'a **bold** b';
    const html = render(content, [rangeOf(content, 'a **bold** b')]);
    expect(html).toContain('<strong><span style="color:red">bold</span></strong>');
    expect(html).not.toContain('**');
  });

  it('colors a range that spans two paragraphs in each one', () => {
    const content = 'first para\n\nsecond para';
    const html = render(content, [rangeOf(content, 'para\n\nsecond')]);
    expect(html).toContain('first <span style="color:red">para</span></p>');
    expect(html).toContain('<span style="color:red">second</span> para');
  });

  it('maps escaped characters back to their source', () => {
    const content = 'x \\*y\\* z';
    const html = render(content, [rangeOf(content, '\\*y\\*')]);
    expect(html).toContain('<span style="color:red">*y*</span>');
  });

  it('leaves math to KaTeX', () => {
    const content = 'a $x^2$ b';
    const html = render(content, [rangeOf(content, content)]);
    expect(html).toContain('katex');
    expect(html).toContain('<span style="color:red">a </span>');
  });
});
