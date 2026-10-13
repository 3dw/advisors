# advisors — AI 顧問角色人設庫

一批可直接貼上就用的 **AI 角色人設 Markdown 檔**。每個檔案定義一位顧問的角色定位、專業素養與限制條件，用來餵給 ChatGPT 的 Custom GPT／System Prompt，或其他 AI 平台的角色欄位。

## 怎麼用

1. 打開 `personas/` 底下想要的角色檔。
2. 複製整份內容（含開頭到結尾）。
3. 貼進 ChatGPT 的 Custom GPT 指令欄、System Prompt，或任何 AI 平台的角色設定欄位。
4. 開始對話，AI 就會依此扮演該顧問。

## 角色清單

| 角色 | 檔案 | 一句話描述 |
|------|------|-----------|
| 專案規畫顧問 | [`personas/project-planning-advisor.md`](personas/project-planning-advisor.md) | 把模糊目標拆解成可執行、可追蹤的專案計畫 |
| 市場行銷顧問 | [`personas/marketing-advisor.md`](personas/marketing-advisor.md) | 釐清市場定位、規畫策略並設計可衡量的推廣方案 |
| 財務會計顧問 | [`personas/finance-accounting-advisor.md`](personas/finance-accounting-advisor.md) | 做預算、管現金流、判讀報表與經營健康度 |
| 客戶關係管理顧問 | [`personas/crm-advisor.md`](personas/crm-advisor.md) | 經營顧客旅程、分層留存、提升客戶終身價值 |
| 人力資源顧問 | [`personas/hr-advisor.md`](personas/hr-advisor.md) | 處理招募、績效、團隊發展與員工關係 |
| 工程技術顧問 | [`personas/engineering-advisor.md`](personas/engineering-advisor.md) | 技術選型、系統設計與工程實務取捨 |
| 法務顧問 | [`personas/legal-advisor.md`](personas/legal-advisor.md) | 白話解讀法律風險、備妥與律師溝通的問題 |
| 溝通顧問 | [`personas/communication-advisor.md`](personas/communication-advisor.md) | 用薩提爾模式兼顧雙方感受與事情本身，把難談的對話談成雙贏 |
| 教學顧問 | [`personas/teaching-advisor.md`](personas/teaching-advisor.md) | 把學習目標轉化成可實施、可評量的課程與教學活動 |
| 影片設計顧問 | [`personas/video-design-advisor.md`](personas/video-design-advisor.md) | 把溝通目標轉化成可製作的影片概念、腳本、分鏡與剪輯方案 |
| 農業顧問 | [`personas/agriculture-advisor.md`](personas/agriculture-advisor.md) | 規畫作物生產、改善田間管理並評估農場經營風險 |
| 園藝顧問 | [`personas/gardening-advisor.md`](personas/gardening-advisor.md) | 選擇適合環境的植物、規畫綠化空間並建立照護習慣 |
| 育兒顧問 | [`personas/parenting-advisor.md`](personas/parenting-advisor.md) | 理解兒童發展、安排日常照顧，適孩子的成長階段，調整界限與自主空間 |

> 財務、法務、人資、溝通、農業、園藝、育兒等角色提供的是一般性資訊與教育，非正式專業意見；重大決策或涉及安全、健康與發展的疑慮，請諮詢合格的會計師、律師、心理師、農業或園藝專業人員、兒科醫師或相關專業人士。

## 新增角色

複製 [`personas/_TEMPLATE.md`](personas/_TEMPLATE.md) 起手，依固定的六個章節填寫。撰寫規範與檢查清單見 [`AGENTS.md`](AGENTS.md)。

## 影片製程

`factories/mv/` 是獨立的本機 p5.js 動畫與影片製作工具，依音訊逐格渲染並合成 MP4。包含情緒、動作、角色造型與離線中文旁白函式、共用渲染腳本、npm／Python 依賴鎖檔、工具與語音模型鎖檔、原創 demo，以及 p5.js 技能與來源授權記錄。

在 `factories/mv/` 目錄執行：

```sh
npm ci
mkdir -p output
npm run render -- projects/demo assets/demo-tone.wav output/demo-new.mp4
```

渲染入口僅支援 macOS `sandbox-exec`；Node、FFmpeg、ffprobe 與 Chrome 的路徑和雜湊須符合 `factories/mv/tools.lock.json`。使用前須先備妥工具、審閱並依本機環境更新鎖檔，不得繞過隔離或雜湊檢查。輸出檔不可已存在。Chrome 使用新鮮 profile 與原生 sandbox，但不受控制器的全目錄限制；只執行已審閱的專案，不將此工具視為不受信任程式碼的完整隔離環境。

影片完成後才發布至 `output/`，不覆寫既有檔案；`output/` 與 `.runtime/` 須位於同一檔案系統。Ctrl-C 會終止控制器與編碼子程序並清除本次暫存，不留下未完成影片。頁面禁止開啟 popup；若設定了 `PUPPETEER_DANGEROUS_NO_SANDBOX=true`，入口會拒絕執行。

版本控制保留共用製程、函式與測試、`projects/demo/` 與 `assets/demo-tone.wav`。其他影片專案、專用素材與製作腳本只留在本機；`assets/speech/` 的合成語音與時序、`node_modules/`、`output/`、`.browser-cache/`、`.npm-cache/`、`.npm-global-empty` 與 `.runtime/` 也不納入 Git。clone 不包含本機工具、Python 環境或模型權重，執行前須自行備妥。技能與渲染合約見 [`factories/mv/skills/p5js/SKILL.md`](factories/mv/skills/p5js/SKILL.md)。

### 情緒與動作函式

| 函式檔 | 介面與能力 |
| --- | --- |
| `lib/emotion.js` | `createEmotionTrack(keys, { transition, seed })`；支援 neutral、curious、joy、sad、angry、surprised、worried、calm，輸出眼睛、眉毛、嘴形、視線、傾斜與呼吸參數。每個 cue 可指定 `intensity`（0–1）；轉場、眨眼與待機動態都依時間取樣。 |
| `lib/motion.js` | `createMotionTrack(actions, { bpm })`；支援 walk、jump、wave、nod，包含緩動、跳躍預備與落地回彈、揮手收尾。位移與跳高以角色尺寸為單位，角度以弧度表示；水平／垂直縮放乘積維持 1。walk／jump 不可重疊，手勢可疊加。 |

兩者均回傳 `track.sample(time)`，不依賴 p5、播放時鐘或前一畫格；可亂序取樣。函式只產生姿勢資料，繪圖由呼叫端決定。專案的 module script 可直接使用 renderer 明確開放的兩個路徑：

```js
import { createEmotionTrack } from '/lib/emotion.js';
import { createMotionTrack } from '/lib/motion.js';

const mood = createEmotionTrack([{ at: 0, emotion: 'curious' }, { at: 2, emotion: 'joy' }]);
const action = createMotionTrack([{ type: 'jump', start: 2, duration: 1, height: 0.3 }]);
// 在 renderFrame 中，以 mood.sample(time) 與 action.sample(time) 繪出角色。
```

`projects/demo/story.js` 定義故事與動作時間軸，`sketch.js` 示範表情、肢體與音量嘴型的整合，包含光點出現、角色反應、靠近、揮手與跳躍的完整流程。

### 角色基本造型

編輯 `factories/mv/projects/demo/appearance.js`，下次渲染即使用新的設定：

```js
export const appearance = {
  gender: 'female',
  hairstyle: 'ponytail',
  hairColor: '#51382d',
};
```

| 欄位 | 可用值 | 預設 |
| --- | --- | --- |
| `gender` | `neutral`（未指定）、`female`（女性）、`male`（男性）、`nonbinary`（非二元） | `neutral` |
| `hairstyle` | `none`（無髮）、`short`（短髮）、`bob`（鮑伯頭）、`long`（長髮）、`ponytail`（馬尾） | `short` |
| `hairColor` | 六位十六進位色碼 `#RRGGBB`，如 `#222222`、`#c65c39` | `#51382d` |

性別是身分資料，不會自行改變身體、髮型、髮色或旁白音色；所有組合均可自由搭配。`none` 不繪製頭髮。造型僅使用原創幾何圖形，不需圖片、外部素材或下載。

其他專案可匯入 renderer 核准的 `/lib/character.js`，使用相同角色繪圖：

```js
import { createCharacter } from '/lib/character.js';

const actor = createCharacter({ gender: 'male', hairstyle: 'long', hairColor: '#222222' });
// 在 p5 instance 的 renderFrame 中：
const pose = action.sample(time);
const size = height * 0.32;
const baseX = width * 0.4;
actor.draw(p, {
  x: baseX + size * pose.x, floor: height * 0.76, size,
  face: mood.sample(time), pose, level,
});
```

`createCharacter(options)` 回傳 `{ appearance, draw }`；造型在建立時固定且唯讀，修改原始設定不會改變既有角色。無效性別、髮型或髮色會在建立時拒絕。`draw` 使用 `createEmotionTrack` 與 `createMotionTrack` 的取樣結果，保留表情、音量嘴型、呼吸、位移及肢體動作；頭髮隨角色一起旋轉與縮放。位置與 `size` 以像素為單位，`floor` 是站立地面，`level` 省略時視為 0；繪圖會恢復呼叫前的 p5 樣式與座標狀態。

水平位移由呼叫端套用：先取樣一次 `pose`，再傳入 `x: baseX + size * pose.x`。`draw` 不會再加上 `pose.x`，但會自行將垂直位移 `size * pose.y` 加到 `floor`，因此不要預先把 `pose.y` 加進 `floor`。

### 本機離線中文旁白

`lib/speech.py` 提供 `validate_narration`、`phoneme_chunks`、`assemble_narration`、`prepare_model` 與 `synthesize_narration`；`scripts/speech.mjs` 是 macOS 隔離入口。使用 Kokoro `0.9.4`、Misaki `0.9.4` 及 Kokoro-82M-v1.1-zh 的 `zf_001` 中文音色，以 CPU 合成 24 kHz 單聲道 WAV，不使用 Apple 系統聲音、雲端語音 API 或聲音複製。

在 `factories/mv/` 執行（需安裝 `uv` 與 Python 3.11；Python 依賴版本見 `requirements-voice.txt`）：

```sh
uv venv --python 3.11 .runtime/voice-env
uv pip sync --python .runtime/voice-env/bin/python requirements-voice.txt
npm run speech:prepare
npm run speech -- projects/demo/narration.json assets/speech/demo.wav
npm run render -- projects/demo assets/speech/demo.wav output/voice-demo.mp4
```

首次安裝依賴與 `speech:prepare` 需要連網。模型 checkpoint 約 327 MB，固定來源 commit、檔案大小與雜湊見 `voice-model.lock.json`；準備及每次推論都會驗證模型。合成時採環境 allowlist、離線模式與 `sandbox-exec` 禁止網路，不傳送台詞。暫存位於本次 session；取消會終止 process group 並清除 session。

旁白設定使用 `duration`（影片總秒數）與 `cues`；每句包含 `at`（起始秒數）、`text`、選填的 `emotion` 與 `speed`（0.65–1.4）。預設情緒語速取自 `PROSODY`。長台詞依實際音素長度切句，不使用上游的截斷行為；實際語音若重疊或超出影片長度會失敗，請調整時間軸。現階段只處理中文，英文縮寫請改成中文讀法。

輸出限定 `assets/speech/*.wav`，另產生同名 `.json`，記錄模型、音色、實際句末時間及 AI 合成標記；兩者都不覆寫。語音目錄與 `.runtime/` 必須在同一檔案系統。demo 是 20 秒原創故事；`demo-tone.wav` 只有 2 秒，僅供不安裝語音依賴時快速檢查渲染。

情緒語速與停頓不等同模型原生的情緒演技；音色不保證臺灣口音。示範嘴型以 RMS 音量估計，不是音素級對嘴。引擎與指定模型標示 Apache-2.0，但不代表全部相依套件都採相同授權；模型權重及依賴不納入 Git，若另行重散布應遵循各自授權與聲明。來源記錄見 [`provenance.json`](factories/mv/provenance.json)。

### 行為驗證

```sh
npm test
.runtime/voice-env/bin/python -B -m unittest discover -s tests -p 'test_*.py'
```

2026-10-14 已實跑離線中文旁白及 20 秒、1280×720、30 fps、H.264/AAC 的完整 demo，並檢查擔心表情、揮手、跳躍、亂序重繪一致性與音量嘴型。另驗證語音拒絕覆寫、拒絕外部輸出路徑及取消時不發布音檔；這些結果不代表其他機器可免設定工具與依賴執行。

2026-10-14 造型功能另通過 13 項 JavaScript 測試；瀏覽器實際繪製五種髮型與四種性別的 20 種組合，檢查髮色變化、跳躍／揮手、表情、音量嘴型及角色像素亂序重繪一致性。受控入口產出 `output/appearance-demo.mp4`，以 ffprobe 確認為 2 秒、640×360、5 fps、H.264/AAC；本次未重新合成中文旁白。
