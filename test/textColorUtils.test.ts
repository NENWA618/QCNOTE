import { describe, it, expect } from 'vitest';
import { TextColorUtils } from '../lib/textColorUtils';
import type { ColoredRange } from '../lib/storage';

const red = (startIndex: number, endIndex: number): ColoredRange => ({
  startIndex,
  endIndex,
  color: '#ff0000',
});

/** The text each range covers, to check the color stays on the same words. */
const colored = (content: string, ranges: ColoredRange[]) =>
  ranges.map((r) => content.slice(r.startIndex, r.endIndex));

describe('TextColorUtils.rebaseRanges', () => {
  const before = 'hello world';
  const ranges = [red(6, 11)]; // "world"

  it('moves a range when text is typed or deleted before it', () => {
    const typed = 'oh, hello world';
    expect(colored(typed, TextColorUtils.rebaseRanges(before, typed, ranges))).toEqual(['world']);
    const deleted = 'hi world';
    expect(colored(deleted, TextColorUtils.rebaseRanges(before, deleted, ranges))).toEqual([
      'world',
    ]);
  });

  it('leaves a range alone when text is typed after it', () => {
    const after = 'hello world!!';
    expect(TextColorUtils.rebaseRanges(before, after, ranges)).toEqual(ranges);
  });

  it('does not extend a range when typing right at its edges', () => {
    expect(
      colored('hello Xworld', TextColorUtils.rebaseRanges(before, 'hello Xworld', ranges)),
    ).toEqual(['world']);
    expect(
      colored('hello worldX', TextColorUtils.rebaseRanges(before, 'hello worldX', ranges)),
    ).toEqual(['world']);
  });

  it('grows a range when text is typed inside it', () => {
    const after = 'hello woXXrld';
    expect(colored(after, TextColorUtils.rebaseRanges(before, after, ranges))).toEqual(['woXXrld']);
  });

  it('shrinks a range when part of it is deleted', () => {
    // delete "lo wo"
    const after = 'helrld';
    expect(colored(after, TextColorUtils.rebaseRanges(before, after, ranges))).toEqual(['rld']);
    // delete "rld" and what follows
    expect(colored('hello wo', TextColorUtils.rebaseRanges(before, 'hello wo', ranges))).toEqual([
      'wo',
    ]);
  });

  it('drops a range whose text was deleted entirely', () => {
    expect(TextColorUtils.rebaseRanges(before, 'hello ', ranges)).toEqual([]);
    expect(TextColorUtils.rebaseRanges('a world b', 'a  b', [red(2, 7)])).toEqual([]);
  });

  it('handles a pasted replacement across a range boundary', () => {
    // replace "lo wor" with "XY"
    const after = 'helXYld';
    expect(colored(after, TextColorUtils.rebaseRanges(before, after, ranges))).toEqual(['ld']);
  });
});

describe('TextColorUtils.renderWithColors', () => {
  it('never repeats text when ranges overlap', () => {
    const content = 'abcdefgh';
    const segments = TextColorUtils.renderWithColors(content, [red(1, 5), red(3, 7)]);
    expect(segments.map((s) => s.text).join('')).toBe(content);
  });

  it('ignores ranges outside the content', () => {
    const content = 'abc';
    const segments = TextColorUtils.renderWithColors(content, [red(1, 50), red(10, 20)]);
    expect(segments.map((s) => s.text).join('')).toBe(content);
    expect(segments).toEqual([
      { text: 'a', color: null },
      { text: 'bc', color: '#ff0000' },
    ]);
  });
});

describe('TextColorUtils selection coloring', () => {
  const blue = (startIndex: number, endIndex: number): ColoredRange => ({
    startIndex,
    endIndex,
    color: '#0000ff',
  });

  it('recolors only the selected part of a range', () => {
    expect(TextColorUtils.applyColorToSelection(3, 5, '#0000ff', [red(0, 10)])).toEqual([
      red(0, 3),
      blue(3, 5),
      red(5, 10),
    ]);
  });

  it('clears only the selected part of a range', () => {
    expect(TextColorUtils.clearColorInSelection(3, 5, [red(0, 10)])).toEqual([
      red(0, 3),
      red(5, 10),
    ]);
    expect(TextColorUtils.clearColorInSelection(5, 15, [red(0, 10), red(12, 20)])).toEqual([
      red(0, 5),
      red(15, 20),
    ]);
  });

  it('removes ranges the selection covers entirely', () => {
    expect(TextColorUtils.clearColorInSelection(0, 10, [red(2, 4), red(6, 8)])).toEqual([]);
  });
});
