// Content Script for Google Flow (flow.google.com) Automation
// Strictly executes 1 prompt at a time, tracks live generation, downloads 4 images, auto-retries on failure.

(function () {
  if (window.__FLOW_AUTOPROMPT_INJECTED) return;
  window.__FLOW_AUTOPROMPT_INJECTED = true;

  console.log('[Flow AutoPrompt] Content script active on:', window.location.href);

  // State & Locks
  let isExecuting = false;
  let isPaused = false;
  let trackingTimerId = null;
  let isDownloading = false;
  let existingImagesSnapshot = new Set();
  let existingErrorTilesSnapshot = new Set();
  let currentRetryCount = 0;
  const MAX_RETRIES = 5;
  let hasSubmittedPrompt = false;

  // Custom selector cache
  let customSelectors = {
    input: null,
    button: null
  };

  chrome.storage.local.get(['customSelectors'], (res) => {
    if (res.customSelectors) {
      customSelectors = res.customSelectors;
    }
  });

  // Safe runtime messaging
  function safeSend(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (typeof callback === 'function') callback(response, err);
      });
    } catch (e) {}
  }

  // Safe persistent logging to storage for Side Panel terminal
  async function addLogSW(message) {
    try {
      const { logs = [] } = await chrome.storage.local.get('logs');
      const newLog = {
        timestamp: new Date().toLocaleTimeString(),
        text: message
      };
      const updatedLogs = [...logs.slice(-99), newLog];
      await chrome.storage.local.set({ logs: updatedLogs });
    } catch (e) {}
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function stopTracking() {
    window.__triggerTrackingStep = null;
    stopAudioKeepalive();
    if (trackingTimerId) {
      clearTimeout(trackingTimerId);
      trackingTimerId = null;
    }
  }

  // --- BACKGROUND KEEPALIVE FOR MINIMIZED / OCCLUDED CHROME ---

  let keepaliveAudioCtx = null;

  // Inaudible audio stream: Forces Chromium to classify this tab as ACTIVE_MEDIA
  // This completely disables background tab freezing and timer throttling when minimized!
  function startAudioKeepalive() {
    try {
      if (!keepaliveAudioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          keepaliveAudioCtx = new AudioContext();
          if (keepaliveAudioCtx.state === 'suspended') {
            keepaliveAudioCtx.resume();
          }
          const osc = keepaliveAudioCtx.createOscillator();
          const gain = keepaliveAudioCtx.createGain();
          osc.frequency.setValueAtTime(20, keepaliveAudioCtx.currentTime); // 20Hz sub-audible
          gain.gain.setValueAtTime(0.0001, keepaliveAudioCtx.currentTime); // Inaudible
          osc.connect(gain);
          gain.connect(keepaliveAudioCtx.destination);
          osc.start();
          console.log('[Flow AutoPrompt] Audio keepalive active (prevents minimization throttle).');
        }
      } else if (keepaliveAudioCtx.state === 'suspended') {
        keepaliveAudioCtx.resume();
      }
    } catch(e) {}
  }

  function stopAudioKeepalive() {
    try {
      if (keepaliveAudioCtx) {
        keepaliveAudioCtx.close();
        keepaliveAudioCtx = null;
      }
    } catch(e) {}
  }

  // Spoof document.hidden & visibilityState so Google Flow always runs at full speed in background
  function spoofVisibility() {
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      window.addEventListener('visibilitychange', (e) => {
        e.stopImmediatePropagation();
      }, true);
    } catch(e) {}
  }
  spoofVisibility();

  // Long-lived IPC keepalive port to background worker
  let keepalivePort = null;

  function connectKeepalivePort() {
    try {
      if (keepalivePort) return;
      keepalivePort = chrome.runtime.connect({ name: 'flow_keepalive_port' });

      keepalivePort.onMessage.addListener((msg) => {
        if (msg && msg.action === 'PING_TICK') {
          // Native browser IPC event wakes up V8 loop even when minimized!
          if (isExecuting && !isPaused && typeof window.__triggerTrackingStep === 'function') {
            window.__triggerTrackingStep();
          }
        }
      });

      keepalivePort.onDisconnect.addListener(() => {
        keepalivePort = null;
        setTimeout(connectKeepalivePort, 2000);
      });
    } catch(e) {}
  }
  // Connect immediately upon script load
  connectKeepalivePort();

  // --- COMPLETION SOUND / CHIME TONE ---

  function playCompletionTone() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;

      // 4-note ascending triumph bell chime: D5, F#5, A5, D6
      const chord = [
        { freq: 587.33, time: 0.00, dur: 0.35 }, // D5
        { freq: 739.99, time: 0.12, dur: 0.35 }, // F#5
        { freq: 880.00, time: 0.24, dur: 0.40 }, // A5
        { freq: 1174.66, time: 0.36, dur: 0.95 } // D6 (high bell ring)
      ];

      chord.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle'; // rich, bright bell tone
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        gain.gain.setValueAtTime(0.001, now + note.time);
        gain.gain.exponentialRampToValueAtTime(0.35, now + note.time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.time + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.time);
        osc.stop(now + note.time + note.dur);
      });

      setTimeout(() => {
        try { ctx.close(); } catch(e) {}
      }, 2500);
    } catch(e) {
      console.warn('Tone error:', e);
    }
  }

// --- ELEMENT DETECTION ---

  function findPromptInput() {
    // 1. Exact Google Flow ProseMirror editor
    const flowProse = document.querySelector(
      'flow-rich-text-editor .ProseMirror[contenteditable="true"], flow-base-prompt-box .ProseMirror[contenteditable="true"], .prompt-box-container .ProseMirror, .ProseMirror[contenteditable="true"]'
    );
    if (flowProse) return flowProse;

    // 2. Custom calibrated selector
    if (customSelectors.input) {
      const el = document.querySelector(customSelectors.input);
      if (el) return el;
    }

    // 3. Fallback: look for textarea
    const textareas = Array.from(document.querySelectorAll('textarea'));
    if (textareas.length > 0) {
      const matched = textareas.find(t =>
        /prompt|describe|imagine|create|type/i.test(t.placeholder || '') ||
        /prompt/i.test(t.getAttribute('aria-label') || '')
      );
      return matched || textareas[0];
    }

    // 4. Fallback: look for any contenteditable div
    const editables = Array.from(document.querySelectorAll('div[contenteditable="true"], [role="textbox"]'));
    if (editables.length > 0) {
      return editables[0];
    }

    return null;
  }

  function findGenerateButton(inputEl) {
    // 0. Custom calibrated selector
    if (customSelectors.button) {
      const el = document.querySelector(customSelectors.button);
      if (el) return el.tagName === 'BUTTON' ? el : (el.querySelector('button') || el);
    }

    // 1. Google Flow Exact DOM Selectors:
    // <flow-generate-icon-button><button type="submit" aria-label="Start generation" class="generate-icon-button"><mat-icon>arrow_forward</mat-icon></button></flow-generate-icon-button>
    const flowDirectSelectors = [
      'flow-generate-icon-button button',
      'button[aria-label="Start generation"]',
      'button.generate-icon-button',
      'flow-generate-icon-button',
      'button[type="submit"].generate-icon-button',
      'button[type="submit"][aria-label*="generation" i]',
      'flow-prompt-box button[type="submit"]',
      'flow-base-prompt-box button[type="submit"]',
      '.prompt-box-container button[type="submit"]'
    ];

    for (const sel of flowDirectSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') || el);
        if (btn) return btn;
      }
    }

    // 2. Search buttons in the prompt card container
    if (inputEl) {
      let card = inputEl.closest('flow-prompt-box, flow-base-prompt-box, .prompt-box-container, .base-prompt-box, form') || inputEl.parentElement;
      while (card && card !== document.body) {
        for (const sel of flowDirectSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') || el);
            if (btn) return btn;
          }
        }

        const btns = Array.from(card.querySelectorAll('button, [role="button"], md-icon-button, flow-icon-button'));
        const match = btns.find(b => {
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          const title = (b.getAttribute('title') || '').toLowerCase();
          const text = (b.textContent || '').trim().toLowerCase();
          const matIcon = b.querySelector('mat-icon, [class*="icon"]');
          const iconText = (matIcon?.textContent || '').trim().toLowerCase();
          return /arrow_forward|start generation|generate|send|submit/i.test(aria + ' ' + title + ' ' + text + ' ' + iconText);
        });
        if (match) {
          return match.tagName === 'BUTTON' ? match : (match.querySelector('button') || match);
        }

        card = card.parentElement;
      }
    }

    // 3. Fallback: Search all visible buttons in document for arrow_forward or start generation
    const allButtons = Array.from(document.querySelectorAll('button, [role="button"], md-icon-button, flow-icon-button'));
    const match = allButtons.find(b => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      const text = (b.textContent || '').trim().toLowerCase();
      const matIcon = b.querySelector('mat-icon, [class*="icon"]');
      const iconText = (matIcon?.textContent || '').trim().toLowerCase();
      return /arrow_forward|start generation|generate/i.test(aria + ' ' + title + ' ' + text + ' ' + iconText);
    });
    if (match) {
      return match.tagName === 'BUTTON' ? match : (match.querySelector('button') || match);
    }

    return null;
  }

  // --- CHARACTER REFERENCE IMAGE ATTACHMENT ---

  function dataUrlToFile(dataUrl, filename = 'character_reference.png') {
    try {
      const arr = dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      return new File([blob], filename, { type: mime, lastModified: Date.now() });
    } catch (e) {
      console.warn('[Flow AutoPrompt] dataUrlToFile conversion error:', e);
      return null;
    }
  }

  async function attachReferenceImage(dataUrl, inputEl) {
    if (!dataUrl) return false;
    const file = dataUrlToFile(dataUrl, 'character_reference.png');
    if (!file) return false;

    try {
      const dt = new DataTransfer();
      dt.items.add(file);

      const card = inputEl?.closest('flow-prompt-box, flow-base-prompt-box, .prompt-box-container') || inputEl?.parentElement;

      // 1. Dispatch synthetic paste event with file payload directly onto inputEl & prompt card
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt
      });
      if (inputEl) inputEl.dispatchEvent(pasteEvt);
      if (card && card !== inputEl) card.dispatchEvent(pasteEvt);

      // 2. Dispatch Drag & Drop events onto inputEl and prompt box containers
      const dropTargets = [
        inputEl,
        card,
        document.querySelector('flow-prompt-box, flow-base-prompt-box, .prompt-box-container, cdk-virtual-scroll-viewport, main')
      ].filter(Boolean);

      for (const target of dropTargets) {
        try {
          target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
          target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
        } catch (e) {}
      }

      // 3. Dispatch to any file input element present in the document
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      for (const fi of fileInputs) {
        try {
          fi.files = dt.files;
          fi.dispatchEvent(new Event('change', { bubbles: true }));
          fi.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {}
      }

      await sleep(600); // Give Flow time to process and render media chip
      return true;
    } catch (e) {
      console.warn('[Flow AutoPrompt] attachReferenceImage error:', e);
      return false;
    }
  }

  // --- TEXT INJECTION & SUBMISSION ---

  function activatePromptBox() {
    try {
      const container = document.querySelector('flow-prompt-box, flow-base-prompt-box, .prompt-box-container, .base-prompt-box, .prompt-box-content');
      if (container) {
        container.click();
      }
    } catch(e) {}
  }

  async function injectTextIntoProseMirror(el, text) {
    el.focus();
    el.click();
    await sleep(60);

    // 1. Clear previous text cleanly using Selection + execCommand
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}

    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    } catch (e) {}
    await sleep(50);

    // 2. Primary: Dispatch ClipboardEvent ('paste') with DataTransfer
    // ProseMirror handles paste natively by updating internal state and firing document transactions
    let pasted = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt
      });
      el.dispatchEvent(pasteEvt);
      pasted = (el.textContent || '').trim().length > 0;
    } catch (e) {
      pasted = false;
    }

    // 3. Fallback: execCommand insertText if paste did not populate text
    if (!pasted || !(el.textContent || '').trim()) {
      try {
        document.execCommand('insertText', false, text);
      } catch (e) {}
    }

    // 4. Fallback verification: if still empty, insert paragraph
    if (!(el.textContent || '').trim()) {
      let p = el.querySelector('p');
      if (!p) {
        p = document.createElement('p');
        el.appendChild(p);
      }
      p.textContent = text;
    }

    // 5. Dispatch InputEvent & Angular change detection events
    try {
      el.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertText',
        data: text
      }));
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertText',
        data: text
      }));
    } catch (e) {}

    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));

    // 6. Proactively unlock generate button if Angular left it in disabled state
    const genBtn = findGenerateButton(el);
    if (genBtn) {
      try {
        genBtn.removeAttribute('disabled');
        genBtn.disabled = false;
        genBtn.classList.remove('mat-mdc-button-disabled', 'disabled');
        genBtn.removeAttribute('aria-disabled');
      } catch (e) {}
    }

    await sleep(150);
    return (el.textContent || '').trim().length > 0;
  }

  // Trigger Generation: Click Generate / Arrow Button with complete event sequence + form submit + Enter fallback
  function triggerGenerate(btn, inputEl) {
    if (hasSubmittedPrompt) {
      console.log('[Flow AutoPrompt] Already submitted this prompt, skipping duplicate trigger.');
      return;
    }
    hasSubmittedPrompt = true;

    // 1. Force enable button if disabled & click with full pointer & mouse events
    if (btn) {
      try {
        btn.removeAttribute('disabled');
        btn.disabled = false;
        btn.classList.remove('mat-mdc-button-disabled', 'disabled');
        btn.removeAttribute('aria-disabled');
        btn.setAttribute('tabindex', '0');
        btn.focus();

        const rect = btn.getBoundingClientRect();
        const clientX = rect.left > 0 ? (rect.left + rect.width / 2) : 100;
        const clientY = rect.top > 0 ? (rect.top + rect.height / 2) : 100;

        const opts = {
          bubbles: true,
          cancelable: true,
          view: window,
          composed: true,
          detail: 1,
          clientX: clientX,
          clientY: clientY,
          button: 0,
          buttons: 1
        };

        const innerTarget = btn.querySelector('mat-icon, svg, span, button') || btn;

        btn.dispatchEvent(new PointerEvent('pointerdown', opts));
        btn.dispatchEvent(new MouseEvent('mousedown', opts));
        btn.dispatchEvent(new PointerEvent('pointerup', opts));
        btn.dispatchEvent(new MouseEvent('mouseup', opts));
        btn.dispatchEvent(new MouseEvent('click', opts));
        if (typeof btn.click === 'function') {
          btn.click();
        }

        if (innerTarget && innerTarget !== btn) {
          innerTarget.dispatchEvent(new PointerEvent('pointerdown', opts));
          innerTarget.dispatchEvent(new MouseEvent('mousedown', opts));
          innerTarget.dispatchEvent(new PointerEvent('pointerup', opts));
          innerTarget.dispatchEvent(new MouseEvent('mouseup', opts));
          innerTarget.dispatchEvent(new MouseEvent('click', opts));
          if (typeof innerTarget.click === 'function') {
            innerTarget.click();
          }
        }
      } catch (e) {
        console.warn('[Flow AutoPrompt] Button click error:', e);
        try { btn.click(); } catch(e2) {}
      }
    }

    // 2. Submit parent form directly if present (native HTML form submission triggers Angular ngSubmit)
    const form = btn?.closest('form') || inputEl?.closest('form') || document.querySelector('flow-prompt-box form, flow-base-prompt-box form, .prompt-box-container form');
    if (form) {
      try {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit(btn || undefined);
        } else {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      } catch (e) {
        try {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        } catch (e2) {}
      }
    }

    // 3. Dispatch Enter key sequence directly on inputEl (ProseMirror & Flow keyboard trigger)
    if (inputEl) {
      try {
        inputEl.focus();
        const enterOpts = {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          charCode: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window
        };
        inputEl.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        inputEl.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        inputEl.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
      } catch (e) {}
    }
  }

  // --- MEDIA SNAPSHOTTING & TRACKING ---

  // Helper to ensure we ONLY track genuine generated output images from the canvas,
  // NEVER input/reference images from prompt box, attachments, chips, avatars, or dataURLs!
  function isOutputMediaElement(el) {
    if (!el) return false;

    // 1. Strictly ignore anything inside prompt boxes, toolbar, sidebar, header, dialogs, chips
    if (el.closest('flow-prompt-box, flow-base-prompt-box, .prompt-box-container, .base-prompt-box, flow-rich-text-editor, .attachment-chip, .media-chip, flow-media-chip, form, footer, aside, .sidebar, [class*="prompt"], [class*="chip"]')) {
      return false;
    }

    // 2. Strictly ignore any extension elements
    if (el.closest('#amjad-flow-sidepanel, [id*="extension"]')) {
      return false;
    }

    const src = getMediaSrc(el);
    if (!src) return false;

    // 3. Strictly ignore inline base64 data URLs (Google Flow generated images are HTTPS or blob URLs, NEVER data URLs!)
    if (src.startsWith('data:')) {
      return false;
    }

    // 4. Ignore user profile avatars, system icons, emojis, logos
    if (src.includes('avatar') || src.includes('profile') || src.includes('favicon') || src.includes('logo') || src.includes('emoji')) {
      return false;
    }

    // 5. Must have reasonable size (real generated images are at least 80x80 pixels)
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 80) return false;
    if (rect.height > 0 && rect.height < 80) return false;

    return true;
  }

  function getMediaSrc(el) {
    if (!el) return null;
    let src = el.currentSrc || el.src || el.getAttribute('src') || el.srcset?.split(' ')[0] || el.getAttribute('data-src') || null;
    if (!src && el.style) {
      const bg = el.style.backgroundImage || (window.getComputedStyle ? window.getComputedStyle(el).backgroundImage : '');
      if (bg && bg.startsWith('url(')) {
        src = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
      }
    }
    return src;
  }

  function snapshotImages() {
    const mediaEls = Array.from(document.querySelectorAll('img, picture source, video')).filter(isOutputMediaElement);
    const images = mediaEls.map(getMediaSrc).filter(Boolean);
    existingImagesSnapshot = new Set(images);

    const errors = Array.from(document.querySelectorAll('.error-tile, .error-message, div[class*="error-"]'));
    existingErrorTilesSnapshot = new Set(errors);

    console.log(`[Flow AutoPrompt] Snapshot: ${existingImagesSnapshot.size} existing output images, ${existingErrorTilesSnapshot.size} existing error tiles.`);
  }

  function getNewGeneratedImages() {
    const mediaEls = Array.from(document.querySelectorAll('img, picture source, video')).filter(isOutputMediaElement);
    const newImages = [];
    const seen = new Set();

    for (const el of mediaEls) {
      const src = getMediaSrc(el);
      if (!src) continue;
      if (!existingImagesSnapshot.has(src) && !seen.has(src)) {
        seen.add(src);
        newImages.push(src);
      }
    }
    return newImages;
  }

  function areImagesFullyRendered(imageUrls) {
    if (!imageUrls || imageUrls.length === 0) return false;
    for (const url of imageUrls) {
      const imgs = Array.from(document.querySelectorAll('img')).filter(img => {
        if (!isOutputMediaElement(img)) return false;
        const src = getMediaSrc(img);
        return src === url || (src && url && (src.includes(url) || url.includes(src)));
      });
      if (imgs.length > 0) {
        const isLoaded = imgs.some(img => img.complete && img.naturalWidth > 64 && img.naturalHeight > 64 && isVisible(img));
        if (!isLoaded) return false;
      }
    }
    return true;
  }

  function isGeneratingActive() {
    // 1. In Google Flow, active glowing border has class 'loop' during active generation
    const glowLoop = document.querySelector('flow-border-glow.loop, [class*="border-glow"].loop, .loop');
    if (glowLoop && isVisible(glowLoop)) return true;

    // 2. Active loading spinners (must be visible and have non-zero dimensions)
    const spinners = document.querySelectorAll(
      'mat-spinner, mat-progress-spinner, [role="progressbar"], .spinner, [class*="loading-spinner"], [aria-busy="true"]'
    );
    for (const s of spinners) {
      if (s.isConnected && s.style.display !== 'none' && isVisible(s)) {
        const rect = s.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
      }
    }

    // 3. Tile skeleton / placeholder / shimmer loading elements in the tile viewport
    const loadingTiles = document.querySelectorAll(
      '[class*="skeleton"], [class*="shimmer"], [class*="tile-placeholder"], [class*="tile-loading"], flow-image-tile[loading], [class*="generating"]'
    );
    for (const lt of loadingTiles) {
      if (lt.isConnected && lt.style.display !== 'none' && isVisible(lt)) {
        const rect = lt.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
      }
    }

    return false;
  }

  function getNewErrorTiles() {
    const candidateTiles = Array.from(document.querySelectorAll(
      '.error-tile, div[class*="error-tile"], [class*="error-message"], .tile-error, [class*="tile"][class*="error"], [class*="error"]'
    ));
    return candidateTiles.filter(tile => {
      if (existingErrorTilesSnapshot.has(tile)) return false;
      if (!tile.isConnected || !isVisible(tile)) return false;
      // Do not count whole page container as error tile
      if (tile.tagName === 'BODY' || tile.tagName === 'HTML' || tile.classList.contains('content-container') || tile.classList.contains('virtual-scroll-container')) {
        return false;
      }
      const text = (tile.textContent || '').toLowerCase();
      return (
        tile.classList.contains('error-tile') ||
        tile.className.toString().includes('error-tile') ||
        text.includes('sorry') ||
        text.includes('failed') ||
        text.includes('could not generate') ||
        text.includes('unable to generate') ||
        text.includes('can\'t generate') ||
        text.includes('policy')
      );
    });
  }

  // --- AUTOMATION RUNNER ---

  function cleanPromptContent(text) {
    if (!text) return '';
    return text
      .replace(/^(?:#{1,6}\s*|\*{1,2}|_{1,2}|\[|\()?\s*(?:scene|image|img|prompt|shot|panel|frame|photo|picture|pic|cut|take|part|slide|act|chapter|generation|gen|render)(?:\s+#?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|[a-z]))?\s*[:\-\—\–]\s*/i, '')
      .replace(/^(?:\[|\()?#?\s*\d{1,2}(?::\d{2})?\s*(?:to|-|—|–)\s*#?\d{1,2}(?::\d{2})?\s*(?:\]|\))?\s*[:\-\—\–]?\s*/i, '')
      .replace(/^(?:\[|\()?#?\d+[\.\)\-:\—\–\]]\s*/, '')
      .replace(/^["']|["']$/g, '')
      .trim();
  }

  async function executePrompt(taskData) {
    if (isExecuting) {
      console.warn('[Flow AutoPrompt] Already executing, resetting lock for new task...');
    }
    isExecuting = true;
    hasSubmittedPrompt = false;
    startAudioKeepalive();
    connectKeepalivePort();
    isDownloading = false;
    stopTracking();

    const { index, prompt, rawPrompt, total, isRetry, referenceImage } = taskData;

    if (!isRetry) {
      currentRetryCount = 0;
    }

    const sceneHeader = `[Scene #${index + 1}/${total}]`;
    await addLogSW(`${sceneHeader} ${isRetry ? `(Retry #${currentRetryCount}) ` : ''}Injecting prompt into Flow...`);

    // 1. Snapshot existing media & existing error tiles
    snapshotImages();

    // 2. Activate prompt box & find prompt input element
    activatePromptBox();
    await sleep(100);

    let inputEl = findPromptInput();
    if (!inputEl) {
      for (let i = 0; i < 8; i++) {
        await sleep(400);
        activatePromptBox();
        inputEl = findPromptInput();
        if (inputEl) break;
      }
    }

    if (!inputEl) {
      isExecuting = false;
      const err = 'Prompt input box not found. Please ensure Flow studio / project is open on this tab.';
      await addLogSW(`❌ ${err}`);
      safeSend({ action: 'PROMPT_ERROR', promptIndex: index, error: err });
      return;
    }

    // 3. Attach character reference image if provided
    if (referenceImage) {
      await addLogSW(`${sceneHeader} Attaching character reference image...`);
      await attachReferenceImage(referenceImage, inputEl);
      await sleep(350);
    }

    // 4. Inject prompt cleanly into ProseMirror (Sanitized of any heading labels)
    const sanitizedPrompt = cleanPromptContent(prompt) || prompt;
    await injectTextIntoProseMirror(inputEl, sanitizedPrompt);
    await sleep(250);

    // 5. Find generate / arrow button (specifically the circular right-arrow button)
    let btn = findGenerateButton(inputEl);
    if (!btn) {
      await sleep(150);
      btn = findGenerateButton(inputEl);
    }

    // 6. Trigger generation
    triggerGenerate(btn, inputEl);
    if (btn) {
      const btnDesc = btn.getAttribute('aria-label') || btn.className?.slice(0, 25) || btn.tagName;
      await addLogSW(`${sceneHeader} Arrow button clicked (${btnDesc}). Starting generation...`);
    } else {
      await addLogSW(`${sceneHeader} Submitted via Enter / Form Submit. Starting generation...`);
    }

    // Safety nudges: if generation not yet detected, re-trigger at 600ms, 1400ms, and 2500ms
    [600, 1400, 2500].forEach((delay) => {
      setTimeout(() => {
        if (isExecuting && !isGeneratingActive()) {
          const freshBtn = findGenerateButton(inputEl) || btn;
          hasSubmittedPrompt = false;
          triggerGenerate(freshBtn, inputEl);
        }
      }, delay);
    });

    // 7. Start sequential tracking loop
    startTrackingGeneration(index, prompt, rawPrompt, total);
  }

  function startTrackingGeneration(promptIndex, promptText, rawPrompt, total) {
    const startTime = Date.now();
    let stableCount = 0;
    let lastFoundImages = [];
    let lastReportedSec = 0;

    chrome.storage.local.get(['maxTimeoutSeconds', 'expectedImages', 'subfolder'], (settings) => {
      const timeoutSec = (settings.maxTimeoutSeconds || 120) * 1000;
      const expectedImages = settings.expectedImages || 4;
      const subfolder = settings.subfolder || 'Flow_Batch';

      let isStepBusy = false;

      async function trackingStep() {
        if (!isExecuting || isPaused || isStepBusy) {
          return;
        }
        isStepBusy = true;

        try {
          const elapsed = Date.now() - startTime;
          const elapsedSec = Math.round(elapsed / 1000);

          // --- 1. INSPECT CURRENT FLOW STATE ---
          const currentNewImages = getNewGeneratedImages();
          const isStillGenerating = isGeneratingActive();
          const errorTiles = getNewErrorTiles();
          const totalResolved = currentNewImages.length + errorTiles.length;
          const imagesFullyLoaded = areImagesFullyRendered(currentNewImages);

          // Periodic tracking log every 5 seconds
          if (elapsedSec >= lastReportedSec + 5) {
            lastReportedSec = elapsedSec;
            await addLogSW(`[Scene #${promptIndex + 1}] Monitoring: ${currentNewImages.length}/${expectedImages} image(s) visible (${errorTiles.length} failed) | ${elapsedSec}s elapsed`);
          }

          // Track image count stability
          if (currentNewImages.length > 0) {
            if (currentNewImages.length === lastFoundImages.length) {
              stableCount++;
            } else {
              stableCount = 0;
              lastFoundImages = currentNewImages;
            }
          }

          // --- 2. SUCCESS PATH: WHEN TO PROCEED TO DOWNLOAD ---
          // Rule: DO NOT download prematurely on just 1 image!
          // We MUST wait until:
          // A. All expected images (e.g. 4) are generated AND completely visible & rendered in DOM.
          // B. All slots resolved (e.g. 2 succeeded + 2 failed error tiles >= expectedImages) AND rendered.
          // C. Extended grace period: If some images failed silently, wait AT LEAST 25s + 6s of stable state with no active generating spinners.
          if (currentNewImages.length > 0 && !isDownloading && imagesFullyLoaded) {
            const reachedTarget = currentNewImages.length >= expectedImages;
            const allSlotsResolved = totalResolved >= expectedImages;
            const partialDoneGracePeriod = !isStillGenerating && elapsed > 25000 && stableCount >= 6;
            const absoluteFailSafe = elapsed > 45000 && stableCount >= 8;

            if (reachedTarget || allSlotsResolved || partialDoneGracePeriod || absoluteFailSafe) {
              isDownloading = true;
              stopTracking();

              // Clean up any stray error tiles from DOM
              for (const et of errorTiles) {
                try { et.remove(); } catch(e) {}
              }

              const downloadTargets = currentNewImages.slice(0, expectedImages);
              const failedCount = Math.max(0, expectedImages - downloadTargets.length);
              if (failedCount > 0) {
                await addLogSW(`✅ Scene #${promptIndex + 1}: ${downloadTargets.length} of ${expectedImages} image(s) completely visible (${failedCount} failed). Starting download...`);
              } else {
                await addLogSW(`✅ Scene #${promptIndex + 1}: All ${downloadTargets.length} target image(s) completely visible! Starting download...`);
              }

              // Send download request to background service worker (waits until files are completely written to disk)
              safeSend({
                action: 'DOWNLOAD_IMAGES',
                imageUrls: downloadTargets,
                promptIndex: promptIndex,
                promptText: promptText,
                rawPrompt: rawPrompt,
                subfolder: subfolder,
                expectedImages: expectedImages
              }, async (res) => {
                const count = res?.count || downloadTargets.length;
                await addLogSW(`💾 Scene #${promptIndex + 1}: All ${count} image(s) completely downloaded to disk! Moving to next scene...`);

                isExecuting = false;

                // Notify prompt completion so service worker advances to next scene
                safeSend({
                  action: 'PROMPT_COMPLETED',
                  promptIndex: promptIndex,
                  imagesCount: count
                });
              });
              return;
            }
          }

          // --- 3. TOTAL FAILURE PATH: ONLY WHEN ALL IMAGES FAIL (0 SUCCESSES) ---
          // Rule: "phele proper jaiza lena hai ke total images hi generation fail ho gaye hai... bhut tezi se repeat nahi karna"
          // Condition: Exactly ZERO images generated, generation stopped, error tiles present, and elapsed > 10s
          if (currentNewImages.length === 0 && !isStillGenerating && elapsed > 10000 && errorTiles.length > 0) {
            stopTracking();

            // Safely clean error tiles from DOM
            for (const et of errorTiles) {
              const deleteBtn = et.querySelector('button[aria-label="Delete"], mat-icon, button');
              if (deleteBtn) {
                try { deleteBtn.click(); } catch(e) {}
              }
              try { et.remove(); } catch(e) {}
            }

            currentRetryCount++;
            if (currentRetryCount <= MAX_RETRIES) {
              await addLogSW(`⚠️ Scene #${promptIndex + 1}: All images failed to generate (0/${expectedImages}). Calmly waiting 8s before retrying SAME prompt... (Attempt ${currentRetryCount}/${MAX_RETRIES})`);
              await sleep(8000);

              // Re-run SAME prompt calmly
              isExecuting = false;
              executePrompt({
                index: promptIndex,
                prompt: promptText,
                rawPrompt: rawPrompt,
                total: total,
                isRetry: true
              });
              return;
            } else {
              await addLogSW(`❌ Scene #${promptIndex + 1} completely failed after ${MAX_RETRIES} attempts. Advancing to next prompt.`);
              isExecuting = false;
              safeSend({
                action: 'PROMPT_ERROR',
                promptIndex: promptIndex,
                error: `Failed after ${MAX_RETRIES} attempts`
              });
              return;
            }
          }

          // --- 4. TIMEOUT WATCHDOG ---
          if (elapsed > timeoutSec && !isDownloading) {
            stopTracking();

            if (currentNewImages.length > 0) {
              // Partial success on timeout - download what was generated!
              isDownloading = true;
              await addLogSW(`⚠️ Scene #${promptIndex + 1} timeout reached. Downloading ${currentNewImages.length} generated image(s)...`);
              safeSend({
                action: 'DOWNLOAD_IMAGES',
                imageUrls: currentNewImages,
                promptIndex: promptIndex,
                promptText: promptText,
                rawPrompt: rawPrompt,
                subfolder: subfolder
              }, () => {
                isExecuting = false;
                safeSend({
                  action: 'PROMPT_COMPLETED',
                  promptIndex: promptIndex,
                  imagesCount: currentNewImages.length
                });
              });
              return;
            }

            // Timeout with 0 images
            currentRetryCount++;
            if (currentRetryCount <= MAX_RETRIES) {
              await addLogSW(`⚠️ Scene #${promptIndex + 1} timed out with 0 images. Calmly waiting 8s before retry... (Attempt ${currentRetryCount}/${MAX_RETRIES})`);
              await sleep(8000);
              isExecuting = false;
              executePrompt({
                index: promptIndex,
                prompt: promptText,
                rawPrompt: rawPrompt,
                total: total,
                isRetry: true
              });
            } else {
              await addLogSW(`❌ Scene #${promptIndex + 1} timed out after ${MAX_RETRIES} attempts.`);
              isExecuting = false;
              safeSend({
                action: 'PROMPT_ERROR',
                promptIndex: promptIndex,
                error: `Timeout after ${MAX_RETRIES} attempts`
              });
            }
            return;
          }

        // Schedule next check safely (no overlapping intervals)
        if (isExecuting && !isPaused && !isDownloading) {
          trackingTimerId = setTimeout(trackingStep, 1000);
        }
      } finally {
        isStepBusy = false;
      }
    }

    // Expose trackingStep to IPC keepalive Port tick
    window.__triggerTrackingStep = trackingStep;

    // Start initial step
    trackingTimerId = setTimeout(trackingStep, 1000);
  });
}

  // --- MESSAGE LISTENER FROM EXTENSION & SERVICE WORKER ---
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.action) return false;

      switch (message.action) {
        case 'PING':
          sendResponse({ alive: true });
          return false;

        case 'RUN_PROMPT':
          isExecuting = false; // Always clear previous lock when explicit RUN_PROMPT arrives
          isPaused = false;
          isDownloading = false;
          stopTracking();
          executePrompt(message.data);
          sendResponse({ received: true });
          return false;

        case 'PAUSE':
          isPaused = true;
          isExecuting = false;
          stopTracking();
          sendResponse({ paused: true });
          return false;

        case 'STOP':
          isPaused = false;
          isExecuting = false;
          isDownloading = false;
          stopTracking();
          sendResponse({ stopped: true });
          return false;

        case 'QUEUE_FINISHED':
          stopTracking();
          isExecuting = false;
          playCompletionTone();
          sendResponse({ played: true });
          return false;

        default:
          return false;
      }
    });
  }
})();
