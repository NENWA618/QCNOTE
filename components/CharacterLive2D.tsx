import React from 'react';
import CharacterSVG from './CharacterSVG';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

/**
 * Temporary fallback to SVG character while Live2D integration is being resolved.
 * 
 * Previous attempts to integrate pixi-live2d-display encountered version compatibility issues:
 * - pixi-live2d-display@0.4.0 is incompatible with Pixi v7/v8
 * - Cubism runtime (live2dcubismcore.js) could not be reliably loaded from CDN
 * - Model resources were incomplete
 * 
 * To re-enable Live2D in the future:
 * 1. Either upgrade to a modern Live2D library (e.g., CubismWebFramework v5+)
 * 2. Or downgrade to compatible versions: pixi-live2d-display@0.2.x with Pixi v6
 * 3. Ensure complete model assets are available locally
 * 4. Handle Cubism runtime loading properly (either v2 or v4 depending on model format)
 */
const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  // Always use SVG for now - provides reliable, performant character display
  return <CharacterSVG mood={mood} />;
};

export default CharacterLive2D;

