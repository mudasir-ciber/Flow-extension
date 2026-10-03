// AMJAD'S FLOW EXTENSION - Main World Injection Script
// Runs directly in Google Flow's execution context (MAIN world)
// Keeps Angular, Zone.js, and background timers running at full speed when minimized.
// Also bridges ProseMirror document transactions & Angular reactive form submission.

(function () {
  'use strict';

  if (window.__FLOW_MAIN_WORLD_INJECTED) return;
  window.__FLOW_MAIN_WORLD_INJECTED = true;

  console.log("[AMJAD'S FLOW] Main world engine active.");

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
  try {
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCAF = window.cancelAnimationFrame.bind(window);
    const activeTimeouts = new Map();

    let lastRafTime = performance.now();
    let isNativeRafStalled = false;

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

  // 5. Google Flow ProseMirror & Angular Form Bridge (MAIN WORLD)
  function getProseMirrorView(el) {
    let target = el || document.querySelector('.ProseMirror');
    if (!target) return null;

    function checkNode(node) {
      if (!node) return null;
      if (node.pmViewDesc) {
        if (node.pmViewDesc.editorView) return node.pmViewDesc.editorView;
        if (node.pmViewDesc.view) return node.pmViewDesc.view;
      }
      if (node.__pmView) return node.__pmView;
      if (node.editorView) return node.editorView;
      return null;
    }

    let cur = target;
    while (cur && cur !== document.body) {
      const v = checkNode(cur);
      if (v) return v;
      cur = cur.parentElement;
    }

    const children = target.querySelectorAll ? target.querySelectorAll('*') : [];
    for (const c of children) {
      const v = checkNode(c);
      if (v) return v;
    }

    const all = document.querySelectorAll('.ProseMirror');
    for (const p of all) {
      const v = checkNode(p);
      if (v) return v;
      for (const c of p.querySelectorAll('*')) {
        const v2 = checkNode(c);
        if (v2) return v2;
      }
    }
    return null;
  }

  function runInAngularZone(fn) {
    if (window.Zone && window.Zone.current) {
      return window.Zone.current.run(fn);
    }
    return fn();
  }

  function createEnterKeyEvent(type) {
    const evt = new KeyboardEvent(type, {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      charCode: type === 'keypress' ? 13 : 0,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      repeat: false
    });
    try { Object.defineProperty(evt, 'keyCode', { value: 13, configurable: true }); } catch (e) {}
    try { Object.defineProperty(evt, 'which', { value: 13, configurable: true }); } catch (e) {}
    try { Object.defineProperty(evt, 'charCode', { value: type === 'keypress' ? 13 : 0, configurable: true }); } catch (e) {}
    return evt;
  }

  function handleMainWorldInject(text) {
    if (!text) return;
    runInAngularZone(() => {
      const prose = document.querySelector('flow-rich-text-editor .ProseMirror, flow-base-prompt-box .ProseMirror, .prompt-box-container .ProseMirror, .ProseMirror');
      if (!prose) return;

      prose.focus();

      // 1. Native ProseMirror View dispatch
      const view = getProseMirrorView(prose);
      if (view && view.state && view.dispatch) {
        try {
          const schema = view.state.schema;
          let tr = view.state.tr;
          tr = tr.delete(0, view.state.doc.content.size);
          if (schema.nodes.paragraph) {
            const textNode = text ? schema.text(text) : undefined;
            const pNode = schema.nodes.paragraph.create(null, textNode);
            tr = tr.replaceWith(0, tr.doc.content.size, pNode);
          } else {
            tr = tr.insertText(text, 0);
          }
          view.dispatch(tr);
          view.focus();
          console.log("[AMJAD'S FLOW MAIN] ProseMirror transaction succeeded!");
        } catch (err) {
          try {
            const tr = view.state.tr.insertText(text, 0, view.state.doc.content.size);
            view.dispatch(tr);
            console.log("[AMJAD'S FLOW MAIN] ProseMirror fallback insertText succeeded!");
          } catch (e2) {
            console.warn("[AMJAD'S FLOW MAIN] PM dispatch error:", err, e2);
          }
        }
      }

      // 2. Selection inside ProseMirror (placed at end of text)
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(prose);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {}

      // 3. Paste with defined clipboardData
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true });
        Object.defineProperty(pasteEvt, 'clipboardData', { value: dt, writable: false, configurable: true });
        prose.dispatchEvent(pasteEvt);
      } catch (err) {}

      // 4. execCommand insertText
      try {
        document.execCommand('insertText', false, text);
      } catch (err) {}

      // 5. Input events
      try {
        prose.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text }));
        prose.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text }));
      } catch (err) {}

      prose.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      prose.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      // 6. Angular Change Detection trigger
      if (window.ng) {
        try {
          const comp = window.ng.getComponent(prose) || window.ng.getComponent(prose.closest('flow-rich-text-editor, flow-base-prompt-box') || prose);
          if (comp) window.ng.applyChanges(comp);
        } catch (err) {}
      }
    });
  }

  function handleMainWorldSubmit() {
    runInAngularZone(() => {
      const prose = document.querySelector('flow-rich-text-editor .ProseMirror, flow-base-prompt-box .ProseMirror, .prompt-box-container .ProseMirror, .ProseMirror');
      const btn = document.querySelector('flow-generate-icon-button button, button[aria-label="Start generation"], button.generate-icon-button, button[flow-icon-button][type="submit"]');
      const host = document.querySelector('flow-generate-icon-button');

      console.log("[AMJAD'S FLOW MAIN] Executing submit in main world...");

      // 1. Direct ProseMirror Keymap Enter Trigger (Crucial for Flow)
      if (prose) {
        prose.focus();
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(prose);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {}

        const view = getProseMirrorView(prose);
        if (view && typeof view.someProp === 'function') {
          try {
            const kd = createEnterKeyEvent('keydown');
            const handled = view.someProp('handleKeyDown', f => f(view, kd));
            console.log("[AMJAD'S FLOW MAIN] view.someProp handleKeyDown Enter result:", handled);
          } catch (e) {
            console.warn("[AMJAD'S FLOW MAIN] view keydown error:", e);
          }
        }

        // 2. Dispatch Enter Key sequence on ProseMirror, active element, parents, document, window
        const enterTargets = [
          prose,
          prose.querySelector('p'),
          document.activeElement,
          prose.closest('flow-rich-text-editor'),
          prose.closest('flow-base-prompt-box'),
          prose.closest('flow-prompt-box'),
          document,
          window
        ].filter(Boolean);

        for (const t of enterTargets) {
          try {
            t.dispatchEvent(createEnterKeyEvent('keydown'));
            t.dispatchEvent(createEnterKeyEvent('keypress'));
            t.dispatchEvent(createEnterKeyEvent('keyup'));
          } catch (e) {}
        }
      }

      // 3. Forcibly unlock button DOM & Angular component
      if (btn) {
        btn.removeAttribute('disabled');
        btn.disabled = false;
        btn.classList.remove('mat-mdc-button-disabled');
        btn.setAttribute('aria-disabled', 'false');
      }

      if (window.ng && host) {
        try {
          const comp = window.ng.getComponent(host);
          if (comp) {
            comp.disabled = false;
            for (const fn of ['handleClick', 'generate', 'onClick', 'startGeneration', 'onGenerate']) {
              if (typeof comp[fn] === 'function') comp[fn]();
            }
            window.ng.applyChanges(comp);
          }
        } catch (err) {}
      }

      // 4. Click button and sub-elements
      if (btn) {
        const clickTargets = [
          btn,
          btn.querySelector('mat-icon'),
          btn.querySelector('.mat-mdc-button-touch-target'),
          host
        ].filter(Boolean);

        for (const target of clickTargets) {
          try {
            target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, buttons: 1 }));
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, buttons: 1 }));
            target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            if (typeof target.click === 'function') target.click();
          } catch (err) {}
        }
      }

      // 5. Submit parent form
      const form = btn?.closest('form') || prose?.closest('form') || document.querySelector('flow-prompt-box form, .prompt-box-container form, form');
      if (form) {
        try {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit(btn || undefined);
          } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        } catch (err) {
          try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch(e2) {}
        }
      }
    });
  }

  // Multi-Channel Communication:
  // Channel A: window.postMessage (Standard cross-world communication)
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'AMJAD_FLOW_ISOLATED') return;

    if (event.data.action === 'INJECT_PROMPT') {
      handleMainWorldInject(event.data.prompt);
    } else if (event.data.action === 'TRIGGER_SUBMIT' || event.data.action === 'TRIGGER_GENERATE') {
      handleMainWorldSubmit();
    } else if (event.data.action === 'INJECT_AND_SUBMIT') {
      handleMainWorldInject(event.data.prompt);
      setTimeout(handleMainWorldSubmit, 200);
    }
  });

  // Channel B: document CustomEvents (DOM-level cross-world communication)
  document.addEventListener('__FLOW_MAIN_INJECT_PROMPT', (e) => {
    const text = e.detail?.prompt || '';
    if (text) handleMainWorldInject(text);
  });

  document.addEventListener('__FLOW_MAIN_TRIGGER_SUBMIT', () => {
    handleMainWorldSubmit();
  });

  document.addEventListener('__FLOW_MAIN_TRIGGER_GENERATE', () => {
    handleMainWorldSubmit();
  });
})();
