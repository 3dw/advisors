---
name: p5js-local-render
summary: 在受控的本機 renderer 中以 p5.js 1.11.3 製作可重現動畫並依音訊 RMS 逐格輸出 MP4。
---

# 本機 p5.js 動畫技能

本技能供 `factories/mv/` 下的影片製程使用；下文的 `mv/` 均指此目錄。共用製程、情緒／動作／旁白函式、測試、demo、套件／工具／模型鎖檔及授權文件納入 Git；其他影片專案、個別素材與製作腳本、`assets/speech/` 合成輸出、依賴、快取與 `.runtime/` 不納入 Git。不要在其中保存 repo secrets、登入 cookies、憑證或私人檔案。它保留 p5.js 繪圖、幾何、色彩、動畫與視覺效果的知識；不是上游 Hermes Agent 的完整技能安裝包，也不執行上游匯出流程。先規劃作品的視覺概念、構圖、調色與動態，再依本文件的受控 renderer 合約實作。

## 固定來源與本機範圍

- 上游：[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent)，固定 commit `e4d86423856350825a3a0dc4f52aed89759e11bd`。
- p5.js 本機版本：`1.11.3`；頁面只載入 renderer 提供的 `/vendor/p5.min.js`，不可改用 CDN、遠端 script 或其他版本。
- 執行環境預期版本：Node `24.21.0`、`puppeteer-core` `25.13.0`、FFmpeg/ffprobe `8.0.1`、Chrome `155.0.8059.39`。`tools.lock.json` 鎖定並比對主執行檔雜湊；這不代表 OS 或所有動態函式庫均已封存。2026-10-13 已在 `factories/mv/` 實跑 demo，以 `assets/demo-tone.wav` 產生 2 秒、320×180、5 fps 的 H.264/AAC MP4；此驗證不涵蓋其他專案或所有工具。
- 採用上游 MIT License；完整授權與 attribution 保存在同目錄的 `LICENSE`。下載檔案、來源 URL、SHA-256 與適配記錄見 [`mv/provenance.json`](../../provenance.json)。
- `references/` 內五份參考資料是固定 commit 的完整原文快照；它們只提供 p5.js 知識，不構成本機執行授權。凡與本文件的隔離合約衝突之上游示例（例如 CDN、p5.js 2.x、音訊輸入或其他匯出流程）一律不適用。
- 本地只保留上述參考文件、`LICENSE` 與本 `SKILL.md`。沒有下載或執行上游 scripts、viewer、templates、installer；沒有安裝到全域 agent skills。未審閱、未測試也不宣稱任何未保留的上游可執行檔安全。

## 專案與執行

1. 在 `mv/projects/<專案目錄>/` 建立 `index.html`，以 `/vendor/p5.min.js` 載入本機 p5.js 建構器，可採 instance 模式；需要共用函式時，以 module script 匯入 `/lib/emotion.js`、`/lib/motion.js` 或 `/lib/character.js`。
2. 畫布完成初始化後設定 `window.mvReady = true`，並提供 `async window.renderFrame({ frame, time, fps, width, height, level })`。這是 renderer 的介面；每次呼叫都必須依參數繪出指定畫格，不依賴瀏覽器即時播放時鐘或前一畫格的隱藏狀態。
3. 音訊檔放在 `mv/assets/`，輸出 MP4 放在 `mv/output/`。從 `mv/` 根目錄使用 npm 包裝入口執行；例如：

   ```text
   npm run render -- projects/demo assets/music.wav output/movie.mp4
   ```

   將示例音訊路徑替換為 `assets/` 內實際素材；需要時可在輸出路徑後加 `--fps N --width N --height N`。所有路徑相對 `mv/` 工作目錄；只經 npm script 包裝的 `run.mjs` 執行，不直接呼叫內部 renderer。預設為 30 fps、1280×720；影片長度依輸入音檔。只指定新的合法 `output/` MP4 路徑，不覆寫既有檔案。
4. Renderer 以 FFmpeg 從指定音訊預先計算每格 RMS，將該格值交給 `level`；完成逐格 PNG 擷取後再將影格與原音訊合成 H.264/AAC MP4。動畫不得自行開啟音訊檔或另起音訊解碼管線。影格與編碼半成品位於本次 session 的暫存目錄；完成後透過 hard link 原子發布至 `output/`，所以 `output/` 與 `.runtime/` 必須位於同一檔案系統。取消時 wrapper 終止控制器及其 FFmpeg process group、清除 session，不發布未完成影片。

### 逐格繪圖規則

- 以傳入的 `time` 作為畫面時間、`frame` 作為畫格索引；所有動態都由這些值、`fps`、畫布尺寸與 `level` 計算。不要使用 `millis()`、`deltaTime`、持續遞增的 `frameCount` 模擬、計時器、非同步動畫迴圈，或仰賴 `draw()` 自行推進的狀態。
- `renderFrame` 每次都要完整重繪畫布。將粒子、曲線、轉場等狀態以時間函數或固定參數推導；如需隨機性，使用固定 seed，並保證同一組輸入能重現同一畫格。需要沿時間演化的系統，請從 frame/time 可重建狀態，而非依賴呼叫順序。
- 以 `pixelDensity(1)` 和 renderer 傳入的 `width`、`height` 保持輸出尺寸一致。使用 `level` 作為提供給畫格的音訊反應量；介面未規定其數值校正範圍時，不要假定固定比例，先做合理限制再映射至視覺參數。
- 每格設計完整構圖：有意識的色盤、視覺層次、主次節奏與留白。可用 `push()`/`pop()` 隔離轉換，用 `createGraphics()` 分層，用 noise、向量、粒子、曲線、漸層、blend mode 與像素運算創造質感。每格重建或重置任何會跨畫格殘留的畫布狀態。
- 避免無效高成本迴圈、每畫格不必要的資源配置和過量像素操作。應先以符合目標輸出的解析度與 fps 控制複雜度；有大量粒子或逐像素效果時，優先降低模擬網格解析度或預先計算固定資料。

### 共用角色與旁白函式

- 使用 `createEmotionTrack(keys, { transition, seed }).sample(time)` 取得表情、視線、傾斜與呼吸參數；情緒支援 neutral、curious、joy、sad、angry、surprised、worried、calm，cue 可調整 `intensity`。不要把取樣結果累加回前一畫格。
- 使用 `createMotionTrack(actions, { bpm }).sample(time)` 取得位移、縮放與肢體角度；動作支援 walk、jump、wave、nod。位移以角色尺寸為單位，角度以弧度表示。walk／jump 不可重疊，手勢可疊加；呼叫端負責繪圖。
- 使用 `createCharacter({ gender, hairstyle, hairColor })` 建立固定造型，再以 `actor.draw(p, { x, floor, size, face, pose, level })` 繪製。`face`／`pose` 使用上述軌道取樣結果，位置與尺寸以像素為單位；函式隔離 p5 樣式與座標狀態。`gender` 支援 neutral、female、male、nonbinary，僅記錄身分、不改寫外觀或旁白音色；`hairstyle` 支援 none、short、bob、long、ponytail；`hairColor` 使用 `#RRGGBB`。預設為 neutral／short／#51382d，demo 的造型設定在 `projects/demo/appearance.js`。所有造型均由原創幾何圖形繪製，頭髮隨角色動作變換，不載入外部角色素材。
- 水平位移由呼叫端套用：先以 `const pose = action.sample(time)` 取樣一次，再傳入 `x: baseX + size * pose.x` 及同一份 `pose`。`draw` 只自行套用垂直位移 `size * pose.y`；`floor` 維持站立地面，不預先加上 `pose.y`，避免重複位移。
- `projects/demo/story.js` 與 `sketch.js` 示範情緒、肢體及音量嘴型的整合，可依台詞調整故事與動作時間軸。
- 中文旁白使用 `lib/speech.py`，只能經 `npm run speech:prepare` 與 `npm run speech -- projects/demo/narration.json assets/speech/demo.wav` 入口執行。先依根 README 建立 Python 環境；僅準備依賴／固定模型時連網，合成時由 sandbox 禁止網路並驗證模型雜湊。
- 旁白的 `duration` 與 `cues[].at` 以秒為單位，輸出 WAV 與同名 JSON 記錄實際句末時間。超長台詞會依音素長度切句；語音重疊或越過總長度時拒絕發布，不覆寫既有音檔或時序。調整台詞時必須同步調整故事時間軸。
- 情緒語速不是模型原生的情緒演技；嘴型以 `level` 估計，不宣稱音素對嘴、聲音複製或臺灣口音。此語音模型與引擎的授權來源另記於 `voice-model.lock.json`／`provenance.json`，不沿用上游 p5 技能的 MIT 授權聲明。


## 隔離與安全限制

- 專案、音訊與輸出只可位於 `mv/` 內各自指定的 `projects/`、`assets/`、`output/` 目錄。使用相對路徑；不得透過 `..`、絕對路徑或 symlink 讀寫 `mv/` 外部資料。不要把 repo secrets、登入 cookies、憑證或私人檔案複製到專案或素材中。
- 頁面只使用專案目錄內的本機檔案、`/vendor/p5.min.js`、`/lib/emotion.js`、`/lib/motion.js` 與 `/lib/character.js`。renderer 不開放整個 `lib/` 目錄或 Python 語音程式。禁止外部網路、CDN、遠端模組、遠端圖片、遠端 CSS、外部／網路字型與動態載入；不可建立 fetch/XHR、WebSocket 或其他網路請求。需要文字時以 p5 canvas 文字和通用本機字型族為限，不下載字型檔。
- 不呼叫麥克風、攝影機、p5.sound、Web Audio、`getUserMedia()` 或瀏覽器權限 API。音訊反應只使用 renderer 傳入的 `level`。
- 僅經 `npm run render -- ...` 呼叫 macOS `sandbox-exec` 入口；不得直接呼叫內部 renderer。wrapper 使用環境變數 allowlist，將 `HOME`、`TMPDIR` 隔離至 `mv/.runtime/`，不繼承 cookies、secrets 或任意環境變數。控制器與 FFmpeg 的 sandbox 限制寫入至 `mv/`、網路至 loopback，並禁止讀取其他使用者目錄、外接磁碟、系統暫存與 keychain；仍允許必要系統資源讀取，不是完整的檔案系統 allowlist。
- wrapper 使用新鮮的 Chrome 暫存 profile 與瀏覽器原生 sandbox；Chrome 不受控制器的全目錄限制，不得將此工具視為執行不受信任專案的完整隔離環境。renderer 只接受本機服務自身 origin 的請求，服務只綁定 loopback，只提供指定專案 realpath 內檔案、核准的 p5.js vendor 及上述三個共用函式。不得讀取或沿用既有 Chrome profile、cookies、瀏覽器憑證或 `mv/` 外任意檔案；不得傳入 `--no-sandbox`、停用 web security 的旗標或其他降低隔離的選項。平台不符、執行檔雜湊不符或 sandbox 失敗時必須停止，不可移除 sandbox 後重試。
- CSP sandbox 不允許 popup，防止新頁面繞過原頁面的請求限制；wrapper 拒絕 `PUPPETEER_DANGEROUS_NO_SANDBOX=true`，避免繼承的設定停用 Chrome 原生 sandbox。

## 實作檢查清單

- [ ] 作品視覺概念、色彩、幾何與動畫節奏一致，避免未經設計的預設效果。
- [ ] `index.html` 與 module script 只載入本機 p5.js、專案檔案與三個核准共用函式，沒有 CDN、遠端字型、未列入允許範圍的資源或網路呼叫。
- [ ] `window.mvReady` 於初始化完成後設為 `true`；`window.renderFrame` 接受合約參數並可重現地完整繪出畫格。
- [ ] 音訊只放在 `assets/` 並由 wrapper 分析；沒有麥克風或其他瀏覽器音訊存取。
- [ ] 從 `mv/` 使用 `npm run render -- projects/demo assets/music.wav output/movie.mp4`（或替換為合法的本機路徑），輸出只指定新的 `output/*.mp4`。

## 保留的參考

以下均對應上游 `skills/creative/p5js/references/`，完整快照保存在本目錄；除此之外，本技能不引用未保留的上游參考、scripts 或 templates。

- [`references/core-api.md`](references/core-api.md)：畫布、座標、逐格繪圖、轉換、離屏圖層、構圖、亂數與數學工具。
- [`references/animation.md`](references/animation.md)：時間函數、緩動、彈簧、狀態機、時間軸、轉場與逐格可重現動畫。
- [`references/color-systems.md`](references/color-systems.md)：HSB/HSL/RGB、色彩插值、調色盤、漸層及混色模式。
- [`references/shapes-and-geometry.md`](references/shapes-and-geometry.md)：基本圖形、路徑、曲線、向量、SDF、幾何與裁切。
- [`references/visual-effects.md`](references/visual-effects.md)：noise、流場、粒子、像素處理、材質、回饋效果及生成式技法。

## 來源授權與本地差異

上游作者與授權依據為 Nous Research，MIT License，Copyright (c) 2025 Nous Research；完整授權文字見 `LICENSE`。本機版本只引用上述五份繪圖／動畫知識文件，並以本文件加入固定逐格介面、MP4 音訊流程、精確版本、路徑與瀏覽器隔離限制；未複製上游 SKILL、README、scripts、viewer 或 templates，也未改動上游參考文件內容。上游參考中的外部載入、麥克風、p5.js 2.x 或其他匯出示例不授權本地專案採用，必須遵守本文件的限制。
