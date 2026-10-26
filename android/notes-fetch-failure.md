# 詳細API取得失敗の調査メモ

## 症状

- 残データ / アカウント / Oasis が「取得失敗」（過去）
- claim が `Failed to fetch`（2026-08-12）

## 原因 A: Origin 不正（過去・対策済み）

`WebView.loadDataWithBaseURL()` で最小 HTML を載せていた。

- 見た目の URL は `shop.povo.jp` でも、環境によって **`location.origin` / `Origin` ヘッダが不正確**になりうる
- 対策: 実ナビゲート `loadUrl` + HTML Intercept

## 原因 B: app.povo.jp の CORS（今回の Failed to fetch）

実測（OPTIONS）でも HAR でも、`app.povo.jp` の `Access-Control-Allow-Origin` は常に:

`https://kddi-openapi-web.povo.jp`

公式の claim / validate も **Origin / Referer が kddi-openapi-web**。  
Auth0 は `shop.povo.jp`（`redirect_uri`）だが、rewards API は OpenAPI Web 起点。

そのため **shop.povo.jp 上の `fetch` は CORS で必ず失敗**し、ブラウザは `Failed to fetch` になる（HTTP ステータスは JS から見えない）。

### 対策

Android: `JavascriptInterface`（`OasisNative.postJson`）で claim を **ネイティブ HTTP** 送信（CORS 対象外）。  
リクエストには公式同様 `Origin` / `Referer` を `kddi-openapi-web.povo.jp` にする。

UserScript（ブラウザ）だけでは同じ CORS 制約が残る。必要なら別途拡張の background fetch 等が要る。

## その他の候補

- 未認証・トークン期限切れ → 401（ログに status が出る）
- SSO なし初回のサイレント認証失敗 → その後の API も失敗
- 遮断リストに `app.povo.jp` を入れないこと
