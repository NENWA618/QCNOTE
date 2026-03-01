import React, { useEffect, useRef } from 'react';
// @ts-ignore - pixi.js types not available
import * as PIXI from 'pixi.js';
// @ts-ignore - pixi-live2d-display types not available  
import { Live2DModel } from 'pixi-live2d-display';

const MODEL_URL =
  'https://raw.githubusercontent.com/patrickkimjunhwi/hiyori/main/hiyori_free_t08.model3.json';

interface Live2DViewerProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
  onError?: (error: Error) => void;
}

export const Live2DViewer: React.FC<Live2DViewerProps> = ({
  mood = 'idle',
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const initLive2D = async () => {
      try {
        const app = new PIXI.Application({
          transparent: true,
          width: 180,
          height: 300,
        });
        appRef.current = app;

        if (containerRef.current) {
          containerRef.current.appendChild(app.canvas as HTMLCanvasElement);
        }

        const model = await Live2DModel.from(MODEL_URL);
        const anyModel: any = model;
        anyModel.scale.set(0.5);
        anyModel.x = app.canvas.width / 2;
        anyModel.y = app.canvas.height / 1.1;
        (app.stage as any).addChild(anyModel);

        modelRef.current = model;
        try {
          await model.motion('Idle');
        } catch (e) {
          // Idle motion might not exist, continue anyway
        }
      } catch (e) {
        console.error('Failed to load Hiyori Live2D model:', e);
        if (onError && e instanceof Error) {
          onError(e);
        }
      }
    };

    initLive2D();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
      }
    };
  }, [onError]);

  // React to mood changes
  useEffect(() => {
    const m = modelRef.current;
    if (!m) return;

    const playMotion = async () => {
      try {
        switch (mood) {
          case 'talking':
            await m.motion('Tap');
            break;
          case 'playful':
            await m.motion('Flick');
            break;
          default:
            await m.motion('Idle');
            break;
        }
      } catch (e) {
        // Motion not available, silently continue
      }
    };

    playMotion();
  }, [mood]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
