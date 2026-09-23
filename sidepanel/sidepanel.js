// AMJAD'S FLOW EXTENSION - Side Panel Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Safe runtime message helper
  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Elements: Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // HOME Tab Elements
  const globalStatusPill = document.getElementById('global-status-pill');
  const monitorStatusBadge = document.getElementById('monitor-status-badge');
  const monitorProgressFill = document.getElementById('monitor-progress-fill');
  const statCurrentScene = document.getElementById('stat-current-scene');
  const statDownloadedCount = document.getElementById('stat-downloaded-count');
  const statPercentage = document.getElementById('stat-percentage');
  const monitorActivePromptText = document.getElementById('monitor-active-prompt-text');
  const btnRunBatch = document.getElementById('btn-run-batch');
  const runBtnLabel = document.getElementById('run-btn-label');
  const btnPauseResume = document.getElementById('btn-pause-resume');
  const pauseBtnLabel = document.getElementById('pause-btn-label');
  const btnCancelBatch = document.getElementById('btn-cancel-batch');
  const btnResetAll = document.getElementById('btn-reset-all');
  const logTerminal = document.getElementById('log-terminal');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // PROMPTS Tab Elements
  const bulkPromptsInput = document.getElementById('bulk-prompts-input');
  const parsedCountBadge = document.getElementById('parsed-count-badge');
  const btnPromptsToHome = document.getElementById('btn-prompts-to-home');
  const btnClearPrompts = document.getElementById('btn-clear-prompts');
  const parsedPreviewCard = document.getElementById('parsed-preview-card');
  const previewCountHint = document.getElementById('preview-count-hint');
  const parsedPreviewList = document.getElementById('parsed-preview-list');

  // CHARACTER Tab Elements
  const charValidationBanner = document.getElementById('character-validation-banner');
  const charValidationText = document.getElementById('char-validation-text');
  const badgeSheetStatus = document.getElementById('badge-sheet-status');
  const badgeDescStatus = document.getElementById('badge-desc-status');
  const refImageDropzone = document.getElementById('ref-image-dropzone');
  const refImageFileInput = document.getElementById('ref-image-file-input');
  const dropzoneEmptyState = document.getElementById('dropzone-empty-state');
  const dropzonePreviewState = document.getElementById('dropzone-preview-state');
  const refImagePreview = document.getElementById('ref-image-preview');
  const btnCopyRefImg = document.getElementById('btn-copy-ref-img');
  const btnRemoveRefImg = document.getElementById('btn-remove-ref-img');
  const characterAnchorInput = document.getElementById('character-anchor-input');
  const anchorPositionRadios = document.getElementsByName('anchor-position');

  // SETTINGS Tab Elements
  const themeBtns = document.querySelectorAll('.theme-btn');
  const settingSubfolder = document.getElementById('setting-subfolder');
  const settingDelay = document.getElementById('setting-delay');
  const settingExpectedImages = document.getElementById('setting-expected-images');
  const settingTimeout = document.getElementById('setting-timeout');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  // --- TAB NAVIGATION ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  function switchTab(targetId) {
    tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === targetId));
    tabContents.forEach(c => c.classList.toggle('active', c.id === targetId));
  }

  btnPromptsToHome.addEventListener('click', () => {
    switchTab('tab-home');
  });

  // --- INTELLIGENT PROMPT PARSER (SMART HEADING & SCENE SEGMENTATION) ---
  const KEYWORD_PATTERN = '(?:scene|image|img|prompt|shot|panel|frame|photo|picture|pic|cut|take|part|slide|act|chapter|generation|gen|render)';
  const NUMBER_PATTERN = '(?:#?\\s*(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|[a-z]))';

  // Matches pure heading lines (e.g. "scene 1 :", "IMAGE 2", "**Prompt 3:**", "Shot #01 -")
  const PURE_HEADING_REGEX = new RegExp(
    '^(?:#{1,6}\\s*|\\*{1,2}|_{1,2}|\\[|\\()?\\s*' +
    KEYWORD_PATTERN +
    '(?:\\s+' + NUMBER_PATTERN + ')?' +
    '\\s*(?:[:\\-\\—\\–]\\s*)?' +
    '(?:\\*{1,2}|_{1,2}|\\]|\\))?\\s*$',
    'i'
  );

  // Matches standalone number lines (e.g. "1.", "1:", "1 :", "(1)", "[1]", "#1")
  const STANDALONE_NUMBER_REGEX = /^(?:#{1,6}\s*|\*{1,2}|_{1,2}|\[|\()?\s*#?\d+\s*[\.\)\-:\—\–\]]?\s*(?:\*{1,2}|_{1,2})?\s*$/;

  // Matches horizontal dividers ("---", "===", "***")
  const DIVIDER_REGEX = /^[\-\=\*\_\~]{3,}$/;

  // Matches inline heading prefix at the start of a prompt (e.g. "Scene 1: ...", "Prompt #2 - ...")
  const INLINE_HEADING_PREFIX_REGEX = new RegExp(
    '^(?:#{1,6}\\s*|\\*{1,2}|_{1,2}|\\[|\\()?\\s*' +
    KEYWORD_PATTERN +
    '(?:\\s+' + NUMBER_PATTERN + ')?' +
    '\\s*[:\\-\\—\\–]\\s*',
    'i'
  );

  // Matches inline numbered list prefix (e.g. "1. ...", "2) ...", "[3] ...")
  const INLINE_NUMBER_PREFIX_REGEX = /^(?:\[|\()?#?\d+[\.\)\-:\—\–\]]\s*/;

  function isPureHeading(line) {
    const trimmed = (line || '').trim();
    if (!trimmed) return false;
    if (DIVIDER_REGEX.test(trimmed)) return true;
    if (PURE_HEADING_REGEX.test(trimmed)) return true;
    if (STANDALONE_NUMBER_REGEX.test(trimmed)) return true;
    return false;
  }

  function extractInlinePrompt(line) {
    const trimmed = (line || '').trim();
    const m1 = trimmed.match(INLINE_HEADING_PREFIX_REGEX);
    if (m1) {
      let rest = trimmed.slice(m1[0].length).trim();
      rest = rest.replace(/^[\*\_\)\]\}\s]+|[\*\_\)\]\}\s]+$/g, '');
      return rest.replace(/^["']|["']$/g, '').trim();
    }
    const m2 = trimmed.match(INLINE_NUMBER_PREFIX_REGEX);
    if (m2) {
      const rest = trimmed.slice(m2[0].length).trim();
      return rest.replace(/^["']|["']$/g, '').trim();
    }
    return null;
  }

  function parsePrompts(rawText) {
    if (!rawText || !rawText.trim()) return [];

    const rawLines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Strategy 1: Scene Headings segmentation (e.g. "scene 1 :", "IMAGE 2", "Prompt 3:")
    const hasPureHeadings = rawLines.some(l => isPureHeading(l));

    if (hasPureHeadings) {
      const prompts = [];
      let currentLines = [];

      for (let i = 0; i < rawLines.length; i++) {
        const trimmed = rawLines[i].trim();
        if (isPureHeading(trimmed)) {
          if (currentLines.length > 0) {
            const combined = currentLines.join(' ').trim();
            if (combined.length > 0) {
              prompts.push(combined);
            }
            currentLines = [];
          }
        } else if (trimmed.length > 0) {
          const inline = extractInlinePrompt(trimmed);
          currentLines.push(inline !== null ? inline : trimmed);
        }
      }

      if (currentLines.length > 0) {
        const combined = currentLines.join(' ').trim();
        if (combined.length > 0) {
          prompts.push(combined);
        }
      }

      if (prompts.length > 0) {
        return prompts;
      }
    }

    // Strategy 2: Inline Headings per line (e.g. "Scene 1: ...\nScene 2: ...")
    const inlinePrompts = [];
    let hasInlinePattern = true;
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const extracted = extractInlinePrompt(trimmed);
      if (extracted !== null && extracted.length > 0) {
        inlinePrompts.push(extracted);
      } else {
        hasInlinePattern = false;
        break;
      }
    }

    if (hasInlinePattern && inlinePrompts.length > 0) {
      return inlinePrompts;
    }

    // Strategy 3: Double-newline block separation
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = normalized.split(/\n\s*\n+/);
    if (blocks.length > 1) {
      const parsedBlocks = [];
      for (const b of blocks) {
        const bTrimmed = b.trim();
        if (bTrimmed && !isPureHeading(bTrimmed)) {
          const combined = bTrimmed.split(/\n+/).map(l => l.trim()).join(' ').trim();
          const inline = extractInlinePrompt(combined);
          const cleaned = inline !== null ? inline : combined;
          if (cleaned.length > 0) {
            parsedBlocks.push(cleaned);
          }
        }
      }
      if (parsedBlocks.length > 0) {
        return parsedBlocks;
      }
    }

    // Strategy 4: Single line per prompt (fallback)
    const result = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed && !isPureHeading(trimmed)) {
        const inline = extractInlinePrompt(trimmed);
        const cleaned = inline !== null ? inline : trimmed;
        if (cleaned.length > 0) {
          result.push(cleaned);
        }
      }
    }
    return result;
  }

  function updatePromptCount() {
    const prompts = parsePrompts(bulkPromptsInput.value);
    parsedCountBadge.textContent = prompts.length === 1 ? '1 Prompt' : `${prompts.length} Prompts`;
    parsedCountBadge.className = prompts.length > 0 ? 'badge badge-accent' : 'badge';

    // Live Clean Prompts Preview
    if (prompts.length > 0) {
      if (parsedPreviewCard) parsedPreviewCard.style.display = 'block';
      if (previewCountHint) previewCountHint.textContent = `${prompts.length} scene(s) ready`;
      if (parsedPreviewList) {
        parsedPreviewList.innerHTML = prompts.map((p, idx) => `
          <div class="preview-item">
            <div class="preview-item-header">
              <span class="preview-item-tag">Scene #${idx + 1}</span>
              <span class="preview-item-chars">${p.length} chars</span>
            </div>
            <div class="preview-item-body">${escapeHtml(p)}</div>
          </div>
        `).join('');
      }
    } else {
      if (parsedPreviewCard) parsedPreviewCard.style.display = 'none';
      if (parsedPreviewList) parsedPreviewList.innerHTML = '';
    }
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  bulkPromptsInput.addEventListener('input', () => {
    updatePromptCount();
    chrome.storage.local.set({ savedRawPrompts: bulkPromptsInput.value });
  });

  btnClearPrompts.addEventListener('click', () => {
    bulkPromptsInput.value = '';
    updatePromptCount();
    chrome.storage.local.set({ savedRawPrompts: '' });
  });

  // --- CHARACTER CONSISTENCY & VALIDATION ---
  function validateCharacterRequirements() {
    const hasImage = !!refImagePreview.src && refImagePreview.src.startsWith('data:image');
    const hasDesc = !!characterAnchorInput.value.trim();

    badgeSheetStatus.textContent = hasImage ? '✅ Uploaded' : 'Not Uploaded';
    badgeSheetStatus.className = hasImage ? 'badge badge-success' : 'badge';

    badgeDescStatus.textContent = hasDesc ? '✅ Provided' : 'Empty';
    badgeDescStatus.className = hasDesc ? 'badge badge-success' : 'badge';

    if (hasImage || hasDesc) {
      charValidationBanner.className = 'validation-banner valid';
      charValidationText.textContent = '✅ Character requirement satisfied (Image ya Description mojood hai).';
      return true;
    } else {
      charValidationBanner.className = 'validation-banner';
      charValidationText.textContent = '⚠️ Dono mein se kisi ek ko fill karna lazmi hai (Image ya Description)!';
      return false;
    }
  }

  characterAnchorInput.addEventListener('input', () => {
    validateCharacterRequirements();
    chrome.storage.local.set({ characterAnchor: characterAnchorInput.value });
  });

  anchorPositionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      chrome.storage.local.set({ anchorPosition: radio.value });
    });
  });

  // Character Sheet Image Upload / Drop
  refImageDropzone.addEventListener('click', (e) => {
    if (e.target === btnCopyRefImg || e.target === btnRemoveRefImg) return;
    refImageFileInput.click();
  });

  refImageFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
  });

  refImageDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    refImageDropzone.classList.add('drag-over');
  });

  refImageDropzone.addEventListener('dragleave', () => {
    refImageDropzone.classList.remove('drag-over');
  });

  refImageDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    refImageDropzone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setReferenceImage(dataUrl);
      chrome.storage.local.set({ referenceImage: dataUrl });
      validateCharacterRequirements();
    };
    reader.readAsDataURL(file);
  }

  function setReferenceImage(dataUrl) {
    if (dataUrl) {
      refImagePreview.src = dataUrl;
      dropzoneEmptyState.style.display = 'none';
      dropzonePreviewState.style.display = 'block';
    } else {
      refImagePreview.src = '';
      dropzoneEmptyState.style.display = 'block';
      dropzonePreviewState.style.display = 'none';
    }
    validateCharacterRequirements();
  }

  btnRemoveRefImg.addEventListener('click', (e) => {
    e.stopPropagation();
    setReferenceImage(null);
    chrome.storage.local.set({ referenceImage: null });
    validateCharacterRequirements();
  });

  btnCopyRefImg.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const response = await fetch(refImagePreview.src);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      const origText = btnCopyRefImg.textContent;
      btnCopyRefImg.textContent = '✅ Copied!';
      setTimeout(() => btnCopyRefImg.textContent = origText, 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
      alert('Could not copy image to clipboard. Browser permission restricted.');
    }
  });

  // --- THEME SETTINGS ---
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      applyTheme(theme);
      chrome.storage.local.set({ selectedTheme: theme });
    });
  });

  function applyTheme(themeName) {
    document.body.className = themeName || 'theme-dark';
    themeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-theme') === themeName));
  }

  // --- GENERAL SETTINGS ---
  btnSaveSettings.addEventListener('click', async () => {
    await chrome.storage.local.set({
      subfolder: settingSubfolder.value.trim() || 'Flow_Batch',
      delaySeconds: parseInt(settingDelay.value, 10) || 10,
      expectedImages: parseInt(settingExpectedImages.value, 10) || 4,
      maxTimeoutSeconds: parseInt(settingTimeout.value, 10) || 120
    });
    const orig = btnSaveSettings.textContent;
    btnSaveSettings.textContent = '✅ Settings Saved!';
    setTimeout(() => btnSaveSettings.textContent = orig, 1500);
  });

  // --- HOME BATCH CONTROLS: RUN, PAUSE, CANCEL, RESET ---
  btnRunBatch.addEventListener('click', async () => {
    const rawPrompts = parsePrompts(bulkPromptsInput.value);
    if (rawPrompts.length === 0) {
      alert('⚠️ Please enter prompts in the PROMPTS tab before running!');
      switchTab('tab-prompts');
      return;
    }

    // Validate Character Requirement: At least one must be filled!
    const isCharacterValid = validateCharacterRequirements();
    if (!isCharacterValid) {
      const proceedAnyway = confirm('⚠️ CHARACTER REQUIREMENT NOTICE:\n\nAapne na character sheet image upload ki hai aur na hi description likha hai.\n\nCharacter consistency maintain karne ke liye dono mein se ek lazmi hona chahiye. Kya aap CHARACTER tab mein ja kar add karna chahte hain?');
      if (proceedAnyway) {
        switchTab('tab-character');
        return;
      }
    }

    // Check if Google Flow tab is open
    let flowTab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs && tabs[0] && (tabs[0].url || '').includes('flow.google')) {
        flowTab = tabs[0];
      }
    } catch (e) {}

    if (!flowTab) {
      const response = await sendRuntimeMessage({ action: 'FIND_FLOW_TAB' });
      flowTab = response?.tab;
    }

    if (!flowTab) {
      const openNow = confirm('Google Flow (flow.google.com) kisi tab mein open nahi hai.\n\nKya aap abhi open karna chahte hain?');
      if (openNow) {
        chrome.tabs.create({ url: 'https://flow.google.com' });
      }
      return;
    }

    // Build strictly locked sequential queue
    const queue = rawPrompts.map((p, idx) => ({
      id: idx + 1,
      prompt: p,
      status: 'pending',
      downloadedCount: 0
    }));

    let anchorPos = 'prefix';
    for (const r of anchorPositionRadios) {
      if (r.checked) anchorPos = r.value;
    }

    // Immediate UI feedback
    updateUIState({
      status: 'running',
      queue: queue,
      currentIndex: 0,
      stats: { totalPrompts: queue.length, completedPrompts: 0, downloadedImages: 0 }
    });

    startSidePanelAudioKeepalive();

    const { referenceImage = null } = await chrome.storage.local.get('referenceImage');

    const startRes = await sendRuntimeMessage({
      action: 'START_BATCH',
      queue: queue,
      characterAnchor: characterAnchorInput.value,
      anchorPosition: anchorPos,
      referenceImage: referenceImage || null,
      subfolder: settingSubfolder.value.trim() || 'Flow_Batch',
      delaySeconds: parseInt(settingDelay.value, 10) || 5,
      expectedImages: parseInt(settingExpectedImages.value, 10) || 4,
      maxTimeoutSeconds: parseInt(settingTimeout.value, 10) || 120
    });

    if (startRes && startRes.error) {
      alert('⚠️ Start Batch Notice: ' + startRes.error);
    }
  });

  btnPauseResume.addEventListener('click', async () => {
    const { status } = await chrome.storage.local.get('status');
    if (status === 'running') {
      sendRuntimeMessage({ action: 'PAUSE_BATCH' });
    } else if (status === 'paused') {
      sendRuntimeMessage({ action: 'RESUME_BATCH' });
    }
  });

  btnCancelBatch.addEventListener('click', () => {
    if (confirm('Cancel current batch run?')) {
      sendRuntimeMessage({ action: 'STOP_BATCH' });
    }
  });

  // COMPLETE RESET (All Clear Fresh)
  btnResetAll.addEventListener('click', async () => {
    const confirmReset = confirm('⚠️ RESET ALL (CLEAR EVERYTHING):\n\nKya aap sab kuch bilkul fresh aur clear karna chahte hain?\n\nYeh aapki saari prompts, character details, logs aur queue ko 0 kar dega.');
    if (!confirmReset) return;

    // Stop background worker
    sendRuntimeMessage({ action: 'STOP_BATCH' });

    // Clear and restore clean defaults in storage
    await chrome.storage.local.set({
      queue: [],
      currentIndex: 0,
      status: 'idle',
      savedRawPrompts: '',
      characterAnchor: '',
      referenceImage: null,
      stats: { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 },
      logs: [{ timestamp: new Date().toLocaleTimeString(), text: 'System reset: Clean fresh state.' }]
    });

    // Reset all UI fields
    bulkPromptsInput.value = '';
    updatePromptCount();
    characterAnchorInput.value = '';
    setReferenceImage(null);
    validateCharacterRequirements();
    logTerminal.innerHTML = '';
    renderLogs([{ timestamp: new Date().toLocaleTimeString(), text: 'System reset: Clean fresh state.' }]);

    // Update state to Idle
    updateUIState({
      status: 'idle',
      queue: [],
      currentIndex: 0,
      stats: { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 }
    });

    alert('✨ Reset Complete! All clear and ready for a fresh batch.');
  });

  btnClearLogs.addEventListener('click', () => {
    logTerminal.innerHTML = '';
    chrome.storage.local.set({ logs: [] });
  });

  // --- UI UPDATE & REACTIVE SYNC ---
  function updateUIState(state) {
    const status = state.status || 'idle';
    const queue = state.queue || [];
    const currentIndex = state.currentIndex || 0;
    const stats = state.stats || { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 };

    // Status Badges
    globalStatusPill.textContent = status.toUpperCase();
    globalStatusPill.className = `status-pill ${status}`;

    monitorStatusBadge.textContent = status.toUpperCase();
    monitorStatusBadge.className = `badge ${status}`;

    // Control Buttons
    btnRunBatch.disabled = status === 'running';
    btnPauseResume.disabled = status !== 'running' && status !== 'paused';
    btnCancelBatch.disabled = status === 'idle' || status === 'completed';

    if (status === 'paused') {
      btnPauseResume.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> <span id="pause-btn-label">Resume</span>`;
    } else {
      btnPauseResume.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> <span id="pause-btn-label">Pause</span>`;
    }

    // Stats
    const total = queue.length || stats.totalPrompts || 0;
    const currentDisplay = total > 0 ? Math.min(currentIndex + 1, total) : 0;
    statCurrentScene.textContent = `${currentDisplay} / ${total}`;
    statDownloadedCount.textContent = stats.downloadedImages || 0;

    const percent = total > 0 ? Math.round((stats.completedPrompts / total) * 100) : 0;
    statPercentage.textContent = `${percent}%`;
    monitorProgressFill.style.width = `${percent}%`;

    // Active Prompt Box
    if (status === 'running' || status === 'paused') {
      if (queue[currentIndex]) {
        monitorActivePromptText.textContent = `[Scene #${currentIndex + 1} of ${total}]: ${queue[currentIndex].prompt}`;
      }
    } else if (status === 'completed') {
      monitorActivePromptText.textContent = '🎉 All prompts completed and downloaded successfully!';
    } else {
      monitorActivePromptText.textContent = 'No prompt is currently running.';
    }
  }

  function renderLogs(logs) {
    if (!logs) return;
    logTerminal.innerHTML = '';
    logs.forEach(appendLogEntry);
    logTerminal.scrollTop = logTerminal.scrollHeight;
  }

  function appendLogEntry(log) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="log-time">[${log.timestamp}]</span> ${escapeHTML(log.text)}`;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- INITIAL DATA LOAD ---
  const initialState = await chrome.storage.local.get([
    'savedRawPrompts',
    'characterAnchor',
    'anchorPosition',
    'referenceImage',
    'selectedTheme',
    'subfolder',
    'delaySeconds',
    'expectedImages',
    'maxTimeoutSeconds',
    'status',
    'queue',
    'currentIndex',
    'stats',
    'logs'
  ]);

  if (initialState.savedRawPrompts) {
    bulkPromptsInput.value = initialState.savedRawPrompts;
    updatePromptCount();
  }

  if (initialState.characterAnchor) {
    characterAnchorInput.value = initialState.characterAnchor;
  }

  if (initialState.anchorPosition) {
    anchorPositionRadios.forEach(r => {
      r.checked = r.value === initialState.anchorPosition;
    });
  }

  if (initialState.referenceImage) {
    setReferenceImage(initialState.referenceImage);
  }

  if (initialState.selectedTheme) {
    applyTheme(initialState.selectedTheme);
  }

  if (initialState.subfolder) settingSubfolder.value = initialState.subfolder;
  if (initialState.delaySeconds) settingDelay.value = initialState.delaySeconds;
  if (initialState.expectedImages) settingExpectedImages.value = initialState.expectedImages;
  if (initialState.maxTimeoutSeconds) settingTimeout.value = initialState.maxTimeoutSeconds;

  validateCharacterRequirements();
  updateUIState(initialState);
  renderLogs(initialState.logs || []);

  // --- BACKGROUND KEEPALIVE & AUDIO PERSISTENCE ---
  let sidePanelAudioCtx = null;

  function startSidePanelAudioKeepalive() {
    try {
      if (!sidePanelAudioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          sidePanelAudioCtx = new AudioContext();
          if (sidePanelAudioCtx.state === 'suspended') {
            sidePanelAudioCtx.resume();
          }
          const osc = sidePanelAudioCtx.createOscillator();
          const gain = sidePanelAudioCtx.createGain();
          osc.frequency.setValueAtTime(20, sidePanelAudioCtx.currentTime);
          gain.gain.setValueAtTime(0.0001, sidePanelAudioCtx.currentTime);
          osc.connect(gain);
          gain.connect(sidePanelAudioCtx.destination);
          osc.start();
          console.log('[SidePanel] Audio keepalive active (keeps Chrome foreground priority).');
        }
      } else if (sidePanelAudioCtx.state === 'suspended') {
        sidePanelAudioCtx.resume();
      }
    } catch(e) {}
  }

  function stopSidePanelAudioKeepalive() {
    try {
      if (sidePanelAudioCtx) {
        sidePanelAudioCtx.close();
        sidePanelAudioCtx = null;
      }
    } catch(e) {}
  }

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

  // Reactive Storage & Event Listeners
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.status || changes.queue || changes.currentIndex || changes.stats) {
          chrome.storage.local.get(['status', 'queue', 'currentIndex', 'stats'], (fresh) => {
            updateUIState(fresh);
            if (fresh.status === 'running') {
              startSidePanelAudioKeepalive();
            } else {
              stopSidePanelAudioKeepalive();
            }
          });
        }
        if (changes.status && changes.status.newValue === 'completed') {
          playCompletionTone();
        }
        if (changes.logs && changes.logs.newValue) {
          renderLogs(changes.logs.newValue);
        }
      }
    });
  }

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.action === 'NEW_LOG' && message.log) {
        appendLogEntry(message.log);
      } else if (message && message.action === 'QUEUE_FINISHED') {
        playCompletionTone();
      }
      return false;
    });
  }
});
