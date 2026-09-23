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
   * Remove ranges that overlap with the given selection
   */
  private static removeOverlappingRanges(
    ranges: ColoredRange[],
    startIndex: number,
    endIndex: number,
  ): ColoredRange[] {
    return ranges.filter((range) => {
      // Keep ranges that don't overlap
      return range.endIndex <= startIndex || range.startIndex >= endIndex;
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

    const sortedRanges = [...ranges].sort((a, b) => a.startIndex - b.startIndex);
    const result: Array<{ text: string; color: string | null }> = [];
    let lastIndex = 0;

    for (const range of sortedRanges) {
      // Add text before this range
      if (lastIndex < range.startIndex) {
        result.push({
          text: content.substring(lastIndex, range.startIndex),
          color: null,
        });
      }

      // Add colored text
      result.push({
        text: content.substring(range.startIndex, range.endIndex),
        color: range.color,
      });

      lastIndex = range.endIndex;
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
   * This handles insertions and deletions
   */
  static adjustRangesOnContentChange(
    ranges: ColoredRange[],
    changePosition: number,
    oldLength: number,
    newLength: number,
  ): ColoredRange[] {
    const lengthDelta = newLength - oldLength;

    return ranges
      .map((range) => {
        // Range is completely before the change
        if (range.endIndex <= changePosition) {
          return range;
        }

        // Range is completely after the change
        if (range.startIndex >= changePosition + oldLength) {
          return {
            ...range,
            startIndex: range.startIndex + lengthDelta,
            endIndex: range.endIndex + lengthDelta,
          };
        }

        // Range overlaps with the change - need to adjust
        const newStart =
          range.startIndex < changePosition ? range.startIndex : changePosition + newLength;
        const newEnd = Math.max(
          newStart + 1,
          range.endIndex < changePosition
            ? range.endIndex
            : changePosition + newLength + (range.endIndex - (changePosition + oldLength)),
        );

        return { ...range, startIndex: newStart, endIndex: newEnd };
      })
      .filter((range) => range.startIndex < range.endIndex);
  }
}

export default TextColorUtils;
