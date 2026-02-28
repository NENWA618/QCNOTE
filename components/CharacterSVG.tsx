import React from 'react';

interface CharacterSVGProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

const CharacterSVG: React.FC<CharacterSVGProps> = ({ mood = 'idle' }) => {
  // Determine eye and mouth shapes based on mood
  const eyeScale = mood === 'playful' ? 0.8 : mood === 'sad' ? 1.1 : 1;
  const eyeOpacity = mood === 'thinking' ? 0.7 : 1;
  
  // Mouth path based on mood
  const getMouthPath = () => {
    switch (mood) {
      case 'happy':
        return 'M52 94 Q60 104 68 94'; // bigger smile
      case 'sad':
        return 'M52 100 Q60 92 68 100'; // upside down
      case 'thinking':
        return 'M54 96 L66 96'; // straight line
      case 'playful':
      case 'talking':
        return 'M52 94 Q60 102 68 94'; // normal smile
      default:
        return 'M52 94 Q60 102 68 94'; // default smile
    }
  };

  // Eye glow based on mood
  const getEyeColor = () => {
    if (mood === 'happy') return '#ff6b9d';
    if (mood === 'sad') return '#b8a8c0';
    if (mood === 'thinking') return '#c0a8d0';
    return '#2b2b2b';
  };

  return (
    <svg
      width="120"
      height="240"
      viewBox="0 0 120 240"
      xmlns="http://www.w3.org/2000/svg"
      className={`character-svg ${mood}`}
    >
      <defs>
        <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9f6a45" />
          <stop offset="100%" stopColor="#8b5e3c" />
        </linearGradient>
        <linearGradient id="outfitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fef5f8" />
        </linearGradient>
      </defs>
      {/* hair */}
      <path
        className="hair"
        d="M18 40 C18 14, 102 14, 102 40 C102 90, 84 120, 84 140 C84 160, 30 160, 30 140 C30 120, 12 90, 18 40 Z"
        fill="url(#hairGrad)"
      />
      {/* hair highlight */}
      <path
        d="M34 48 C40 42, 60 42, 66 48"
        stroke="#d2a091"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />
      {/* face */}
      <circle cx="60" cy="78" r="26" fill="#ffeef0" stroke="#f4d6d9" strokeWidth="0.5" />
      {/* eyebrows */}
      <path 
        d={mood === 'sad' ? 'M46 74 C48 72, 52 72, 54 74' : 'M46 70 C48 68, 52 68, 54 70'} 
        stroke="#3a2b2b" 
        strokeWidth="1.4" 
        fill="none" 
      />
      <path 
        d={mood === 'sad' ? 'M66 74 C68 72, 72 72, 74 74' : 'M66 70 C68 68, 72 68, 74 70'} 
        stroke="#3a2b2b" 
        strokeWidth="1.4" 
        fill="none" 
      />
      {/* eyes */}
      <ellipse 
        className="eye-left" 
        cx="50" 
        cy="78" 
        rx={4.5 * eyeScale} 
        ry={3.2 * eyeScale} 
        fill={getEyeColor()}
        opacity={eyeOpacity}
      />
      <ellipse 
        className="eye-right" 
        cx="70" 
        cy="78" 
        rx={4.5 * eyeScale} 
        ry={3.2 * eyeScale} 
        fill={getEyeColor()}
        opacity={eyeOpacity}
      />
      {/* eye highlights */}
      {mood !== 'sad' && (
        <>
          <circle cx="48" cy="76" r="1" fill="#fff" opacity="0.8" />
          <circle cx="68" cy="76" r="1" fill="#fff" opacity="0.8" />
        </>
      )}
      {/* mouth */}
      <path 
        className="mouth" 
        d={getMouthPath()}
        stroke={mood === 'sad' ? '#a8839f' : '#b84b6f'} 
        strokeWidth="1.6" 
        fill="none" 
        strokeLinecap="round" 
      />
      {/* earring */}
      <circle cx="86" cy="74" r="1.6" fill="#ffdce6" />
      {/* blush - more visible when happy */}
      <ellipse 
        cx="48" 
        cy="88" 
        rx="4.5" 
        ry="2.2" 
        fill="#ffd6de" 
        opacity={mood === 'happy' ? 1.2 : 0.9} 
      />
      <ellipse 
        cx="72" 
        cy="88" 
        rx="4.5" 
        ry="2.2" 
        fill="#ffd6de" 
        opacity={mood === 'happy' ? 1.2 : 0.9} 
      />
      {/* body */}
      <g transform="translate(40,104)">
        <rect x="0" y="0" width="40" height="44" fill="url(#outfitGrad)" stroke="#e6d7df" strokeWidth="1.2" rx="6" />
        {/* collar */}
        <path d="M0,0 L20,16 L40,0" fill="#f6eaf0" />
        {/* bow */}
        <path d="M20,12 L12,20 L20,18 L28,20 Z" fill={mood === 'happy' ? '#f098c8' : '#dc96b4'} />
        {/* sleeve lines */}
        <path d="M0,12 L40,12" stroke="#e6d7df" strokeWidth="0.6" />
      </g>
    </svg>
  );
};

export default CharacterSVG;
