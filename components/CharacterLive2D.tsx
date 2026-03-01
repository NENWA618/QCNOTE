import React, { useState } from 'react';
import CharacterSVG from './CharacterSVG';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

// Client side require to avoid dynamic chunk issues
let Live2DViewer: React.FC<{
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
  onError?: (error: Error) => void;
}> | null = null;

if (typeof window !== 'undefined') {
  // require at runtime so server bundle stays light
  Live2DViewer = require('./Live2DViewer').Live2DViewer;
}

const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  const [error, setError] = useState(false);

  // if the Live2D viewer isn't available (SSR or failed import) or we've hit an error,
  // fall back to the SVG character
  if (!Live2DViewer || error) {
    console.log('[CharacterLive2D] Falling back to SVG (Live2D unavailable or error occurred)');
    return <CharacterSVG mood={mood} />;
  }

  const handleLive2DError = (e: Error) => {
    console.error('[CharacterLive2D] Live2D initialization error:', e);
    console.warn('[CharacterLive2D] Falling back to SVG character');
    setError(true);
  };

  return (
    <div
      className={`character-live2d ${mood}`}
      style={{
        width: 180,
        height: 300,
        filter: mood === 'thinking' ? 'brightness(0.95)' : 'brightness(1)',
        transition: 'filter 0.3s ease',
      }}
    >
      <Live2DViewer mood={mood} onError={handleLive2DError} />
      <style jsx>{`
        @keyframes talkingBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .character-live2d.talking {
          animation: talkingBounce 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default CharacterLive2D;
