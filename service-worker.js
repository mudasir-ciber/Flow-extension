// AMJAD'S FLOW EXTENSION - Background Service Worker (Manifest V3)
// Responsible for queue management, automatic downloading, tab communication, and keepalive.

// --- EXTENSION LIFECYCLE & SIDE PANEL CONFIGURATION ---

// Set panel behavior inside onInstalled and onStartup (Defensive & Error-Free)
if (chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Flow SW] Service Worker Installed');

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {
      // Benign if already configured or unsupported
    }
  }

  // Initialize storage defaults safely
  try {
    const current = await chrome.storage.local.get([
      'queue',
      'currentIndex',
      'status',
      'characterAnchor',
      'anchorPosition',
      'subfolder',
      'delaySeconds',
      'expectedImages',
      'maxTimeoutSeconds',
      'stats',
      'logs'
    ]);

    await chrome.storage.local.set({
      queue: current.queue || [],
      currentIndex: current.currentIndex || 0,
      status: current.status || 'idle',
      characterAnchor: current.characterAnchor || '',
      anchorPosition: current.anchorPosition || 'prefix',
      subfolder: current.subfolder || 'Flow_Batch',
      delaySeconds: current.delaySeconds || 5,
      expectedImages: current.expectedImages || 4,
      maxTimeoutSeconds: current.maxTimeoutSeconds || 120,
      stats: current.stats || { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 },
      logs: current.logs || [{ timestamp: new Date().toLocaleTimeString(), text: 'Flow Batch Automation Engine Ready.' }]
    });
  } catch (err) {
    console.warn('[Flow SW] Storage initialization notice:', err);
  }
  });
}

if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {}
  }
  });
}

// Fallback: If user clicks the extension action icon in toolbar, ensure side panel opens
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      try {
        if (tab && tab.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
        } else if (tab && tab.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
        }
      } catch (e) {}
    }
  });
}


// --- LONG-LIVED PORT KEEPALIVE FOR MINIMIZED / BACKGROUND EXECUTION ---

const connectedKeepalivePorts = new Set();
let keepaliveIntervalId = null;

function ensureKeepaliveHeartbeat() {
  if (keepaliveIntervalId) return;
  keepaliveIntervalId = setInterval(() => {
    if (connectedKeepalivePorts.size === 0) {
      clearInterval(keepaliveIntervalId);
      keepaliveIntervalId = null;
      return;
    }
    for (const port of Array.from(connectedKeepalivePorts)) {
      try {
        port.postMessage({ action: 'PING_TICK' });
      } catch (e) {
        connectedKeepalivePorts.delete(port);
      }
    }
  }, 1000);
}

if (chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'flow_keepalive_port') {
      connectedKeepalivePorts.add(port);
      ensureKeepaliveHeartbeat();

      port.onDisconnect.addListener(() => {
        connectedKeepalivePorts.delete(port);
        if (connectedKeepalivePorts.size === 0 && keepaliveIntervalId) {
          clearInterval(keepaliveIntervalId);
          keepaliveIntervalId = null;
        }
      });
    }
  });
}

// --- SAFE MESSAGING UTILITIES (PREVENTS UNCHECKED RUNTIME.LASTERROR) ---

function safeSendTabMessage(tabId, message, callback) {
  if (!tabId) return;
  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      // Reading lastError clears it from Chrome's error reporter
      const lastError = chrome.runtime.lastError;
      if (typeof callback === 'function') {
        callback(response, lastError);
      }
    });
  } catch (e) {
    // Suppress synchronous send errors
  }
}

function safeSendRuntimeMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      // Reading lastError clears it from Chrome's error reporter
      const lastError = chrome.runtime.lastError;
      if (typeof callback === 'function') {
        callback(response, lastError);
      }
    });
  } catch (e) {
    // Suppress synchronous send errors
  }
}

// --- LOGGING & STORAGE ---

async function addLog(message) {
  try {
    const { logs = [] } = await chrome.storage.local.get('logs');
    const newLog = {
      timestamp: new Date().toLocaleTimeString(),
      text: message
    };
    const updatedLogs = [...logs.slice(-99), newLog];
    await chrome.storage.local.set({ logs: updatedLogs });

    // Notify side panel if open (safe check prevents "Receiving end does not exist")
    safeSendRuntimeMessage({ action: 'NEW_LOG', log: newLog });
  } catch (e) {
    console.warn('[Flow SW] addLog error:', e);
  }
}

// --- HELPER: FIND GOOGLE FLOW TAB ---

async function findFlowTab() {
  try {
    // Prioritize active tab in the current focused window
    const [currentActive] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (currentActive && currentActive.url && (
      currentActive.url.includes('flow.google') ||
      currentActive.url.includes('labs.google/flow') ||
      currentActive.url.includes('labs.google/fx/tools/flow')
    )) {
      return currentActive;
    }

    const allTabs = await chrome.tabs.query({});
    const flowTabs = allTabs.filter(t => t.url && (
      t.url.includes('flow.google') ||
      t.url.includes('labs.google/flow') ||
      t.url.includes('labs.google/fx/tools/flow')
    ));
    if (!flowTabs || flowTabs.length === 0) return null;
    const activeFlow = flowTabs.find(t => t.active);
    return activeFlow || flowTabs[0];
  } catch (e) {
    return null;
  }
}

async function ensureContentScriptInjected(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'PING' }, async (res) => {
      if (chrome.runtime.lastError || !res?.alive) {
        console.log('[Flow SW] Ensuring content script is injected in tab', tabId);
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['inject-main.js'],
            world: 'MAIN'
          });
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          });
          setTimeout(resolve, 300);
        } catch (err) {
          console.warn('[Flow SW] Script injection notice:', err);
          resolve();
        }
      } else {
        resolve();
      }
    });
  });
}

// --- SANITIZE & CLEAN HELPERS ---

function cleanPromptContent(text) {
  if (!text) return '';
  return text
    .replace(/^(?:#{1,6}\s*|\*{1,2}|_{1,2}|\[|\()?\s*(?:scene|image|img|prompt|shot|panel|frame|photo|picture|pic|cut|take|part|slide|act|chapter|generation|gen|render)(?:\s+#?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|[a-z]))?\s*[:\-\—\–]\s*/i, '')
    .replace(/^(?:\[|\()?#?\d+[\.\)\-:\—\–\]]\s*/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function sanitizePath(str) {
  return (str || 'Flow_Batch').replace(/[<>:"/\\|?*]+/g, '_').trim();
}

// --- IMAGE DOWNLOADER VIA CHROME DOWNLOADS API (WAITS FOR DISK COMPLETION) ---

async function downloadImages(imageUrls, promptIndex, customFolder) {
  const { subfolder = 'Flow_Batch' } = await chrome.storage.local.get('subfolder');
  const targetFolder = sanitizePath(customFolder || subfolder);
  const promptNumberStr = String(promptIndex + 1).padStart(4, '0');

  await addLog(`⬇️ Scene #${promptIndex + 1}: Initiating download for ${imageUrls.length} image(s)...`);

  const downloadPromises = imageUrls.map((url, idx) => {
    return new Promise((resolve) => {
      let ext = 'png';
      if (url.includes('.webp') || url.includes('format=webp')) ext = 'webp';
      else if (url.includes('.jpg') || url.includes('.jpeg')) ext = 'jpg';

      const filename = `${targetFolder}/Scene_${promptNumberStr}_img${idx + 1}.${ext}`;

      chrome.downloads.download(
        {
          url: url,
          filename: filename,
          conflictAction: 'uniquify',
          saveAs: false
        },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err || !downloadId) {
            console.warn('[Flow SW] Download initiation error for img', idx + 1, err?.message);
            resolve({ success: false, error: err?.message });
            return;
          }

          // Strictly wait until file has finished writing to disk (state === 'complete')
          const startTime = Date.now();
          const pollInterval = setInterval(() => {
            chrome.downloads.search({ id: downloadId }, (items) => {
              if (chrome.runtime.lastError || !items || items.length === 0) {
                clearInterval(pollInterval);
                resolve({ success: true, downloadId });
                return;
              }

              const item = items[0];
              if (item.state === 'complete') {
                clearInterval(pollInterval);
                resolve({ success: true, downloadId, filename: item.filename });
              } else if (item.state === 'interrupted') {
                clearInterval(pollInterval);
                console.warn('[Flow SW] Download interrupted for img', idx + 1, item.error);
                resolve({ success: false, downloadId, error: item.error });
              } else if (Date.now() - startTime > 45000) {
                // Safety timeout after 45s
                clearInterval(pollInterval);
                resolve({ success: true, downloadId, timeout: true });
              }
            });
          }, 350);
        }
      );
    });
  });

  const results = await Promise.all(downloadPromises);
  const successCount = results.filter(r => r.success).length;

  try {
    const { stats = { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 } } = await chrome.storage.local.get('stats');
    stats.downloadedImages = (stats.downloadedImages || 0) + successCount;
    await chrome.storage.local.set({ stats });
  } catch (e) {}

  await addLog(`💾 Scene #${promptIndex + 1}: ${successCount} image(s) verified and saved on disk!`);
  return successCount;
}

// --- ADVANCE QUEUE (STRICT SEQUENTIAL EXECUTION) ---

let isAdvancing = false;

async function advanceQueue() {
  if (isAdvancing) return;
  isAdvancing = true;

  try {
    const { queue = [], currentIndex = 0, delaySeconds = 5, status = 'idle' } = await chrome.storage.local.get([
      'queue',
      'currentIndex',
      'delaySeconds',
      'status'
    ]);

    if (status !== 'running') return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      // All prompts in queue completed!
      await chrome.storage.local.set({ status: 'completed' });
      try { await chrome.alarms.clear('flow_keepalive'); } catch (e) {}
      await addLog(`🎉 All ${queue.length} prompts completed successfully!`);

      // 1. Desktop Notification
      if (chrome.notifications && chrome.notifications.create) {
        try {
          chrome.notifications.create('flow_done_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: "AMJAD'S FLOW EXTENSION",
            message: `🎉 Saara kaam complete ho gaya! All ${queue.length} prompts finished and images saved.`,
            priority: 2
          });
        } catch (e) {}
      }

      // 2. Notify Side Panel to play completion tone
      safeSendRuntimeMessage({ action: 'QUEUE_FINISHED' });

      // 3. Notify Flow Tab to play completion tone
      const targetTab = await findFlowTab();
      if (targetTab && targetTab.id) {
        safeSendTabMessage(targetTab.id, { action: 'QUEUE_FINISHED' });
      }
      return;
    }

  // Update currentIndex
  await chrome.storage.local.set({ currentIndex: nextIndex });
  await addLog(`Cooldown: waiting ${delaySeconds}s before Scene #${nextIndex + 1}...`);

  // Delay cooldown before executing next prompt
  setTimeout(async () => {
    const fresh = await chrome.storage.local.get(['status', 'queue', 'characterAnchor', 'anchorPosition']);
    if (fresh.status !== 'running') return;

    const targetTab = await findFlowTab();
    if (!targetTab) {
      await addLog('⚠️ Google Flow tab not found! Please keep a Flow tab open.');
      await chrome.storage.local.set({ status: 'paused' });
      return;
    }

    await ensureContentScriptInjected(targetTab.id);

    const item = fresh.queue[nextIndex];
    if (!item) return;

    // Formulate final prompt with character anchor (Sanitized of any heading labels)
    let finalPrompt = cleanPromptContent((item.prompt || '').trim());
    const anchor = (fresh.characterAnchor || '').trim();
    if (anchor && fresh.anchorPosition === 'prefix') {
      finalPrompt = `${anchor}, ${finalPrompt}`;
    } else if (anchor && fresh.anchorPosition === 'suffix') {
      finalPrompt = `${finalPrompt}, ${anchor}`;
    }

    await addLog(`Starting Scene #${nextIndex + 1} of ${fresh.queue.length}`);
    safeSendTabMessage(targetTab.id, {
      action: 'RUN_PROMPT',
      data: {
        index: nextIndex,
        prompt: finalPrompt,
        rawPrompt: item.prompt,
        total: fresh.queue.length
      }
    }, (res, err) => {
      if (err) {
        addLog(`Notice: Re-establishing tab connection for Scene #${nextIndex + 1}`);
      }
    });
  }, Math.max(1, delaySeconds) * 1000);
} finally {
  isAdvancing = false;
}
}

// --- KEEPALIVE ALARM LISTENER ---

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'flow_keepalive') {
    const { status, currentIndex = 0, queue = [] } = await chrome.storage.local.get(['status', 'currentIndex', 'queue']);
    if (status === 'running') {
      console.log(`[Flow SW] Keepalive ping - Processing prompt ${currentIndex + 1}/${queue?.length || 0}`);
      const tab = await findFlowTab();
      if (tab) {
        safeSendTabMessage(tab.id, { action: 'PING' });
      }
    } else {
      try { await chrome.alarms.clear('flow_keepalive'); } catch (e) {}
    }
  }
  });
}

// --- RUNTIME MESSAGE DISPATCHER ---

const SUPPORTED_ACTIONS = [
  'FIND_FLOW_TAB',
  'START_BATCH',
  'PAUSE_BATCH',
  'RESUME_BATCH',
  'STOP_BATCH',
  'DOWNLOAD_IMAGES',
  'PROMPT_COMPLETED',
  'PROMPT_ERROR'
];

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action || !SUPPORTED_ACTIONS.includes(message.action)) {
    return false; // Ignore messages intended for other components
  }

  (async () => {
    try {
      switch (message.action) {
        case 'FIND_FLOW_TAB': {
          const tab = await findFlowTab();
          sendResponse({ tab });
          break;
        }

        case 'START_BATCH': {
          const { queue, characterAnchor, anchorPosition, subfolder, delaySeconds, expectedImages, maxTimeoutSeconds } = message;

          await chrome.storage.local.set({
            queue: queue || [],
            currentIndex: 0,
            status: 'running',
            characterAnchor: characterAnchor || '',
            anchorPosition: anchorPosition || 'prefix',
            subfolder: subfolder || 'Flow_Batch',
            delaySeconds: delaySeconds || 5,
            expectedImages: expectedImages || 4,
            maxTimeoutSeconds: maxTimeoutSeconds || 120,
            stats: {
              totalPrompts: queue?.length || 0,
              completedPrompts: 0,
              downloadedImages: 0
            }
          });

          try {
            await chrome.alarms.create('flow_keepalive', { periodInMinutes: 1 });
          } catch (e) {}

          await addLog(`🚀 Batch started with ${queue?.length || 0} prompts.`);

          const tab = await findFlowTab();
          if (!tab) {
            await addLog('❌ Flow tab not found! Open https://flow.google.com first.');
            await chrome.storage.local.set({ status: 'paused' });
            sendResponse({ success: false, error: 'No Flow tab found' });
            return;
          }

          // Guarantee scripts are active in the target tab before sending RUN_PROMPT
          await ensureContentScriptInjected(tab.id);

          if (!queue || queue.length === 0) {
            sendResponse({ success: false, error: 'Queue is empty' });
            return;
          }

          // Build first prompt (Sanitized of any heading labels)
          let firstPrompt = cleanPromptContent((queue[0].prompt || '').trim());
          const anchor = (characterAnchor || '').trim();
          if (anchor && anchorPosition === 'prefix') {
            firstPrompt = `${anchor}, ${firstPrompt}`;
          } else if (anchor && anchorPosition === 'suffix') {
            firstPrompt = `${firstPrompt}, ${anchor}`;
          }

          await addLog(`Running Scene #1 of ${queue.length}`);
          safeSendTabMessage(tab.id, {
            action: 'RUN_PROMPT',
            data: {
              index: 0,
              prompt: firstPrompt,
              rawPrompt: queue[0].prompt,
              total: queue.length
            }
          });

          sendResponse({ success: true });
          break;
        }

        case 'PAUSE_BATCH': {
          await chrome.storage.local.set({ status: 'paused' });
          try { await chrome.alarms.clear('flow_keepalive'); } catch (e) {}
          await addLog('⏸ Batch paused by user.');
          const tab = await findFlowTab();
          if (tab) {
            safeSendTabMessage(tab.id, { action: 'PAUSE' });
          }
          sendResponse({ success: true });
          break;
        }

        case 'RESUME_BATCH': {
          const state = await chrome.storage.local.get(['queue', 'currentIndex', 'characterAnchor', 'anchorPosition']);
          if (!state.queue || state.currentIndex >= state.queue.length) {
            sendResponse({ success: false, error: 'Queue is empty or complete' });
            return;
          }

          await chrome.storage.local.set({ status: 'running' });
          try {
            await chrome.alarms.create('flow_keepalive', { periodInMinutes: 1 });
          } catch (e) {}
          await addLog(`▶️ Resuming batch from Scene #${state.currentIndex + 1}...`);

          const tab = await findFlowTab();
          if (!tab) {
            await addLog('❌ Flow tab not open!');
            sendResponse({ success: false, error: 'Flow tab not open' });
            return;
          }

          const currentItem = state.queue[state.currentIndex];
          let currentPrompt = (currentItem.prompt || '').trim();
          const anchor = (state.characterAnchor || '').trim();
          if (anchor && state.anchorPosition === 'prefix') {
            currentPrompt = `${anchor}, ${currentPrompt}`;
          } else if (anchor && state.anchorPosition === 'suffix') {
            currentPrompt = `${currentPrompt}, ${anchor}`;
          }

          safeSendTabMessage(tab.id, {
            action: 'RUN_PROMPT',
            data: {
              index: state.currentIndex,
              prompt: currentPrompt,
              rawPrompt: currentItem.prompt,
              total: state.queue.length
            }
          });

          sendResponse({ success: true });
          break;
        }

        case 'STOP_BATCH': {
          await chrome.storage.local.set({ status: 'idle', currentIndex: 0 });
          try { await chrome.alarms.clear('flow_keepalive'); } catch (e) {}
          await addLog('⏹ Batch stopped and reset.');
          const tab = await findFlowTab();
          if (tab) {
            safeSendTabMessage(tab.id, { action: 'STOP' });
          }
          sendResponse({ success: true });
          break;
        }

        case 'DOWNLOAD_IMAGES': {
          const { imageUrls, promptIndex, subfolder } = message;
          const count = await downloadImages(imageUrls || [], promptIndex || 0, subfolder);
          sendResponse({ success: true, count });
          break;
        }

        case 'PROMPT_COMPLETED': {
          const { promptIndex, imagesCount } = message;
          const { queue = [], stats = { totalPrompts: 0, completedPrompts: 0, downloadedImages: 0 } } = await chrome.storage.local.get(['queue', 'stats']);

          if (queue[promptIndex]) {
            queue[promptIndex].status = 'completed';
            queue[promptIndex].downloadedCount = imagesCount;
          }
          stats.completedPrompts = (stats.completedPrompts || 0) + 1;

          await chrome.storage.local.set({ queue, stats });
          await addLog(`✅ Completed Scene #${promptIndex + 1} (${imagesCount} images).`);

          advanceQueue();
          sendResponse({ success: true });
          break;
        }

        case 'PROMPT_ERROR': {
          const { promptIndex, error } = message;
          await addLog(`❌ Error on Scene #${promptIndex + 1}: ${error}`);
          const { queue = [] } = await chrome.storage.local.get('queue');
          if (queue[promptIndex]) {
            queue[promptIndex].status = 'error';
            queue[promptIndex].error = error;
            await chrome.storage.local.set({ queue });
          }

          advanceQueue();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false });
      }
    } catch (err) {
      console.warn('[Flow SW] Message error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep message channel open for async sendResponse
  });
}
