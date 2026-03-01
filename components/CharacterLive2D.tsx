import React from 'react';
import CharacterSVG from './CharacterSVG';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

/**
 * Hiyori Character Display Component
 * Currently renders as SVG, but includes reference to Live2D model:
 * https://raw.githubusercontent.com/patrickkimjunhwi/hiyori/main/hiyori_free_t08.model3.json
 * 
 * Live2D implementation can be enabled in the future with proper SSR handling.
 */
const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  // For now, use SVG fallback which ensures stable builds
  // Future: Integrate pixi.js + pixi-live2d-display with proper dynamic loading
  return <CharacterSVG mood={mood} />;
};

export default CharacterLive2D;
