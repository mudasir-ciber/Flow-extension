# ⚡ AMJAD'S FLOW EXTENSION
> **Created By ⚡ MUDASIR AHMED**  
> *Production-Grade Bulk Automation Engine for Google Flow (`flow.google.com`)*

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Author](https://img.shields.io/badge/Author-Mudasir_Ahmed-blueviolet.svg)](https://github.com/mudasir-ciber)
[![Platform](https://img.shields.io/badge/Platform-Windows_%7C_Mac_%7C_Linux-brightgreen.svg)]()

**AMJAD'S FLOW EXTENSION** is an advanced automation suite built specifically for **Google Flow** studio (`flow.google.com` & `labs.google/flow`). It automates large-scale batch prompt submission, character consistency anchor injection, intelligent DOM & ProseMirror synchronization, and automatic high-resolution image downloading with precise timestamps.

---

## 🌟 Key Features

### 1. 🗗 Standalone Floating Window & Window Modes
- **Draggable & Minimizable:** Move the extension window anywhere on your screen or minimize it to your taskbar with the custom taskbar icon.
- **📌 Always-On-Top PiP Mode:** Click the pin icon (📌) in the header to activate Chrome's native **Document Picture-in-Picture** window. It floats on top of all applications, browser tabs, and desktop windows so you never lose sight of your batch progress.
- **🗖 Side-by-Side Split Screen Dock:** Click the dock icon (🗖) to automatically tile Chrome on the left (72%) and the extension on the right (28%) with **zero overlap**.
- **🔄 Smart Tab-Switch Auto-Elevation:** In standard floating window mode, switching between Chrome tabs will never bury the extension window behind full-screen browser tabs.

### 2. ⚡ 100% Automated Generation (No Manual Click / Enter Needed)
- Powered by a hybrid injection engine:
  - **Chrome DevTools Protocol (CDP):** Dispatches native OS hardware `Enter` key events with `isTrusted: true`.
  - **Main-World ProseMirror Dispatcher:** Directly creates ProseMirror transactions inside Google Flow's Angular NgZone.
  - **DOM & Angular Component Unlocking:** Automatically unlocks and clicks the Google Flow `flow-generate-icon-button`.

### 3. ⏱️ Timestamps & Scene Script Synchronization
- Paste full video scripts containing timestamp headers:
  - Format: `(0:00) to (0:08)`, `00:09 - 00:15`, or `Scene 1 : (0:00) to (0:08)`.
- Automatically strips prompt clutter (e.g., `Sentence:`, `[SCENE]`, `IMAGE PROMPT:`) while preserving the exact scene prompt.
- **Smart Image Renaming:** Downloads images named after their timestamp:
  - `Scene 1_ (0-00) to (0-08)_img1.png`
  - `Scene 1_ (0-00) to (0-08)_img2.png`

### 4. 🎯 Target Image Count Selector (1–4 Images)
- Choose whether you want 1, 2, 3, or all 4 generated images downloaded per prompt directly from the HOME tab.

### 5. 🎭 Character Consistency Lock
- Set a **Character Anchor** description (e.g., specific outfit, facial structure, art style).
- Choose between **Prefix** or **Suffix** injection for each prompt in the queue.
- Upload a **Reference Image Sheet** that automatically attaches into Flow's media slot.

### 6. 🎨 Multiple Visual Themes
- **Dark Slate** (Default)
- **Midnight Blue**
- **Cyber Purple**
- **Light Studio**

### 7. 🔊 Audio Keepalive & Completion Chimes
- Background audio keepalive prevents Chrome from throttling or putting the extension to sleep when minimized or running in the background.
- Plays a pleasant chord tone upon completion of the entire batch.

---

## 🚀 Installation Guide

### Method A: Clone from GitHub
```bash
git clone https://github.com/mudasir-ciber/Flow-extension.git
```

### Method B: Download ZIP
1. Download the repository as a ZIP file from GitHub and extract it.

### Load in Google Chrome:
1. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the extracted `Flow-extension` (or `AMJADS-FLOW-EXTENSION`) folder.
5. Click the extension puzzle icon in the Chrome toolbar and pin **AMJAD'S FLOW EXTENSION**!

---

## 📖 How to Use

1. **Open Google Flow:** Navigate to [https://flow.google.com](https://flow.google.com).
2. **Launch Extension:** Click the toolbar icon to launch the floating window.
3. **PROMPTS Tab:** Paste your batch prompts (with or without timestamps).
4. **CHARACTER Tab:** Add your character anchor prompt and optional reference image.
5. **HOME Tab:**
   - Select your target image count per prompt (1, 2, 3, or 4).
   - Click **Run Batch**!
6. Sit back while the extension types prompts, triggers generation, and downloads images to your `Downloads/<subfolder>` directory.

---

## 👤 Author
- **Created By:** **⚡ MUDASIR AHMED**
- **GitHub:** [@mudasir-ciber](https://github.com/mudasir-ciber)
