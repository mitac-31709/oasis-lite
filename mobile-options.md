# スマホ利用の選択肢（UserScript 以外）

前提（変わらない制約）:

- ブラウザ直叩きでは CORS あり。**CORS はブラウザ専用**で、ネイティブ HTTP には無い
- Auth0 の `redirect_uri` / `client_id` は公式の `https://shop.povo.jp` 向け
- povo / Auth0 のサーバ設定は利用者には変更不可

## 比較

| 方式 | スマホ向き | CORS | 認証 | 位置情報 | 追加サーバ | 手間 |
| --- | --- | --- | --- | --- | --- | --- |
| UserScript（現行） | △ Firefox+拡張など | shop 上なら回避 | 公式どおり | ブラウザ Geolocation | 不要 | 拡張導入が重い |
| **Android WebView 注入** | ◎ | WebView が shop を開けば回避 | SSO URL を WebView で開き JS 注入 | Android Location も可 | 不要 | アプリ1本 |
| **Android ネイティブ API** | ◎ | 無し | WebView でトークン取得→ネイティブへ渡す | Fused Location ◎ | 不要 | やや増 |
| PWA 単体（自前オリジン） | ○ UX | **詰む** | redirect も詰む | 可 | 不要でも動かない | — |
| PWA + 自前プロキシ | ○ | プロキシで回避 | Auth0 redirect が別問題 | 可 | **必要** | 重い |
| ブックマークレット | ×〜△ | shop 上なら可 | 可 | 可 | 不要 | モバイル Chrome が弱い |
| ショートカットだけ | △ | 同上 | URL 開くだけ | — | 不要 | UI なし |

## 推奨順（スマホ）

### 1. Android WebView ラッパー（最有力）

小さな Android アプリが `WebView` で `shop.povo.jp` の SSO URL を開き、ページ上に `oasis-lite` 相当の JS を `evaluateJavascript` で注入する。

- オリジンは公式どおり → CORS / Auth0 を満たしやすい
- Tampermonkey 不要
- URL 欄・データ取得・ログは注入 UI かネイティブ UI
- 位置は Web Geolocation でも、権限をアプリに寄せてネイティブ取得→JS に渡すでもよい

流れ:

1. アプリ起動 → URL 貼り付け（または共有インテントで受け取る）
2. WebView で SSO URL を load
3. ロード完了後に lite スクリプト注入
4. 認証・claim は既存ロジックと同じ

共有受け取り（`ACTION_SEND` / ブラウザ共有）に対応すると、アプリ内ブラウザから URL コピーの手間が減る。

### 2. ハイブリッド（WebView 認証 + ネイティブ claim）

1. WebView で SSO〜Auth0 まで（または注入スクリプトで token 取得）
2. `JavascriptInterface` で access_token を Kotlin/Java へ
3. OkHttp で `usage-details` / `validate` / `claim`（CORS なし）
4. 位置は Play Services Fused Location（屋内・ローソン向けに有利なことが多い）

通信制限下では「画面はネイティブの太いボタン1つ + ログ」にでき、Web 資産は認証だけにできる。

### 3. PWA

**自前ドメインの PWA だけでは不足**（CORS + Auth0 redirect）。

成立させるなら例えば:

- PWA = UI のみ
- Cloudflare Worker 等が `app.povo.jp` をプロキシ（CORS 付与）
- 認証は「一度 shop を Custom Tab / 外部で開き token を手渡し」など別経路

サーバ運用・トークン受け渡しが必要で、個人用途には WebView 案より重い。

### 4. モバイルで UserScript を続ける場合

- Firefox Android + Violentmonkey
- Kiwi / Lemur 等 Chromium + Tampermonkey

可能だが拡張の維持が不安定で、一般向けではない。

## URL 取得の手間を減らす（方式共通）

- Android **共有インテント**で SSO URL を受け取る（推奨）
- 可能なら povo アプリの「ブラウザで開く」→ 自分のアプリをデフォルト関連付け（限定的）
- サイレント認証・token のローカル保存で SSO 回数を減らす（現行 README どおり）

## やらない方がよいこと

- 非公式 APK 改変や Magisk 前提（スマホ日常利用向きでない）
- 不特定多数向けにプロキシを公開（トークン中継事故のリスク）

## 次の実装候補

→ **実装済み:** [`android/`](./android/)（共有インテント対応 WebView 注入アプリ）

将来拡張: WebView で token 取得 → ネイティブ OkHttp + Fused Location で claim。
