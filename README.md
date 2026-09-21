# Flow AutoPrompt & Batch Downloader (Chrome Extension)

Google Flow (`flow.google`) ke liye automated bulk prompt submission aur image downloading Chrome Extension (Manifest V3).

---

## 🌟 Key Features

1. **Bulk Prompt Support (100 to 1,000+ Prompts):**
   - ChatGPT se nikali hui saari prompts ek hi baar mein paste karein.
   - Line-by-line (`A cinematic shot...`) aur Numbered format (`1. A cinematic shot...`, `2) ...`) dono ko automatically clean aur parse karta hai.

2. **Background & Tab Switching Support (Bina Ruke Chalta Hai):**
   - **Chrome Side Panel API:** Yeh popup ki tarah click karne par gayab nahi hota, browser ke side mein persistent rehta hai.
   - **Service Worker Downloads:** File downloads background `service-worker` ke zariye hote hain. Agar aap Chrome minimize kar dein ya doosre tab mein kaam karein, tab bhi downloads nahi rukte.

3. **Character Consistency (Consistency Lock):**
   - **Base Character Anchor:** Extension mein character ka description likhein (e.g., outfit, facial details, age, lighting). Yeh text har scene prompt ke sath automatically attach ho jata hai (Prefix ya Suffix).
   - **Reference Image Card:** Extension ke andar character ki primary reference image upload karein. Is se aapka visual anchor hamesha samne rahega aur single-click mein clipboard par copy karke Flow mein use ho sakega.

4. **Organized Downloads:**
   - Default folder: `Downloads/Flow_Batch/`
   - Naming convention: `Scene_0001_img1.png`, `Scene_0001_img2.png` wagaira. Koi bhi scene ya image mix nahi hoti.

5. **In-Page Floating HUD (Head-Up Display):**
   - Flow page ke top-right par ek sleek widget show hota hai jo real-time progress (Scene 14/100, 56 images downloaded) aur status batata hai.
   - **Emergency Calibrate Tool:** Agar Google Flow ka design ya buttons kabhi update hon, toh on-screen click karke prompt box aur generate button ko calibrate kiya ja sakta hai.

---

## 🚀 Installation Guide (Kaise Install Karein)

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

## 📖 How To Use (Kaise Use Karein)

1. Apne browser mein Google Flow open karein:
   ```
   https://flow.google
   ```
2. Extension icon par click karein ya Side Panel open karein.
3. **Tab 1 (Prompts):** Apni 100 se 1000 prompts ek sath paste karein.
4. **Tab 2 (Character):** Character ka details description daalein aur reference image upload karein.
5. **Tab 4 (Settings):** Download folder ka naam (e.g. `Flow_Batch`) aur delay set karein.
6. **"Start Batch Run"** button par click karein!
7. Ab aap chahe koi doosra tab open karein ya Chrome ko minimize kar dein — extension background mein ek-ek prompt send karegi, images generate hone par unko download karegi, aur complete hone tak chalti rahegi!
