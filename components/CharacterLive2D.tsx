import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import CharacterSVG from './CharacterSVG';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

// Dynamically import Live2D component with ssr:false to avoid window errors
const Live2DViewer = dynamic(
  () => import('./Live2DViewer').then((mod) => ({ default: mod.Live2DViewer })),
  {
    ssr: false,
    loading: () => <CharacterSVG />,
  }
);

const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  const [error, setError] = useState(false);

  if (error) {
    return <CharacterSVG mood={mood} />;
  }

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
      <Live2DViewer mood={mood} onError={(e) => { console.log('Live2D error:', e); setError(true); }} />
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
