import React, { useEffect, useRef } from 'react';
// We import pixi and pixi-live2d-display dynamically inside the effect
// so that the modules (which assume a browser `window`) are never
// required during server-side rendering.  This prevents build-time
// errors like "window is not defined".

// after switching to an open‑source model we copy the assets into public/live2d/koharu
// the JSON file shipped with the npm package is named `koharu.model.json` (Cubism2 format).
// pixi-live2d-display is able to load both `.model3.json` and legacy `.model.json` files.
const MODEL_URL = '/live2d/koharu/koharu.model.json';

interface Live2DViewerProps {
  mood?: 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';
  onError?: (error: Error) => void;
}

export const Live2DViewer: React.FC<Live2DViewerProps> = ({
  mood = 'idle',
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // appRef stores PIXI.Application instance; we use `any` because PIXI is
  // imported dynamically and the compile-time type might not be available
  // during SSR.
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const initLive2D = async () => {
      // Wait for Cubism 2 runtime to be available (up to 5 seconds)
      let cubismReady = false;
      let waitAttempts = 0;
      while (!cubismReady && waitAttempts < 50) {
        if (typeof (window as any).Live2D !== 'undefined') {
          cubismReady = true;
          console.log('[Live2D] Cubism 2 runtime is ready');
        } else {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitAttempts++;
        }
      }
      
      if (!cubismReady) {
        console.warn('[Live2D] Cubism 2 runtime did not load within timeout; attempting to proceed anyway');
      }
      
      // dynamic imports ensure the code only runs in the browser
      const PIXI = await import('pixi.js');
      const { Live2DModel } = await import('pixi-live2d-display');
      
      // Log available runtime information for debugging
      console.log('[Live2D] Checking runtime environments...');
      console.log('[Live2D] window.Live2D available?', typeof (window as any).Live2D !== 'undefined');
      console.log('[Live2D] PIXI version', (PIXI as any).VERSION || 'unknown');
      
      try {
        console.log('[Live2D] Starting initialization...');
        console.log('[Live2D] Creating PIXI.Application...');
        const app = new PIXI.Application({
          width: 180,
          height: 300,
          backgroundAlpha: 0,
        });
        appRef.current = app;
        console.log('[Live2D] PIXI App created successfully');

        if (containerRef.current) {
          // Pixi types expose `view` instead of `canvas` on Application.
          // older versions had `app.view` property pointing at the HTMLCanvasElement.
          const canvasEl = (app as any).view as HTMLCanvasElement;
          containerRef.current.appendChild(canvasEl);
          console.log('[Live2D] Canvas appended to DOM');
        }

        console.log('[Live2D] Loading model from:', MODEL_URL);
        // @ts-ignore - type definitions are missing for this older version
        const model = await (Live2DModel as any).from(MODEL_URL);
        console.log('[Live2D] Model loaded successfully:', model);
        const anyModel: any = model;
        // the koharu model is larger than our original Hiyori asset, adjust scale
        anyModel.scale.set(0.4);
        const canvasEl = (app as any).view as HTMLCanvasElement;
        anyModel.x = canvasEl.width / 2;
        anyModel.y = canvasEl.height / 1.1;
        (app.stage as any).addChild(anyModel);
        console.log('Model added to stage');

        modelRef.current = model;
        try {
          await model.motion('Idle');
        } catch (e) {
          // Idle motion might not exist, continue anyway
        }
        console.log('Live2D initialization complete!');
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error('[Live2D] Failed to load koharu model:', errorMsg);
        console.error('[Live2D] Full error:', e);
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
