# TINYARCADE

## 專案

- 名稱：TINYARCADE，單機小遊戲合集網站，部署在 GitHub Pages（網址路徑 /tiny-arcade/）
- 純前端靜態網站，無後端、無資料庫

## 技術限制

- Vite + TypeScript（strict），不使用 React / Vue 等框架
- 絕對禁止 localStorage / sessionStorage / cookie / IndexedDB，所有狀態只存在記憶體
- 只支援電腦（鍵盤與滑鼠），不做手機觸控與直向版面
- 必須支援不同電腦螢幕尺寸與視窗縮放（1280×720 到 4K）
- 所有美術皆用程式產生（CSS、SVG、Canvas），音效用 Web Audio 合成，禁止外部圖片檔與音檔
- 不新增 npm 依賴，除非我明確同意
- 路由使用 hash（#/ 為大廳、#/g/遊戲id 為遊戲）

## 美術風格：粗框貼紙風

- 紙感米黃底（約 #fff7d6）、深色墨線（約 #1b1b1b）
- 元件 3px 粗黑框、8px 圓角、純色塊填色，不用漸層與模糊
- 可用硬邊偏移陰影（無模糊）；按下時有位移回彈
- 每款遊戲有自己的主色（accent），UI 元件吃 CSS 變數 --accent 換色
- 新遊戲一律使用 src/design/ 的元件與變數，不自行另訂風格

## 規劃中的目錄結構

- src/design/ 設計系統
- src/shared/ 共用模組：viewport、audio、input、loop、random
- src/games/ registry.ts 與各遊戲資料夾（每款遊戲一個資料夾）
- src/lobby/ 大廳

## 遊戲介面（之後會實作）

每款遊戲匯出 mount(container, ctx) 與 destroy()；ctx 提供音效、輸入、畫面縮放、回大廳。新增遊戲 = 新資料夾 + registry 加一筆資料。

## 版面規範

- 大廳用流體排版（CSS Grid auto-fill + minmax、rem、clamp），內容區設最大寬度並置中
- 遊戲畫面一律透過 src/shared/viewport.ts 縮放：遊戲宣告固定邏輯解析度，等比縮放置中，處理 devicePixelRatio；禁止寫死視窗像素尺寸

## Git 工作規範

- main 是線上版本，禁止直接 commit 或 push 到 main（專案第一個 commit 除外）
- 每項工作開新 branch：feature/xxx、fix/xxx 或 chore/xxx
- commit 訊息用英文，簡短清楚；一個 branch 可有多個 commit
- 推送前先問我；禁止 force push；禁止修改 git config 與 remote
- 不要幫我發 PR，我會在 GitHub 網頁操作
- commit 前先跑 typecheck、lint、build，確認通過

## 工作規範（節省用量）

- 一次只做我指定的範圍，不主動重構、不主動加功能
- 不要通讀整個專案，只讀與任務相關的檔案
- 先做核心玩法，音效與特效等我下一輪再要求
- 回報要精簡：說明改了什麼、如何驗證，不要貼大量程式碼
- 遇到錯誤先分析原因再修，不要反覆亂試
