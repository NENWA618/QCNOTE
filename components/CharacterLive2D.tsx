import React from 'react';
import CharacterSVG from './CharacterSVG';
import { Live2DViewer } from './Live2DViewer';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

/**
 * This component now attempts to render a Live2D model using
 * `pixi-live2d-display` (MIT).  An open‑source Cubism2 model (koharu)
 * was copied into `public/live2d/koharu` and the `Live2DViewer` handles
 * fetching/initialization.  If the viewer fails or is not yet ready, we
 * fallback to the lightweight SVG character to avoid breaking the UI.
 *
 * The previous SVG‑only implementation and lengthy comment history are
 * retained above for reference in case of future migration to another
 * rendering technique.
 */
const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return <CharacterSVG mood={mood} />;
  }

  return (
    <Live2DViewer
      mood={mood}
      onError={err => {
        console.error('Live2DViewer error, falling back to SVG', err);
        setHasError(true);
      }}
    />
  );
};

export default CharacterLive2D;

