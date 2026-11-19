import { ColoredRange } from './storage';

/**
 * Utilities for handling mixed text colors in notes
 */

export class TextColorUtils {
  /**
   * Apply a color to a text selection
   * @param content The original content
   * @param startIndex Start position of selection
   * @param endIndex End position of selection
   * @param color Color to apply
   * @param existingRanges Existing colored ranges
   * @returns Updated colored ranges
   */
  static applyColorToSelection(
    startIndex: number,
    endIndex: number,
    color: string,
    existingRanges: ColoredRange[] = [],
  ): ColoredRange[] {
    if (startIndex >= endIndex) {
      return existingRanges;
    }

    // Remove overlapping ranges and merge
    let newRanges = this.removeOverlappingRanges(existingRanges, startIndex, endIndex);

    // Add the new range
    newRanges.push({ startIndex, endIndex, color });

    // Sort by start index
    newRanges.sort((a, b) => a.startIndex - b.startIndex);

    return newRanges;
  }

  /**
   * Remove the given selection from the ranges. A range that only partly
   * overlaps keeps the parts outside the selection.
   */
  private static removeOverlappingRanges(
    ranges: ColoredRange[],
    startIndex: number,
    endIndex: number,
  ): ColoredRange[] {
    return ranges.flatMap((range) => {
      // Keep ranges that don't overlap
      if (range.endIndex <= startIndex || range.startIndex >= endIndex) {
        return [range];
      }
      const parts: ColoredRange[] = [];
      if (range.startIndex < startIndex) parts.push({ ...range, endIndex: startIndex });
      if (range.endIndex > endIndex) parts.push({ ...range, startIndex: endIndex });
      return parts;
    });
  }

  /**
   * Clear all colors in a selection
   */
  static clearColorInSelection(
    startIndex: number,
    endIndex: number,
    existingRanges: ColoredRange[] = [],
  ): ColoredRange[] {
    if (startIndex >= endIndex) {
      return existingRanges;
    }

    return this.removeOverlappingRanges(existingRanges, startIndex, endIndex);
  }

  /**
   * Get color at a specific position
   */
  static getColorAtPosition(position: number, ranges: ColoredRange[] = []): string | null {
    const range = ranges.find((r) => position >= r.startIndex && position < r.endIndex);
    return range ? range.color : null;
  }

  /**
   * Render content with colored spans based on ranges
   * Returns an array of objects with text and color
   */
  static renderWithColors(
    content: string,
    ranges: ColoredRange[] = [],
  ): Array<{
    text: string;
    color: string | null;
  }> {
    if (!ranges || ranges.length === 0) {
      return [{ text: content, color: null }];
    }

    // Ranges may come from sync or import: clamp them to the content and skip
    // anything already covered, so overlapping ranges never repeat text.
    const sortedRanges = ranges
      .filter((r) => Number.isFinite(r.startIndex) && Number.isFinite(r.endIndex))
      .sort((a, b) => a.startIndex - b.startIndex);
    const result: Array<{ text: string; color: string | null }> = [];
    let lastIndex = 0;

    for (const range of sortedRanges) {
      const start = Math.max(range.startIndex, lastIndex);
      const end = Math.min(range.endIndex, content.length);
      if (start >= end) continue;

      // Add text before this range
      if (lastIndex < start) {
        result.push({
          text: content.substring(lastIndex, start),
          color: null,
        });
      }

      // Add colored text
      result.push({
        text: content.substring(start, end),
        color: range.color,
      });

      lastIndex = end;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({
        text: content.substring(lastIndex),
        color: null,
      });
    }

    return result;
  }

  /**
   * Adjust ranges when content is modified
   * This handles insertions and deletions: `oldLength` characters at
   * `changePosition` were replaced by `newLength` characters.
   */
  static adjustRangesOnContentChange(
    ranges: ColoredRange[],
    changePosition: number,
    oldLength: number,
    newLength: number,
  ): ColoredRange[] {
    const changeEnd = changePosition + oldLength;
    const lengthDelta = newLength - oldLength;

    return ranges
      .map((range) => {
        // Range is completely before the change (typing right after it doesn't extend it)
        if (range.endIndex <= changePosition) {
          return range;
        }

        // Range is completely after the change (typing right before it doesn't extend it)
        if (range.startIndex >= changeEnd) {
          return {
            ...range,
            startIndex: range.startIndex + lengthDelta,
            endIndex: range.endIndex + lengthDelta,
          };
        }

        // Range overlaps the change. Text inserted inside a range takes its
        // color; the deleted part of a range is dropped.
        const startIndex =
          range.startIndex <= changePosition ? range.startIndex : changePosition + newLength;
        const endIndex =
          range.endIndex >= changeEnd ? range.endIndex + lengthDelta : changePosition;
        return { ...range, startIndex, endIndex };
      })
      .filter((range) => range.startIndex < range.endIndex);
  }

  /**
   * Moves `ranges` along with an edit that turned `oldContent` into
   * `newContent`. The edit is taken to be the single span between the
   * longest common prefix and suffix, which covers typing, deleting,
   * pasting and replacing a selection.
   */
  static rebaseRanges(
    oldContent: string,
    newContent: string,
    ranges: ColoredRange[] = [],
  ): ColoredRange[] {
    if (ranges.length === 0 || oldContent === newContent) return ranges;

    const maxPrefix = Math.min(oldContent.length, newContent.length);
    let prefix = 0;
    while (prefix < maxPrefix && oldContent[prefix] === newContent[prefix]) prefix++;

    const maxSuffix = maxPrefix - prefix;
    let suffix = 0;
    while (
      suffix < maxSuffix &&
      oldContent[oldContent.length - 1 - suffix] === newContent[newContent.length - 1 - suffix]
    ) {
      suffix++;
    }

    return this.adjustRangesOnContentChange(
      ranges,
      prefix,
      oldContent.length - prefix - suffix,
      newContent.length - prefix - suffix,
    );
  }
}

export default TextColorUtils;
