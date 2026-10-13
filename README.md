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

`factories/mv/` 是獨立的本機 p5.js 動畫與影片製作工具，依音訊逐格渲染並合成 MP4。包含共用渲染腳本 `scripts/run.mjs`、`scripts/render.mjs`、npm 套件設定與鎖檔、工具鎖檔、demo 專案與音檔，以及 p5.js 技能與來源授權記錄。

在 `factories/mv/` 目錄執行：

```sh
npm ci
mkdir -p output
npm run render -- projects/demo assets/demo-tone.wav output/demo-new.mp4
```

渲染入口僅支援 macOS `sandbox-exec`；Node、FFmpeg、ffprobe 與 Chrome 的路徑和雜湊須符合 `factories/mv/tools.lock.json`。使用前須先備妥工具、審閱並依本機環境更新鎖檔，不得繞過隔離或雜湊檢查。輸出檔不可已存在。Chrome 使用新鮮 profile 與原生 sandbox，但不受控制器的全目錄限制；只執行已審閱的專案，不將此工具視為不受信任程式碼的完整隔離環境。

影片完成後才發布至 `output/`，不覆寫既有檔案；`output/` 與 `.runtime/` 須位於同一檔案系統。Ctrl-C 會終止控制器與編碼子程序並清除本次暫存，不留下未完成影片。頁面禁止開啟 popup；若設定了 `PUPPETEER_DANGEROUS_NO_SANDBOX=true`，入口會拒絕執行。

版本控制保留共用製程、`projects/demo/` 與 `assets/demo-tone.wav`。其他影片專案、專用素材與製作腳本只留在本機；`node_modules/`、`output/`、`.browser-cache/`、`.npm-cache/`、`.npm-global-empty` 與 `.runtime/` 也不納入 Git。clone 不包含這些本機內容，執行前須自行備妥工具與依賴。技能與渲染合約見 [`factories/mv/skills/p5js/SKILL.md`](factories/mv/skills/p5js/SKILL.md)。
