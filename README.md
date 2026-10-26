# povo Oasis Lite

[![Release](https://img.shields.io/github/v/release/mitac-31709/oasis-lite?display_name=tag&sort=semver)](https://github.com/mitac-31709/oasis-lite/releases/latest)
[![APK](https://img.shields.io/badge/download-OasisLite.apk-blue)](https://github.com/mitac-31709/oasis-lite/releases/latest/download/OasisLite.apk)
[![License](https://img.shields.io/badge/license-see_repo-lightgrey)](https://github.com/mitac-31709/oasis-lite)

> **Latest release: [v1.0.0](https://github.com/mitac-31709/oasis-lite/releases/tag/v1.0.0)** — Android APK: [OasisLite.apk](https://github.com/mitac-31709/oasis-lite/releases/latest/download/OasisLite.apk)

Data Oasis 向けの**最小通信**クライアントです。  
公式が使う Auth0 と `app.povo.jp` の rewards API だけを呼び、Maps / ipify / Stripe / 計測 / OpenAPI CMS は送りません。

**スマホ本命は Android アプリです。** 使い方は **[`android/README.md`](./android/README.md)**。

1. **初回** … povo の Data Oasis バナーから Oasis Lite を開く → データ取得  
2. **2回目以降** … Oasis Lite を開き **データ取得** だけ  

デスクトップ向けに Tampermonkey / Violentmonkey 用スクリプトもあります。比較は [`mobile-options.md`](./mobile-options.md)。

## なぜユーザースクリプトか（CORS）

API はブラウザ CORS と、Auth0 の `redirect_uri=https://shop.povo.jp` が前提です。

- povo / Auth0 側の CORS は利用者が変えられない
- 自分用プロキシでも Auth0 の redirect / client 拘束は残る
- 追加サーバなしで公式に近いのは **`shop.povo.jp` 上で動かす**こと

そのためブラウザ版は `@match https://shop.povo.jp/*` のユーザースクリプトにしています。

| 優先 | 方式 | 理由 |
| --- | --- | --- |
| 1 | **Android WebView**（`android/`） | 上記の運用がしやすい |
| — | UserScript | デスクトップ／拡張ブラウザ向け |
| — | PWA 単体 | CORS / redirect で非推奨 |

## 入れ方（UserScript）

1. ブラウザに Tampermonkey 等を入れる
2. `oasis-lite.user.js` をインストール
3. `https://shop.povo.jp/*` を開くと画面下部に UI が出る

## SSO URL の取り方

1. povo 2.0 アプリを開く
2. Data Oasis のバナーをタップ（アプリ内で shop が開く）
3. URL をコピー（共有・アドレス欄・「ブラウザで開く」後のコピーなど。端末・版で差あり）
4. スクリプトが有効なブラウザでその URL を開く
5. 下部 UI の URL 欄が空なら貼り、「認証」

`?token=&sso=true` を検知すると自動で認証する。

## URL を使わない代替

| 方法 | 内容 |
| --- | --- |
| サイレント認証 | URL 空のまま「認証」。Auth0 セッション Cookie が残っていれば `prompt=none` で通る |
| トークン再利用 | 成功後 `sessionStorage` に access_token（目安 1 時間）。同タブなら再 SSO 不要 |
| アプリで shop 表示中 | バナーで `shop.povo.jp` になったブラウザにスクリプトが入っていれば、貼り付けなしで試せる |

サイレントが `login_required` のときだけ新しい SSO URL が必要。

## UI

- SSO URL（任意）
- **データ取得** ボタン1つ（認証→位置→claim）
- 通信種別ごとの状態: 未実施 / 通信中 / 完了 / 失敗（インジケーター）
- 一行の現在メッセージ

残データ等は取得しない。

## 通信（認証後）

必須のみ:

- Auth0 `/authorize` + `/oauth/token`
- `POST .../claim/system_wide_promotion/{id}` + `{"location":[lng,lat]}`

やらない: usage-details / profile / validate / Maps / ipify / Stripe / 計測 など

## 制限

- 月10回・日1回の残回数は観測 API に無し（claim 時にサーバ判定）
- 「povo回線 / 他キャリア」の厳密判定は不可（`navigator.connection` の wifi/cellular 程度）
- 自己責任。規約・位置情報同意の範囲で使うこと

## 関連

- HAR 解析: `tasks/2026-08-11-povo-shop-har/`
- PCAP 解析: `tasks/2026-08-11-povo-data-oasis-pcap/`
