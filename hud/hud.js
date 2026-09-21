// AMJAD'S FLOW EXTENSION - Standalone Desktop HUD Window Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const hudStatusBadge = document.getElementById('hud-status-badge');
  const winBtnMin = document.getElementById('win-btn-min');
  const winBtnMax = document.getElementById('win-btn-max');
  const winBtnClose = document.getElementById('win-btn-close');

  const activeCardWrapper = document.getElementById('active-card-wrapper');
  const activeTsText = document.getElementById('active-ts-text');
  const activeSceneIndex = document.getElementById('active-scene-index');
  const livePulseIndicator = document.getElementById('live-pulse-indicator');
  const pulseLabel = document.getElementById('pulse-label');
  const activeSentenceContent = document.getElementById('active-sentence-content');
  const hudProgressPercent = document.getElementById('hud-progress-percent');
  const hudImagesCount = document.getElementById('hud-images-count');
  const hudElapsedTime = document.getElementById('hud-elapsed-time');
  const hudRenameCode = document.getElementById('hud-rename-code');

  const timelineTrack = document.getElementById('timeline-track');
  const timelineScrollContainer = document.getElementById('timeline-scroll-container');

  const hudStatusMessage = document.getElementById('hud-status-message');
  const hudTotalDownloaded = document.getElementById('hud-total-downloaded');
  const hudBatchProgress = document.getElementById('hud-batch-progress');

  // --- WINDOW CONTROLS (MINIMIZE, MAXIMIZE, CLOSE) ---
  winBtnMin.addEventListener('click', () => {
    try {
      chrome.windows.getCurrent((win) => {
        if (win && win.id) {
          chrome.windows.update(win.id, { state: 'minimized' });
        }
      });
    } catch (e) {
      console.warn('Minimize error:', e);
    }
  });

  winBtnMax.addEventListener('click', () => {
    try {
      chrome.windows.getCurrent((win) => {
        if (win && win.id) {
          const nextState = win.state === 'maximized' ? 'normal' : 'maximized';
          chrome.windows.update(win.id, { state: nextState });
        }
      });
    } catch (e) {
      console.warn('Maximize error:', e);
    }
  });

  winBtnClose.addEventListener('click', () => {
    window.close();
  });

  // --- DRAGGABLE TITLEBAR ---
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let winStartLeft = 0;
  let winStartTop = 0;
  const titlebar = document.getElementById('hud-titlebar');

  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hud-title-controls')) return;
    isDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    chrome.windows.getCurrent((win) => {
      winStartLeft = win.left || 0;
      winStartTop = win.top || 0;
    });
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.screenX - dragStartX;
    const deltaY = e.screenY - dragStartY;
    chrome.windows.getCurrent((win) => {
      if (win && win.id) {
        chrome.windows.update(win.id, {
          left: Math.round(winStartLeft + deltaX),
          top: Math.round(winStartTop + deltaY)
        });
      }
    });
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // --- SVG PERIMETER PROGRESS FILL (GLOWING RED BORDER AROUND SENTENCE) ---
  function updatePerimeterDimensions() {
    const wrapper = document.getElementById('active-card-wrapper');
    const fillRect = document.getElementById('perimeter-fill-rect');
    const bgRect = document.getElementById('perimeter-bg-rect');
    if (!wrapper || !fillRect || !bgRect) return 0;

    const rect = wrapper.getBoundingClientRect();
    const w = Math.max(0, rect.width - 4);
    const h = Math.max(0, rect.height - 4);
    const x = 2;
    const y = 2;

    bgRect.setAttribute('x', x);
    bgRect.setAttribute('y', y);
    bgRect.setAttribute('width', w);
    bgRect.setAttribute('height', h);

    fillRect.setAttribute('x', x);
    fillRect.setAttribute('y', y);
    fillRect.setAttribute('width', w);
    fillRect.setAttribute('height', h);

    const perimeter = (2 * w) + (2 * h);
    fillRect.style.strokeDasharray = `${perimeter}`;
    return perimeter;
  }

  function setRedProgressFill(percent) {
    const perimeter = updatePerimeterDimensions();
    const fillRect = document.getElementById('perimeter-fill-rect');
    if (!fillRect || perimeter <= 0) return;

    const p = Math.max(0, Math.min(100, percent));
    const offset = perimeter - (perimeter * (p / 100));
    fillRect.style.strokeDashoffset = `${offset}`;
  }

  // Handle window resizing to keep SVG border responsive
  window.addEventListener('resize', () => {
    updatePerimeterDimensions();
  });
  setTimeout(updatePerimeterDimensions, 200);

  // --- RENDER TIMELINE & ACTIVE SENTENCE ---
  let cachedQueue = [];
  let cachedCurrentIndex = 0;

  function renderTimeline(queue, currentIndex) {
    if (!queue || queue.length === 0) {
      timelineTrack.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:10px;">Paste script in Side Panel to view timeline.</div>';
      return;
    }

    timelineTrack.innerHTML = queue.map((item, idx) => {
      const isActive = idx === currentIndex;
      const isDone = item.status === 'completed';
      const tsDisplay = item.timestamp ? `( ${item.timestamp} )` : `Scene #${idx + 1}`;
      const sentenceText = item.scriptSentence || item.prompt || '(No sentence script)';

      return `
        <div class="timeline-card ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}" data-index="${idx}" id="timeline-card-${idx}">
          <div class="timeline-card-header">
            <span class="timeline-card-ts">⏱️ ${escapeHtml(tsDisplay)}</span>
            <span class="timeline-card-idx">#${idx + 1}</span>
          </div>
          <div class="timeline-card-text">${escapeHtml(sentenceText)}</div>
          <div class="timeline-card-status">
            ${isDone ? '✅ Downloaded' : isActive ? '⏳ Generating...' : 'Pending'}
          </div>
        </div>
      `;
    }).join('');

    // Smoothly scroll the active card into view horizontally
    scrollToActiveTimelineCard(currentIndex);
  }

  function scrollToActiveTimelineCard(index) {
    const activeCard = document.getElementById(`timeline-card-${index}`);
    if (activeCard && timelineScrollContainer) {
      activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function updateActiveSentenceDisplay(queue, currentIndex, status) {
    if (!queue || queue.length === 0 || !queue[currentIndex]) {
      activeSentenceContent.textContent = 'No prompt is currently running. Start a batch from the Side Panel!';
      activeTsText.textContent = '( -- )';
      activeSceneIndex.textContent = 'Scene 0 / 0';
      hudRenameCode.textContent = '( -- )_img{1..4}.png';
      setRedProgressFill(0);
      livePulseIndicator.className = 'live-pulse-indicator';
      pulseLabel.textContent = 'Idle';
      return;
    }

    const currentItem = queue[currentIndex];
    const total = queue.length;
    const ts = currentItem.timestamp || `Scene_${String(currentIndex + 1).padStart(4, '0')}`;
    const tsFormatted = `( ${ts} )`;

    activeTsText.textContent = tsFormatted;
    activeSceneIndex.textContent = `Scene #${currentIndex + 1} of ${total}`;

    const sentence = currentItem.scriptSentence || currentItem.prompt || 'Generating scene image...';
    activeSentenceContent.textContent = sentence;

    hudRenameCode.textContent = `${tsFormatted}_img{1..4}.png`;

    if (status === 'running') {
      livePulseIndicator.className = 'live-pulse-indicator active';
      pulseLabel.textContent = 'Generating...';
    } else if (status === 'paused') {
      livePulseIndicator.className = 'live-pulse-indicator';
      pulseLabel.textContent = 'Paused';
    } else if (status === 'completed') {
      livePulseIndicator.className = 'live-pulse-indicator';
      pulseLabel.textContent = 'Completed';
      setRedProgressFill(100);
    } else {
      livePulseIndicator.className = 'live-pulse-indicator';
      pulseLabel.textContent = 'Ready';
    }
  }

  function updateState(state) {
    const status = state.status || 'idle';
    const queue = state.queue || [];
    const currentIndex = state.currentIndex || 0;
    const stats = state.stats || { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 };

    cachedQueue = queue;
    cachedCurrentIndex = currentIndex;

    // Status Badge
    hudStatusBadge.textContent = status.toUpperCase();
    hudStatusBadge.className = `hud-status-badge ${status}`;

    // Stats bar
    hudTotalDownloaded.textContent = stats.downloadedImages || 0;
    const total = queue.length || stats.totalPrompts || 0;
    const currentScene = total > 0 ? Math.min(currentIndex + 1, total) : 0;
    hudBatchProgress.textContent = `${currentScene}/${total}`;

    // Active Card
    updateActiveSentenceDisplay(queue, currentIndex, status);

    // Timeline
    renderTimeline(queue, currentIndex);
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- INITIAL DATA LOAD ---
  const initial = await chrome.storage.local.get(['status', 'queue', 'currentIndex', 'stats']);
  updateState(initial);

  // --- REACTIVE STORAGE SYNC ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.status || changes.queue || changes.currentIndex || changes.stats) {
        chrome.storage.local.get(['status', 'queue', 'currentIndex', 'stats'], (fresh) => {
          updateState(fresh);
        });
      }
    }
  });

  // --- LIVE GENERATION TELEMETRY & RED PROGRESS LINE UPDATE ---
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.action) return;

    if (message.action === 'GENERATION_TICK') {
      const { promptIndex, elapsedSec, expectedImages, imagesCount, isGenerating } = message.data || {};

      hudElapsedTime.textContent = `${elapsedSec || 0}s`;
      hudImagesCount.textContent = `${imagesCount || 0} / ${expectedImages || 4} visible`;

      const targetImages = expectedImages || 4;
      let calculatedPercent = 0;

      if (targetImages > 0 && imagesCount !== undefined) {
        calculatedPercent = Math.round((imagesCount / targetImages) * 100);
      }

      // Smooth interpolation while generation is actively underway
      if (isGenerating && calculatedPercent < 85) {
        const timeEstimate = Math.min(85, Math.round(((elapsedSec || 1) / 25) * 85));
        calculatedPercent = Math.max(calculatedPercent, timeEstimate);
      }

      if (!isGenerating && imagesCount >= targetImages) {
        calculatedPercent = 100;
      }

      hudProgressPercent.textContent = `${calculatedPercent}%`;
      setRedProgressFill(calculatedPercent);

      hudStatusMessage.textContent = isGenerating
        ? `Generating scene #${(promptIndex || 0) + 1}... (${imagesCount || 0}/${targetImages} images loaded)`
        : `Monitoring generation for scene #${(promptIndex || 0) + 1}...`;
    } else if (message.action === 'PROMPT_COMPLETED') {
      setRedProgressFill(100);
      hudProgressPercent.textContent = '100%';
      hudStatusMessage.textContent = `Scene #${(message.promptIndex || 0) + 1} completed and saved to disk!`;
    }
  });
});
