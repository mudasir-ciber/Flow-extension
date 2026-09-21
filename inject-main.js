// AMJAD'S FLOW EXTENSION - Main World Injection Script
// Runs directly in Google Flow's execution context (MAIN world)
// Keeps Angular, Zone.js, and background timers running at full speed when minimized.

(function () {
  'use strict';

  if (window.__FLOW_MAIN_WORLD_INJECTED) return;
  window.__FLOW_MAIN_WORLD_INJECTED = true;

  console.log("[AMJAD'S FLOW] Main world anti-throttling engine active.");

  // 1. Spoof document.hidden and visibilityState
  try {
    const docProto = Document.prototype;

    Object.defineProperty(docProto, 'hidden', {
      get: () => false,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(docProto, 'visibilityState', {
      get: () => 'visible',
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(docProto, 'webkitHidden', {
      get: () => false,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(docProto, 'webkitVisibilityState', {
      get: () => 'visible',
      enumerable: true,
      configurable: true
    });

    // Also override on document instance directly in case page reads own properties
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  } catch (e) {
    console.warn('[AMJAD\'S FLOW] Visibility property override notice:', e);
  }

  // 2. Intercept and swallow visibilitychange events before Angular sees them
  const stopVisibilityEvent = (e) => {
    e.stopImmediatePropagation();
  };
  window.addEventListener('visibilitychange', stopVisibilityEvent, true);
  document.addEventListener('visibilitychange', stopVisibilityEvent, true);

  // 3. Spoof document.hasFocus to always return true
  try {
    Document.prototype.hasFocus = () => true;
    document.hasFocus = () => true;
  } catch (e) {}

  // 4. RequestAnimationFrame Fallback for Minimized / Background Tabs
  // When Chrome is minimized, native requestAnimationFrame completely halts (0 fps).
  // By shimming it with setTimeout when native RAF stalls, Angular Zone and render updates keep ticking!
  try {
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCAF = window.cancelAnimationFrame.bind(window);
    const activeTimeouts = new Map();

    let lastRafTime = performance.now();
    let isNativeRafStalled = false;

    // Heartbeat to detect if native RAF is frozen (window minimized)
    setInterval(() => {
      const now = performance.now();
      isNativeRafStalled = (now - lastRafTime > 250);
    }, 200);

    window.requestAnimationFrame = function (callback) {
      if (isNativeRafStalled) {
        const id = setTimeout(() => {
          activeTimeouts.delete(id);
          lastRafTime = performance.now();
          try {
            callback(performance.now());
          } catch (err) {}
        }, 16);
        activeTimeouts.set(id, true);
        return id;
      }

      return nativeRAF((time) => {
        lastRafTime = time;
        callback(time);
      });
    };

    window.cancelAnimationFrame = function (id) {
      if (activeTimeouts.has(id)) {
        clearTimeout(id);
        activeTimeouts.delete(id);
      } else {
        nativeCAF(id);
      }
    };
  } catch (e) {
    console.warn('[AMJAD\'S FLOW] RAF shim notice:', e);
  }
})();
