# TINYARCADE

單機小遊戲合集網站：24 款小遊戲，打開網頁就能玩，不用註冊、不用安裝。

- 網址：<https://chp851125.github.io/tiny-arcade/>
- 純前端靜態網站：沒有後端、沒有資料庫，部署在 GitHub Pages
- 只支援電腦（鍵盤與滑鼠），可適應 1280×720 到 4K 的視窗大小

## 專案特色

- **不儲存任何資料**：不使用 localStorage、sessionStorage、cookie、IndexedDB，所有狀態只存在記憶體，重新整理就歸零
- **全部程式產生**：美術用 CSS、SVG、Canvas 畫出來，音效用 Web Audio 合成，沒有任何圖片檔或音檔
- **統一風格**：粗框貼紙風，由 `src/design/` 的設計系統（CSS 變數與元件）提供，每款遊戲各有自己的主色
- **零執行期依賴**：沒有使用 React、Vue 等框架，也沒有任何 npm 執行期套件

## 技術

- [Vite](https://vite.dev/) + TypeScript（strict）
- ESLint + Prettier
- GitHub Actions：Pull Request 會跑型別檢查、Lint 與建置，合併到 `main` 後自動部署到 GitHub Pages

## 開始開發

需要 Node.js 24（與 CI 相同）。

```bash
npm ci          # 安裝套件
npm run dev     # 啟動開發伺服器
```

開發時網址是 `http://localhost:5173/tiny-arcade/`。

| 指令                | 說明                       |
| ------------------- | -------------------------- |
| `npm run dev`       | 開發伺服器                 |
| `npm run build`     | 建置正式版到 `dist/`       |
| `npm run preview`   | 預覽建置後的結果           |
| `npm run typecheck` | TypeScript 型別檢查        |
| `npm run lint`      | ESLint 檢查                |
| `npm run format`    | 用 Prettier 整理程式碼格式 |

## 網址（Hash 路由）

| 網址            | 內容                           |
| --------------- | ------------------------------ |
| `#/`            | 大廳                           |
| `#/g/<遊戲 id>` | 進入某款遊戲，例如 `#/g/snake` |
| `#/design`      | 設計系統展示頁（開發用）       |

## 目錄結構

```text
src/
  main.ts          進入點與路由
  design/          設計系統：CSS 變數、基底樣式與共用元件（Button、Card、Dialog、HudBar…）
  shared/          共用模組：viewport、audio、input、loop、random、symbols
  games/           遊戲：registry.ts、types.ts、shell.ts，以及每款遊戲各一個資料夾
  lobby/           大廳
.github/workflows/ CI 與部署
```

## 架構

- **遊戲介面**：每款遊戲匯出 `mount(container, ctx)` 與 `destroy()`。`ctx` 提供音效、鍵盤輸入、畫面縮放與回大廳。`destroy()` 必須清掉所有事件監聽、計時器與迴圈，離開遊戲後不留任何東西。
- **註冊表**：`src/games/registry.ts` 記錄所有遊戲的名稱、分類、難度星數與操作說明，並用動態載入（dynamic import）讓每款遊戲分開打包。
- **遊戲外殼**：`src/games/shell.ts` 負責遊戲頂部的資訊列（回大廳、靜音），並在離開時保底清理。
- **畫面縮放**：Canvas 遊戲宣告固定的邏輯解析度，由 `shared/viewport.ts` 等比縮放置中並處理高 DPI；DOM 遊戲用 `rem` 與 CSS Grid 做流體排版。
- **主迴圈**：`shared/loop.ts` 提供固定時間步長的迴圈，視窗失去焦點時會自動暫停。

## 新增一款遊戲

1. 在 `src/games/` 建立資料夾，實作 `mount` 與 `destroy`
2. 在 `src/games/registry.ts` 的 `games` 加一筆資料，並在 `loaders` 接上動態載入
3. 只使用 `src/design/` 的元件與 `src/shared/` 的模組
4. 遊戲內要有暫停、結束與重新開始，並確認反覆進出遊戲沒有殘留的監聽或迴圈
5. 分數只在當次遊戲顯示，不要儲存

完整的專案規範（風格、Git 流程等）請見 [CLAUDE.md](./CLAUDE.md)。

## 部署

推送到 `main` 後，`.github/workflows/deploy.yml` 會自動建置並部署到 GitHub Pages。網站放在子路徑 `/tiny-arcade/`，所以 `vite.config.ts` 的 `base` 設為 `/tiny-arcade/`；如果改了 repo 名稱，要一併修改。
