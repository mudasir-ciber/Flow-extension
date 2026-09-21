# AMJAD'S FLOW EXTENSION (Chrome Extension Manifest V3)

Google Flow (`flow.google.com`) ke liye powerful automated bulk prompt submission, smart scene detection, timestamps script synchronization, character consistency anchor, aur automatic image downloader extension.

---

## 🌟 Key Features

1. **⏱️ Timestamps Script Synchronization & Renaming (NEW):**
   - Poori video script timestamps ke sath paste karein (e.g. `00 to 05 sec: [sentence]` ya `00:00 - 00:05`).
   - Extension automatically timestamps aur image generation prompts ko 1-to-1 sync karti hai.
   - Download hone wali images ke naam mein sentence ka timestamp auto-attach ho jata hai:
     - `Scene_0001_[00-05sec]_img1.png`
     - `Scene_0001_[00-05sec]_img2.png` waghera.

2. **🧠 Smart Scene Detection (Headings Filter):**
   - Script ki headings (jaise `scene 1 :`, `IMAGE 2:`, `PROMPT 3`, `Shot #01 -`) ko automatically filter karta hai aur sirf actual image prompts run hoti hain.

3. **📦 Bulk Prompt Automation (100 to 1,000+ Prompts):**
   - ChatGPT ya Claude se generate ki hui saari prompts ek hi baar mein paste karein.
   - Live clean preview dikhata hai aur sequential 1-by-1 execution guarantee karta hai.

4. **🔄 Intelligent Failure & Recovery Watchdog:**
   - Generation fail hone par turant repeat nahi karta; pehle proper jaiza leta hai ke saari 4 images fail hui hain ya nahi.
   - Agar 4 mein se 1 ya 2 images bhi successfully generate ho jati hain to unko completely visible hone par download karta hai aur agle prompt par smoothly advance karta hai.

5. **🔊 Completion Tone & Notifications:**
   - Saare prompts aur images download complete hone par desktop notification aur pleasant completion chime tone play hoti hai.

6. **⚡ Non-Stop Background Execution:**
   - Chrome browser ko minimize karne ya doosre apps chalane par bhi background audio keepalive aur native IPC loop ke zariye process freeze ya stop nahi hota.

7. **🎭 Character Consistency Lock:**
   - Base character anchor description aur character sheet reference image upload support.

8. **✨ Reset All (Fresh Start):**
   - Ek click mein saari prompts, character settings, logs aur queue ko 0 karke bilkul fresh state par le aata hai.

---

## 🚀 Installation Guide

1. Chrome Browser open karein aur address bar mein type karein:
   ```
   chrome://extensions/
   ```
2. Top-right corner par **Developer mode** toggle ko **ON** karein.
3. Top-left par **Load unpacked** button par click karein.
4. Apne computer se yeh folder select karein:
   ```
   d:\EXTENSION
   ```
5. Extension successfully install ho jayegi! Chrome toolbar par pin kar lein.

---

## 📖 How To Use

1. Google Flow open karein: `https://flow.google.com`.
2. Extension icon par click karke **Side Panel** open karein.
3. **TIMESTAMPS Tab:** Script timestamps ke sath paste karein (optional).
4. **PROMPTS Tab:** Apni image prompts paste karein.
5. **CHARACTER Tab:** Character description aur reference sheet upload karein.
6. **HOME Tab:** **Run Batch** par click karein aur extension ko apna kaam karne dein!
