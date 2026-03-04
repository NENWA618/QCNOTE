/** @vitest-environment jsdom */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import CharacterLive2D from '../components/CharacterLive2D';

// mock the Live2DViewer so we can trigger its onError callback
vi.mock('../components/Live2DViewer', () => {
  return {
    Live2DViewer: ({ onError }: { onError?: (err: Error) => void }) => {
      React.useEffect(() => {
        if (onError) {
          onError(new Error('mock failure'));
        }
      }, [onError]);
      return <div data-testid="live2d-mock" />;
    },
  };
});

describe('CharacterLive2D', () => {
  it('falls back to SVG when Live2DViewer reports an error', async () => {
    render(<CharacterLive2D />);

    // Live2DViewer mock immediately triggers onError; ensure we observe the
    // fallback SVG rendered as a result.
    await act(async () => Promise.resolve());

    expect(screen.getByTestId('character-svg')).toBeTruthy();
  });
});

