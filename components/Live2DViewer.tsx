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
      const { Live2DModel } = await import('pixi-live2d-display');

      // patch buggy helper shipped with pixi-live2d-display v0.2.x; the original
      // implementation chains `.load().on()` which fails because `load()` returns
      // void in Pixi v6. we replace the method with a fixed copy that avoids
      // the `.on()` pattern entirely.
      if (Live2DModel && !(Live2DModel as any).__patchedLoader) {
        (Live2DModel as any).__patchedLoader = true;
        (Live2DModel as any).fromModelSettingsFile = async function(url: string, options?: any) {
          // Create or locate a PIXI Loader implementation at runtime. Some
          // PIXI bundles expose `PIXI.Loader`, while others expect the
          // separate `@pixi/loaders` package. Try both and surface helpful
          // console logs to aid debugging in production.
          try {
            let LoaderClass: any = (PIXI as any).Loader || (PIXI as any).loaders?.Loader;
            if (!LoaderClass) {
              try {
                const mod = await import('@pixi/loaders');
                LoaderClass = mod.Loader || mod.default || mod;
                console.log('[Live2D] Using Loader from @pixi/loaders');
              } catch (impErr) {
                console.warn('[Live2D] Failed to import @pixi/loaders:', impErr);
              }
            }

            if (!LoaderClass) {
              throw new Error('PIXI Loader class not available (PIXI.Loader / @pixi/loaders)');
            }

            return await new Promise((resolve, reject) => {
              try {
                const loader = new LoaderClass();
                let completed = false;
                let timeoutId: any;

                console.log('[Live2D] Created loader instance:', !!loader, 'hasAdd:', typeof loader.add === 'function');

                // Add resource before starting the load
                if (typeof loader.add !== 'function') {
                  reject(new Error('Loader.add is not a function on the detected Loader implementation'));
                  return;
                }

                loader.add(url, options?.loaderOptions);

                timeoutId = setTimeout(() => {
                  if (!completed) {
                    reject(new Error(`Load timeout for ${url}`));
                  }
                }, 30000);

                loader.load((loaderInst: any, resources: any) => {
                  completed = true;
                  clearTimeout(timeoutId);

                  const res = resources[url];
                  if (res && !res.error) {
                    Live2DModel.fromModelSettingsJSON(res.data, url, options)
                      .then(resolve)
                      .catch(reject);
                  } else {
                    const errorMsg = res?.error?.message || res?.error || 'Unknown loading error';
                    reject(new Error(`Failed to load resource at ${url}: ${errorMsg}`));
                  }
                });
              } catch (error) {
                reject(error);
              }
            });
          } catch (err) {
            return Promise.reject(err);
          }
        };
      }

      // register shared ticker to satisfy the model's motion system
      if (Live2DModel && (Live2DModel as any).registerTicker) {
        (Live2DModel as any).registerTicker(PIXI.Ticker.shared);
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
