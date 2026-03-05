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
  // keep the latest callback in a ref so the initialization effect
  // does not need to re-run when the parent re-creates the function.
  const onErrorRef = useRef<((e: Error) => void) | undefined>(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const initLive2D = async () => {
      // Wait for Cubism 2 runtime to be available (up to 5 seconds)
      let cubismReady = false;
      let waitAttempts = 0;
      while (!cubismReady && waitAttempts < 50 && !cancelled) {
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

      // Polyfill Loader early, before we load pixi-live2d-display.  The
      // library may have captured `PIXI.Loader` at module evaluation time, but
      // we patch it here to ensure the correct class is present. We also wrap
      // fromModelSettings to guarantee Loader is available when it is called.
      if (!(PIXI as any).Loader) {
        try {
          const mod = await import('@pixi/loaders');
          const LoaderClass = mod.Loader || mod.default || mod;
          (PIXI as any).Loader = LoaderClass;
          if (!(PIXI as any).loaders) {
            (PIXI as any).loaders = { Loader: LoaderClass };
          }
          console.log('[Live2D] Polyfilled PIXI.Loader from @pixi/loaders');
        } catch (e) {
          console.warn('[Live2D] could not import @pixi/loaders:', e);
        }
      }

      const { Live2DModel } = await import('pixi-live2d-display');

      // Final safety net: ensure Live2DModel's fromModelSettingsFile has a valid
      // Loader. The library's fromModelSettings() is called by fromModelSettingsFile,
      // and may need Loader at that point.
      if (Live2DModel && !(Live2DModel as any).__loaderPatched) {
        (Live2DModel as any).__loaderPatched = true;
        const origFromModelSettingsJSON = (Live2DModel as any).fromModelSettingsJSON;
        (Live2DModel as any).fromModelSettingsJSON = async function(...args: any[]) {
          // Ensure Loader is in place
          if (!(PIXI as any).Loader) {
            const mod = await import('@pixi/loaders');
            const LoaderClass = mod.Loader || mod.default || mod;
            (PIXI as any).Loader = LoaderClass;
            if (!(PIXI as any).loaders) {
              (PIXI as any).loaders = { Loader: LoaderClass };
            }
          }
          return origFromModelSettingsJSON.apply(this, args);
        };
      }

      // patch buggy helper shipped with pixi-live2d-display v0.2.x; the original
      // implementation chains `.load().on()` which fails because `load()` returns
      // void in Pixi v6. we replace the method with one that fetches JSON directly,
      // avoiding the Loader entirely to sidestep module-load-time capture issues.
      if (Live2DModel && !(Live2DModel as any).__patchedLoader) {
        (Live2DModel as any).__patchedLoader = true;
        (Live2DModel as any).fromModelSettingsFile = async function(url: string, options?: any) {
          try {
            console.log('[Live2D] Loading model settings from:', url);
            const resp = await fetch(url);
            if (!resp.ok) {
              throw new Error(`HTTP ${resp.status}: ${resp.statusText} for ${url}`);
            }
            const json = await resp.json();
            console.log('[Live2D] Fetched model settings JSON, calling fromModelSettingsJSON...');
            return await (Live2DModel as any).fromModelSettingsJSON(json, url, options);
          } catch (err) {
            console.error('[Live2D] fromModelSettingsFile error:', err);
            throw err;
          }
        };
      }

      // register ticker class (not the instance) so that the
      // `Live2DModel` setter can access `Ticker.shared` correctly.
      // earlier versions of this code mistakenly passed the shared
      // instance; that caused `f.shared` to be undefined and produced
      // "Cannot read properties of undefined (reading 'add')" errors
      // during model construction.  See the stacktrace logged in the
      // production console for details.
      if (Live2DModel && (Live2DModel as any).registerTicker) {
        (Live2DModel as any).registerTicker(PIXI.Ticker);
      }

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

        if (containerRef.current && !cancelled) {
          const canvasEl = (app as any).view as HTMLCanvasElement;
          containerRef.current.appendChild(canvasEl);
          console.log('[Live2D] Canvas appended to DOM');
        }

        console.log('[Live2D] Loading model from:', MODEL_URL);
        const model = await (Live2DModel as any).fromModelSettingsFile(MODEL_URL);
        if (cancelled) return; // bail out if unmounted mid-load
        console.log('[Live2D] Model loaded successfully:', model);
        const anyModel: any = model;
        anyModel.scale.set(0.4);
        const canvasEl = (app as any).view as HTMLCanvasElement;
        anyModel.x = canvasEl.width / 2;
        anyModel.y = canvasEl.height / 1.1;
        // disable interactive features to prevent pointer/interaction errors
        anyModel.autoUpdate = true;
        anyModel.autoInteract = false;
        anyModel.interactive = false;
        anyModel.interactiveChildren = false;
        (app.stage as any).addChild(anyModel);
        console.log('[Live2D] Model added to stage');

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
        const cb = onErrorRef.current;
        if (cb && e instanceof Error) {
          cb(e);
        }
      }
    };

    initLive2D();

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
      }
    };
  }, []);

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
