# 〈三花之戰〉投票

〈愛蓮說〉延伸饒舌對決〈三花之戰〉的投票網站。

- **全網投票**：https://mathruffian-dot.github.io/sanhua-vote/ ，所有看過影片的人都能投，投完才看得到票數。
- **課堂版**：https://mathruffian-dot.github.io/sanhua-vote/class/ ，老師開房間，全班投兩輪：第一輪 → 公布「我們班 vs 全網」→ 討論 → 第二輪（多一個「我還在想」＋一句理由）→ 公布改票流向。
- **教師手冊**：https://mathruffian-dot.github.io/sanhua-vote/class/guide.html ，〈愛蓮說〉× SEL 45 分鐘流程。

不用登入、不收姓名；班上的票不算進全網；房間 30 天後關閉。

## 結構

| 資料夾 | 內容 |
|:--|:--|
| `docs/` | 前端靜態頁（GitHub Pages） |
| `worker/` | Cloudflare Worker＋D1 API（`schema.sql` 是資料表） |

## 部署

```bash
cd worker
npm install
npx wrangler d1 create sanhua-vote          # 把 database_id 填進 wrangler.toml
npx wrangler d1 execute sanhua-vote --remote --file=schema.sql
npx wrangler secret put IP_SALT             # 任意長字串
npx wrangler secret put TURNSTILE_SECRET    # 選用：Cloudflare Turnstile
npx wrangler deploy
```

再把 Worker 網址（和 Turnstile site key）填進 `docs/assets/config.js`。

本機測試：`npx wrangler dev --local`（API 在 8787），另開靜態伺服器跑 `docs/`；localhost 開的頁面會自動連本機 API。

QR code 產生器：qrcode-generator（Kazuhiko Arase，MIT）。

字型：源石黑體 GenSeki Gothic 2 TW（ButTaiwan，SIL Open Font License 1.1，https://github.com/ButTaiwan/genseki-font ），`docs/assets/fonts/` 是只含網站用字的子集，網站文字改了就跑 `python tools/make_fonts.py` 重裁（需要 fonttools、brotli）。
