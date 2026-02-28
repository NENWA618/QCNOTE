import React from 'react';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  // Enhanced anime-style character with more professional appearance
  
  // Eye animations
  const eyeScale = mood === 'playful' ? 0.85 : mood === 'sad' ? 1.15 : 1;
  const eyeOpacity = mood === 'thinking' ? 0.65 : 1;
  const pupilOffset = mood === 'talking' ? 0.8 : 0;
  
  // Mouth path based on mood
  const getMouthPath = () => {
    switch(mood) {
      case 'happy':
        return 'M50 95 Q60 108 70 95'; // big happy smile
      case 'sad':
        return 'M50 105 Q60 92 70 105'; // sad upside down
      case 'thinking':
        return 'M52 98 L68 98'; // thinking line
      case 'playful':
        return 'M50 94 Q60 104 70 94 M48 90 L48 86 M72 90 L72 86'; // smile with sparkles
      case 'talking':
        return 'M50 96 Q60 106 70 96'; // talking smile
      default:
        return 'M50 96 Q60 104 70 96'; // idle smile
    }
  };

  const getEyeColor = () => {
    if (mood === 'happy') return '#ff5599';
    if (mood === 'sad') return '#9966cc';
    if (mood === 'thinking') return '#6699ff';
    if (mood === 'playful') return '#ffaa00';
    return '#4488dd';
  };

  const getBlushOpacity = () => {
    if (mood === 'happy' || mood === 'playful') return 0.6;
    if (mood === 'sad') return 0.2;
    return 0.3;
  };

  return (
    <svg
      width="180"
      height="300"
      viewBox="0 0 180 300"
      xmlns="http://www.w3.org/2000/svg"
      className={`character-live2d ${mood}`}
      style={{
        filter: mood === 'thinking' ? 'brightness(0.95)' : 'brightness(1)',
        transition: 'filter 0.3s ease'
      }}
    >
      <defs>
        {/* Hair gradient */}
        <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c97c3c" />
          <stop offset="50%" stopColor="#b56d2f" />
          <stop offset="100%" stopColor="#8b4513" />
        </linearGradient>

        {/* Skin gradient */}
        <radialGradient id="skinGrad" cx="40%" cy="40%">
          <stop offset="0%" stopColor="#ffeef8" />
          <stop offset="100%" stopColor="#ffcce0" />
        </radialGradient>

        {/* Outfit gradient */}
        <linearGradient id="outfitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#f5f5ff" />
          <stop offset="100%" stopColor="#e6e0ff" />
        </linearGradient>

        {/* Hair shine */}
        <linearGradient id="hairShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d090" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#f0d090" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Body/Outfit */}
      <path
        d="M70 180 L70 280 L110 280 L110 180 Q90 175 70 180 Z"
        fill="url(#outfitGrad)"
        stroke="#d0c7ff"
        strokeWidth="1"
      />

      {/* Outfit details */}
      <path
        d="M75 200 L105 200 M75 220 L105 220 M75 240 L105 240"
        stroke="#c0b7ff"
        strokeWidth="0.8"
        opacity="0.5"
      />

      {/* Arms */}
      <ellipse cx="50" cy="190" rx="12" ry="35" fill="#ffcce6" stroke="#f0a8c4" strokeWidth="0.5" />
      <ellipse cx="130" cy="190" rx="12" ry="35" fill="#ffcce6" stroke="#f0a8c4" strokeWidth="0.5" />

      {/* Neck */}
      <rect x="75" y="160" width="30" height="20" fill="#ffcce6" opacity="0.9" />

      {/* Hair - back */}
      <path
        d="M30 100 Q20 60 50 40 Q90 20 130 40 Q160 60 150 100 C150 140 120 160 90 170 C60 160 30 140 30 100 Z"
        fill="url(#hairGrad)"
        stroke="#6b3410"
        strokeWidth="0.5"
      />

      {/* Hair shine layers */}
      <path
        d="M45 55 Q55 40 75 35 Q85 45 80 65"
        fill="url(#hairShine)"
        opacity="0.7"
      />

      {/* Hair - side tails (twintails style) */}
      <path
        d="M35 85 Q25 120 30 160 Q32 165 38 162 Q35 130 40 85 Z"
        fill="url(#hairGrad)"
      />
      <path
        d="M145 85 Q155 120 150 160 Q148 165 142 162 Q145 130 140 85 Z"
        fill="url(#hairGrad)"
      />

      {/* Face */}
      <circle
        cx="90"
        cy="105"
        r="38"
        fill="url(#skinGrad)"
        stroke="#f5b3d0"
        strokeWidth="1"
      />

      {/* Blush */}
      <ellipse cx="55" cy="110" rx="12" ry="8" fill="#ff99bb" opacity={getBlushOpacity()} />
      <ellipse cx="125" cy="110" rx="12" ry="8" fill="#ff99bb" opacity={getBlushOpacity()} />

      {/* Eyebrows */}
      <path
        d={mood === 'sad' ? 'M65 85 Q75 82 85 85' : 'M65 80 Q75 75 85 80'}
        stroke="#6b4423"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={mood === 'sad' ? 'M95 85 Q105 82 115 85' : 'M95 80 Q105 75 115 80'}
        stroke="#6b4423"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Eyes - white */}
      <ellipse cx="70" cy="105" rx="9" ry="12" fill="#ffffff" stroke="#ddd" strokeWidth="0.5" />
      <ellipse cx="110" cy="105" rx="9" ry="12" fill="#ffffff" stroke="#ddd" strokeWidth="0.5" />

      {/* Eyes - iris */}
      <circle
        cx={70 + pupilOffset}
        cy="106"
        r={5.5 * eyeScale}
        fill={getEyeColor()}
        opacity={eyeOpacity}
      />
      <circle
        cx={110 + pupilOffset}
        cy="106"
        r={5.5 * eyeScale}
        fill={getEyeColor()}
        opacity={eyeOpacity}
      />

      {/* Eyes - pupil shine */}
      {mood !== 'sad' && (
        <>
          <circle cx={68} cy="102" r="1.8" fill="#ffffff" opacity="0.9" />
          <circle cx={108} cy="102" r="1.8" fill="#ffffff" opacity="0.9" />
        </>
      )}

      {/* Mouth */}
      <path
        d={getMouthPath()}
        stroke={mood === 'sad' ? '#d4778f' : '#ff6699'}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Mouth inner shine */}
      {mood !== 'sad' && (
        <path
          d="M55 102 Q60 105 65 102"
          stroke="#ffbbdd"
          strokeWidth="0.8"
          fill="none"
          opacity="0.6"
        />
      )}

      {/* Hair accessories - ribbon bow */}
      <g>
        {/* Left bow */}
        <path
          d="M50 50 Q40 45 35 55 Q40 60 50 58 Z"
          fill="#ff99cc"
          stroke="#ff6699"
          strokeWidth="0.8"
        />
        {/* Right bow */}
        <path
          d="M130 50 Q140 45 145 55 Q140 60 130 58 Z"
          fill="#ff99cc"
          stroke="#ff6699"
          strokeWidth="0.8"
        />
        {/* Center bow connector */}
        <circle cx="90" cy="48" r="3" fill="#ffbbdd" stroke="#ff99cc" strokeWidth="0.5" />
      </g>

      {/* Playful sparkles (when mood is playful) */}
      {mood === 'playful' && (
        <>
          <text x="40" y="75" fontSize="12" fill="#ffaa00">✨</text>
          <text x="135" y="75" fontSize="12" fill="#ffaa00">✨</text>
        </>
      )}

      {/* Thinking indicator */}
      {mood === 'thinking' && (
        <circle cx="130" cy="60" r="3.5" fill="none" stroke="#6699ff" strokeWidth="1" opacity="0.7" />
      )}

      {/* Animation classes for CSS effects */}
      <style jsx>{`
        @keyframes talkingBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        
        .character-live2d.talking {
          animation: talkingBounce 0.3s ease-in-out;
        }
      `}</style>
    </svg>
  );
};

export default CharacterLive2D;
