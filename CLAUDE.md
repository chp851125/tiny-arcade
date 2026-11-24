# TINYARCADE

## 專案

- 名稱：TINYARCADE，單機小遊戲合集網站，部署在 GitHub Pages（網址路徑 /tiny-arcade/）
- 純前端靜態網站，無後端、無資料庫
- 我不看程式碼，只看畫面驗收；請用我看得懂的方式回報

## 技術限制

- Vite + TypeScript（strict），不使用 React / Vue 等框架
- 絕對禁止 localStorage / sessionStorage / cookie / IndexedDB，所有狀態只存在記憶體
- 只支援電腦（鍵盤與滑鼠），不做手機觸控與直向版面
- 必須支援不同電腦螢幕尺寸與視窗縮放（1280×720 到 4K）
- 所有美術皆用程式產生（CSS、SVG、Canvas），音效用 Web Audio 合成，禁止外部圖片檔與音檔
- 不新增 npm 依賴，除非我明確同意
- 路由使用 hash（#/ 為大廳、#/g/遊戲id 為遊戲、#/design 為開發用設計展示頁）
- package.json scripts：dev、build、lint、typecheck

## 美術風格：粗框貼紙風

- 紙感米黃底（約 #fff7d6）、深色墨線（約 #1b1b1b）
- 元件 3px 粗黑框、8px 圓角、純色塊填色，不用漸層與模糊
- 可用硬邊偏移陰影（無模糊）；按下時有位移回彈
- 每款遊戲有自己的主色（accent），UI 元件吃 CSS 變數 --accent 換色
- 新遊戲一律使用 src/design/ 的元件與變數，不自行另訂風格

## 目錄結構

- src/design/ 設計系統（tokens、base、元件）
- src/shared/ 共用模組：viewport、audio、input、loop、random
- src/games/ registry.ts、types.ts 與各遊戲資料夾（每款遊戲一個資料夾，例如 src/games/tictactoe/）
- src/lobby/ 大廳

## 遊戲介面

每款遊戲匯出 mount(container, ctx) 與 destroy()；ctx 提供音效、輸入、畫面縮放、回大廳。
destroy 必須清掉所有事件監聽、計時器與迴圈，離開遊戲後不能殘留任何東西。

## 新增遊戲的標準步驟

1. 在 src/games/ 建立該遊戲的資料夾，實作 mount 與 destroy
2. 在 registry.ts 將該遊戲的 status 改為 ready，並接上 loadGame
3. 只使用 src/design 的元件與 src/shared 的模組，不自行重造
4. 遊戲內要有：暫停（Dialog）、遊戲結束與重新開始、HudBar（含回大廳與靜音）
5. 驗證：反覆進出該遊戲數次，確認沒有殘留監聽或迴圈
6. 分數只在當次遊戲顯示，不儲存

## 版面規範

- 大廳用流體排版（CSS Grid auto-fill + minmax、rem、clamp），內容區設最大寬度並置中
- 遊戲畫面一律透過 src/shared/viewport.ts 縮放：遊戲宣告固定邏輯解析度，等比縮放置中，處理 devicePixelRatio；禁止寫死視窗像素尺寸
- DOM 型遊戲（如井字棋、2048）用 rem 與 CSS Grid 做流體排版

## Git 工作規範

- main 是線上版本，禁止直接 commit 或 push 到 main
- 每項工作開新 branch：feature/xxx、fix/xxx 或 chore/xxx；開始前確認在最新的 main 且沒有未提交變更，否則先問我
- commit 訊息用英文，簡短清楚；一個 branch 可有多個 commit
- 禁止 force push，禁止修改 git config 與 remote
- 我只看畫面不看程式碼，所以每項工作完成後自動執行「完成流程」，不用再問我
- 不要用 gh 操作 issue、repo 設定、secrets，除非我明確要求
- 遇到無法判斷的錯誤就停下來問我，不要用破壞性手段（例如 reset --hard）

### 完成流程

1. 跑 typecheck、lint、build，全部通過才繼續
2. commit，然後 git push -u origin 該 branch
3. gh pr create 發 PR（標題簡短，內文用繁體中文列出改了什麼）
4. gh pr checks --watch 等檢查；失敗就修正後再推送，最多重試兩次，仍失敗就停下來告訴我原因
5. 檢查通過後 gh pr merge --squash --delete-branch
6. 切回 main 並 git pull
7. 用 gh run list 確認部署已觸發，並回報部署是否成功
8. 回報只說：做了什麼、PR 連結、部署結果、我該怎麼在網站上驗證

## 工作規範（節省用量）

- 一次只做我指定的範圍，不主動重構、不主動加功能
- 不要通讀整個專案，只讀與任務相關的檔案
- 先做核心玩法，音效與特效等我下一輪再要求
- 回報要精簡：說明改了什麼、如何驗證，不要貼大量程式碼
- 遇到錯誤先分析原因再修，不要反覆亂試
- 我回報問題時，只處理那一個問題，不順便改其他地方