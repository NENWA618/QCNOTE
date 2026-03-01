import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';
import CharacterSVG from './CharacterSVG';

interface CharacterLive2DProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
}

// remote Hiyori model hosted on GitHub (open-source free version)
const MODEL_URL =
  'https://raw.githubusercontent.com/patrickkimjunhwi/hiyori/main/hiyori_free_t08.model3.json';

const CharacterLive2D: React.FC<CharacterLive2DProps> = ({ mood = 'idle' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const [error, setError] = useState(false);

  // initialize pixi application and load model
  useEffect(() => {
    let app: PIXI.Application | null = null;

    async function init() {
      if (!containerRef.current) return;
      try {
        // "transparent" isn't in the shipped type definitions, use backgroundAlpha
        app = new PIXI.Application({
          backgroundAlpha: 0,
          autoStart: true,
          resizeTo: containerRef.current,
        } as any);
        containerRef.current.appendChild(app.view as HTMLCanvasElement);

        const model = await Live2DModel.from(MODEL_URL);
        // position/scale may need tweaks depending on model
        const anyModel: any = model;
        anyModel.scale.set(0.5);
        anyModel.x = app.screen.width / 2;
        anyModel.y = app.screen.height / 1.1;
        app.stage.addChild(anyModel);

        modelRef.current = model;
        model.motion('Idle').catch(() => {});
      } catch (e) {
        console.error('Live2D load failed', e);
        setError(true);
      }
    }

    init();

    return () => {
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, []);

  // react to mood changes by triggering simple motions
  useEffect(() => {
    const m = modelRef.current;
    if (!m) return;
    switch (mood) {
      case 'talking':
        m.motion('Tap').catch(() => {});
        break;
      case 'playful':
        m.motion('Flick').catch(() => {});
        break;
      default:
        m.motion('Idle').catch(() => {});
        break;
    }
  }, [mood]);

  if (error) {
    return <CharacterSVG mood={mood} />;
  }

  return (
    <div
      ref={containerRef}
      className={`character-live2d ${mood}`}
      style={{
        width: 180,
        height: 300,
        filter: mood === 'thinking' ? 'brightness(0.95)' : 'brightness(1)',
        transition: 'filter 0.3s ease',
      }}
    >
      <style jsx>{`
        @keyframes talkingBounce {
          0%,100%{transform:translateY(0);} 
          50%{transform:translateY(-2px);} 
        }
        .character-live2d.talking{animation:talkingBounce 0.3s ease-in-out;}
      `}</style>
    </div>
  );
};

export default CharacterLive2D;
