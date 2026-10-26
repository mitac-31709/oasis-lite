// ==UserScript==
// @name         povo Oasis Lite
// @match        https://shop.povo.jp/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  if (window.__oasisLite) return;
  window.__oasisLite = 1;

  const AUTH = "https://pjp-povo.jp.auth0.com";
  const CID = "XEmOoDzmj3Uo6TPGHkU7ChignFq8h7xg";
  const AUD = "https://pjp-povo.jp.povo.com/api/v2";
  const REDIR = "https://shop.povo.jp";
  const API = "https://app.povo.jp";
  const PROMO = "670f9fbb4af32b0012ce9d8a";
  const SCOPE = "openid profile email offline_access";
  const A0C = btoa(JSON.stringify({ name: "auth0-spa-js", version: "2.3.0" }));

  const b64u = (buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const rnd = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
  const qs = (o) => new URLSearchParams(o).toString();
  const t = () => new Date().toLocaleTimeString("ja-JP", { hour12: false });

  let token = sessionStorage.getItem("ol_at") || "";
  let busy = false;
  const logs = [];
  const SPOOF_UNLOCK_TAPS = 7;
  const SPOOF_UNLOCK_MS = 2500;
  let spoofUnlocked = localStorage.getItem("ol_spoof_ui") === "1";
  let geoTapTimes = [];

  const STEPS = [
    ["auth", "認証"],
    ["geo", "位置情報"],
    ["claim", "データ取得"],
  ];

  const ui = document.createElement("div");
  ui.id = "oasis-lite";
  ui.innerHTML = `<style>
#oasis-lite{all:initial;position:fixed;z-index:2147483646;inset:0;display:flex;flex-direction:column;background:#111;color:#eee;font:15px/1.35 system-ui,sans-serif;padding:14px 16px calc(14px + env(safe-area-inset-bottom,0));overflow:auto;box-sizing:border-box}
#oasis-lite *{font:inherit;color:inherit;box-sizing:border-box}
#oasis-lite input,#oasis-lite button{width:100%;margin:0;padding:10px;border:1px solid #444;background:#1a1a1a;border-radius:8px}
#oasis-lite .stage{flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;width:100%;max-width:420px;margin:0 auto;min-height:0}
#oasis-lite #ol-go{background:#036cb5;border:0;font-weight:800;font-size:24px;letter-spacing:.04em;padding:22px 16px;border-radius:14px;box-shadow:0 6px 20px #036cb566}
#oasis-lite #ol-go:active{transform:scale(.98)}
#oasis-lite #ol-help-open{background:#1e1e1e;border:1px solid #3a3a3a;font-size:15px;font-weight:600;padding:12px}
#oasis-lite button:disabled{opacity:.45}
#oasis-lite .now{font-size:13px;opacity:.85;min-height:1.2em;text-align:center;margin:0}
#oasis-lite .now a{color:#6eb6ff;text-decoration:underline;cursor:pointer}
#oasis-lite .steps{margin:0;padding:0;list-style:none}
#oasis-lite .steps li{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #222}
#oasis-lite .steps li:last-child{border-bottom:0}
#oasis-lite .dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;background:#555}
#oasis-lite .idle .dot{background:#555}
#oasis-lite .run .dot{background:#f0c000;box-shadow:0 0 0 3px #f0c00044}
#oasis-lite .ok .dot{background:#3c3}
#oasis-lite .ng .dot{background:#e33}
#oasis-lite .lbl{flex:1}
#oasis-lite .st{opacity:.75;font-size:13px}
#oasis-lite #ol-s-geo{cursor:pointer;user-select:none;-webkit-user-select:none}
#oasis-lite .spoof{display:none;padding:10px;border:1px dashed #555;border-radius:8px;background:#161616}
#oasis-lite .spoof.on{display:block}
#oasis-lite .spoof .row{display:flex;gap:6px;margin-top:8px;align-items:center}
#oasis-lite .spoof label{display:flex;align-items:center;gap:8px;font-size:13px}
#oasis-lite .spoof input[type=checkbox]{width:auto;margin:0}
#oasis-lite .spoof input[type=number]{flex:1;padding:8px;font-size:13px}
#oasis-lite .spoof .hint{font-size:11px;opacity:.65;margin-top:6px}
#oasis-lite .spoof #ol-spoof-nearest{margin-top:8px;padding:8px;font-size:13px;background:#222;border:1px solid #555}
#oasis-lite .spoof #ol-spoof-spot{margin-top:6px;font-size:12px;opacity:.9;min-height:1.2em}
#oasis-lite .foot{margin-top:12px;width:100%;max-width:420px;margin-left:auto;margin-right:auto}
#oasis-lite details.debug{font-size:12px;opacity:.9}
#oasis-lite details.debug summary{cursor:pointer;user-select:none;opacity:.7;padding:2px 0}
#oasis-lite #ol-log{white-space:pre-wrap;word-break:break-all;font:11px/1.35 ui-monospace,monospace;max-height:9em;overflow:auto;background:#000;padding:8px;border-radius:6px;margin-top:6px}
#oasis-lite .dbg-row{display:flex;gap:6px;margin-top:6px}
#oasis-lite .dbg-row button{flex:1;padding:6px;font-size:12px;background:#222;border:1px solid #444}
#ol-modal{display:none;position:fixed;z-index:2147483647;inset:0;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font:15px/1.35 system-ui,sans-serif;color:#eee}
#ol-modal.open{display:flex}
#ol-modal .bg{position:absolute;inset:0;background:#000b;border:0;padding:0;margin:0;width:auto;height:auto}
#ol-modal .card{position:relative;z-index:1;width:100%;max-width:440px;max-height:min(82vh,640px);overflow:auto;background:#1a1a1a;border:1px solid #333;border-radius:14px;padding:14px 14px 16px;box-shadow:0 12px 40px #000a}
#ol-modal .card-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
#ol-modal .card-hd h2{flex:1;margin:0;font-size:17px;font-weight:700}
#ol-modal #ol-help-close{width:auto;flex:0 0 auto;padding:6px 12px;font-size:13px;background:#2a2a2a;border:1px solid #444;border-radius:8px;color:#eee}
#ol-modal .help-body{font-size:12.5px;line-height:1.55}
#ol-modal .help-body h3{margin:12px 0 4px;font-size:13px;font-weight:700}
#ol-modal .help-body h3:first-child{margin-top:0}
#ol-modal .help-body ol,#ol-modal .help-body ul{margin:4px 0 0;padding-left:1.25em}
#ol-modal .help-body li{margin:3px 0}
#ol-modal .help-body p{margin:4px 0 0}
#ol-modal .help-body .muted{opacity:.7;font-size:11.5px}
</style>
<div class="stage">
<button type="button" id="ol-go">データ取得</button>
<button type="button" id="ol-help-open">使い方</button>
<div class="now" id="ol-now"></div>
<ul class="steps" id="ol-steps"></ul>
<div class="spoof" id="ol-spoof">
<label><input type="checkbox" id="ol-spoof-on" />位置情報を偽装する</label>
<div class="row">
<input type="number" id="ol-spoof-lat" step="any" inputmode="decimal" placeholder="緯度 lat" />
<input type="number" id="ol-spoof-lng" step="any" inputmode="decimal" placeholder="経度 lng" />
</div>
<button type="button" id="ol-spoof-nearest">最寄りスポットに設定</button>
<div id="ol-spoof-spot"></div>
<div class="hint">位置情報行を連打で表示／非表示。最寄りは OSM（ローソン／対象私鉄駅）。</div>
</div>
</div>
<div class="foot">
<details class="debug" id="ol-debug">
<summary>デバッグログ</summary>
<div class="dbg-row">
<button type="button" id="ol-log-clear">消去</button>
<button type="button" id="ol-log-copy">コピー</button>
</div>
<pre id="ol-log"></pre>
</details>
</div>`;
  document.documentElement.appendChild(ui);

  const modal = document.createElement("div");
  modal.id = "ol-modal";
  modal.innerHTML = `<button type="button" class="bg" id="ol-help-bg" aria-label="閉じる"></button>
<div class="card" role="dialog" aria-modal="true" aria-labelledby="ol-help-title">
<div class="card-hd">
<h2 id="ol-help-title">使い方</h2>
<button type="button" id="ol-help-close">閉じる</button>
</div>
<div class="help-body">
<h3>このアプリでできること</h3>
<p>初回だけ povo アプリからログインし、あとは <b>データ取得</b> を押すだけで Data Oasis をチャージします。</p>
<ul>
<li>状態: 灰＝まだ / 黄＝通信中 / 緑＝成功 / 赤＝失敗</li>
<li>残ギガや回数は公式 povo アプリで確認してください</li>
</ul>
<h3>最初に一度だけ</h3>
<ol>
<li>上部の <b>既定</b> を開き、リンク設定へ進む</li>
<li><b>shop.povo.jp/dashboard</b>（Data Oasis）をこのアプリで開くようにする</li>
<li>位置情報を求められたら許可する</li>
</ol>
<p class="muted">Data Oasis 以外の shop リンクは、既定ブラウザへ渡します。</p>
<h3>初回ログイン</h3>
<ol>
<li>povo 2.0 で Data Oasis のバナーをタップ</li>
<li>「ブラウザで開く」か共有で <b>Oasis Lite</b> を選ぶ<br />（または URL を上部に貼って <b>開く</b>）</li>
<li><b>データ取得</b> を押す（SSO URL 付きなら自動で始まることもあります）</li>
<li>認証・位置・データ取得がすべて緑なら成功</li>
</ol>
<p class="muted">SSO の token は使い切りが多いです。認証が赤なら、povo からバナーを開き直してください。</p>
<h3>2回目以降</h3>
<ol>
<li>Oasis Lite を起動する（URL は空でよい）</li>
<li><b>データ取得</b> を押す</li>
</ol>
<p class="muted">認証失敗・データ消去・長く放置したあとは、初回と同じく povo から開き直してください。トークンの目安は約1時間です。</p>
<h3>チャージできる条件</h3>
<ul>
<li>ローソンや対象の私鉄駅など、スポットの中にいる</li>
<li>位置情報が許可されている</li>
<li>公式の回数制限内（目安: 1日1回 / 月10回）</li>
</ul>
<p class="muted">場所が違うと Location Limit などで拒否されます。</p>
</div>
</div>`;
  document.documentElement.appendChild(modal);

  const stepsEl = ui.querySelector("#ol-steps");
  const state = {};
  for (const [id, label] of STEPS) {
    state[id] = "idle";
    const li = document.createElement("li");
    li.id = "ol-s-" + id;
    li.className = "idle";
    li.innerHTML = `<span class="dot"></span><span class="lbl">${label}</span><span class="st">未実施</span>`;
    stepsEl.appendChild(li);
  }

  const $ = (id) => ui.querySelector(id);
  const ST_TXT = { idle: "未実施", run: "通信中", ok: "完了", ng: "失敗" };

  function renderLog() {
    $("#ol-log").textContent = logs.join("\n");
  }
  function dbg(msg) {
    const line = `[${t()}] ${msg}`;
    logs.unshift(line);
    if (logs.length > 200) logs.length = 200;
    renderLog();
    try { console.log("[OasisLite]", msg); } catch (_) {}
  }

  function setStep(id, st, detail) {
    state[id] = st;
    const li = $("#ol-s-" + id);
    if (!li) return;
    li.className = st;
    li.querySelector(".st").textContent = detail ? `${ST_TXT[st] || st} · ${detail}` : (ST_TXT[st] || st);
    dbg(`step:${id} → ${st}${detail ? " (" + detail + ")" : ""}`);
  }
  function now(msg) {
    $("#ol-now").textContent = msg || "";
    if (msg) dbg("ui: " + msg);
  }
  function setIdleHint() {
    dbg("ui: povoアプリを開くか、データ取得を押す");
    $("#ol-now").innerHTML =
      '<a href="#" id="ol-open-povo">povoアプリを開く</a>か、<b>データ取得</b> を押す';
    bindOpenPovoLink();
  }
  function setAuthFailHint() {
    dbg("ui: 認証失敗　povoアプリからSSOし直す");
    $("#ol-now").innerHTML =
      '認証に失敗しました。<a href="#" id="ol-open-povo">povoアプリ</a>の Data Oasis から開き直してください';
    bindOpenPovoLink();
  }
  function authErrLabel(err) {
    const m = String(err && err.message || err || "");
    if (/login_required|consent_required|interaction_required/i.test(m)) return "ログインが必要";
    if (/access_denied/i.test(m)) return "アクセス拒否";
    if (/invalid_token|invalid_grant|invalid_request/i.test(m)) return "SSO無効";
    if (/timeout|auth_no_response|iframe/i.test(m)) return "応答なし";
    return m.slice(0, 40);
  }
  function bindOpenPovoLink() {
    const a = $("#ol-open-povo");
    if (a) {
      a.onclick = (e) => {
        e.preventDefault();
        openPovoApp();
      };
    }
  }
  function openPovoApp() {
    try {
      if (window.OasisNative && typeof OasisNative.openPovoApp === "function") {
        dbg("open povo via native");
        OasisNative.openPovoApp();
        return;
      }
    } catch (_) {}
    dbg("open povo via intent url");
    location.href = "intent://#Intent;package=com.kddi.kdla.jp;scheme=https;end";
  }

  $("#ol-log-clear").onclick = () => { logs.length = 0; renderLog(); };
  $("#ol-log-copy").onclick = async () => {
    const text = logs.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      now("ログをコピーした");
    } catch (_) {
      now("コピー失敗（手動選択可）");
    }
  };

  function loadSpoofFields() {
    $("#ol-spoof-on").checked = localStorage.getItem("ol_spoof_on") === "1";
    const lat = localStorage.getItem("ol_spoof_lat") || "";
    const lng = localStorage.getItem("ol_spoof_lng") || "";
    if (lat) $("#ol-spoof-lat").value = lat;
    if (lng) $("#ol-spoof-lng").value = lng;
    const spot = localStorage.getItem("ol_spoof_spot") || "";
    $("#ol-spoof-spot").textContent = spot;
  }
  function saveSpoofFields() {
    localStorage.setItem("ol_spoof_on", $("#ol-spoof-on").checked ? "1" : "0");
    localStorage.setItem("ol_spoof_lat", $("#ol-spoof-lat").value.trim());
    localStorage.setItem("ol_spoof_lng", $("#ol-spoof-lng").value.trim());
    localStorage.setItem("ol_spoof_spot", $("#ol-spoof-spot").textContent || "");
    updateGeoLabel();
  }
  function updateGeoLabel() {
    const lbl = $("#ol-s-geo") && $("#ol-s-geo").querySelector(".lbl");
    if (!lbl) return;
    lbl.textContent = ($("#ol-spoof-on").checked && spoofUnlocked) ? "位置情報（偽装）" : "位置情報";
  }
  function showSpoofPanel(show) {
    spoofUnlocked = !!show;
    localStorage.setItem("ol_spoof_ui", show ? "1" : "0");
    $("#ol-spoof").classList.toggle("on", !!show);
    updateGeoLabel();
  }
  function toggleSpoofPanel() {
    showSpoofPanel(!spoofUnlocked);
    now(spoofUnlocked ? "位置情報偽装を表示" : "位置情報偽装を隠した");
    dbg("spoof UI " + (spoofUnlocked ? "shown" : "hidden"));
  }
  function openHelp() { modal.classList.add("open"); }
  function closeHelp() { modal.classList.remove("open"); }
  function getSsoRaw() {
    let bar = "";
    try {
      if (window.OasisNative && typeof OasisNative.getSsoUrl === "function") {
        bar = String(OasisNative.getSsoUrl() || "").trim();
      }
    } catch (_) {}
    const href = location.href;
    if (bar && /[?&]token=/.test(bar)) return bar;
    if (/[?&]token=/.test(href)) return href;
    return bar || href;
  }
  function readSpoofLoc() {
    const lat = Number($("#ol-spoof-lat").value);
    const lng = Number($("#ol-spoof-lng").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("緯度・経度を数値で入力");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error("緯度経度の範囲外");
    }
    return [lng, lat];
  }

  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  // Data Oasis: 全国ローソン + 関東の対象私鉄等（JRは対象外）
  const LAWSON_RE = /ローソン|lawson|ナチュラルローソン|natural\s*lawson|ストア\s*100|store\s*100/i;
  const STATION_OK_RE = /東京メトロ|東京地下鉄|tokyo\s*metro|京成|keisei|相鉄|相模鉄道|sotetsu|小田急|odakyu|京王|keio|東急|tokyu|ゆりかもめ|yurikamome|みなとみらい|横浜高速|伊豆箱根|関東鉄道|秩父|埼玉高速|つくばエクスプレス|\btx\b|首都圏新都市|西武|seibu|多摩都市モノレール|千葉都市モノレール|都営|東京都交通局|toei|東葉|北総|横浜市交通局|横浜市営/i;
  const STATION_NG_RE = /\bjr\b|東日本旅客|西日本旅客|東海旅客|九州旅客|北海道旅客|四国旅客|ｊｒ/i;

  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toR = (d) => d * Math.PI / 180;
    const dLat = toR(lat2 - lat1);
    const dLng = toR(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function elemCoords(el) {
    if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) return { lat: el.lat, lng: el.lon };
    if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) {
      return { lat: el.center.lat, lng: el.center.lon };
    }
    return null;
  }
  function classifySpot(tags) {
    if (!tags) return null;
    const blob = [tags.name, tags.brand, tags["brand:en"], tags.operator, tags["operator:en"], tags.network]
      .filter(Boolean).join(" | ");
    if (LAWSON_RE.test(blob) || LAWSON_RE.test(tags.name || "") || LAWSON_RE.test(tags.brand || "")) {
      return { kind: "ローソン", name: tags.name || tags.brand || "ローソン" };
    }
    const isStation = tags.railway === "station" || tags.railway === "halt" ||
      tags.public_transport === "station" || tags.station === "subway";
    if (!isStation) return null;
    if (STATION_NG_RE.test(blob)) return null;
    if (!STATION_OK_RE.test(blob)) return null;
    return { kind: "対象駅", name: tags.name || "駅" };
  }
  function getDevicePosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("位置情報非対応"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        (e) => reject(new Error(e.message || "位置取得失敗")),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
      );
    });
  }
  async function overpassNearby(lat, lng, radiusM) {
    const q = `[out:json][timeout:30];
(
  nwr["brand"~"Lawson|ローソン",i](around:${radiusM},${lat},${lng});
  nwr["name"~"ローソン|LAWSON|Lawson"]["shop"="convenience"](around:${radiusM},${lat},${lng});
  nwr["railway"="station"](around:${radiusM},${lat},${lng});
  nwr["railway"="halt"](around:${radiusM},${lat},${lng});
  nwr["public_transport"="station"](around:${radiusM},${lat},${lng});
);
out center tags;`;
    let lastErr;
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        dbg(`overpass ${ep} r=${radiusM}`);
        const res = await fetch(ep, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: "data=" + encodeURIComponent(q),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        return j.elements || [];
      } catch (e) {
        lastErr = e;
        dbg("overpass fail: " + (e && e.message));
      }
    }
    throw lastErr || new Error("Overpass 失敗");
  }
  function pickNearestSpot(here, elements) {
    let best = null;
    for (const el of elements) {
      const c = elemCoords(el);
      if (!c) continue;
      const info = classifySpot(el.tags || {});
      if (!info) continue;
      const dist = haversineM(here.lat, here.lng, c.lat, c.lng);
      if (!best || dist < best.dist) {
        best = { ...info, lat: c.lat, lng: c.lng, dist };
      }
    }
    return best;
  }
  async function setNearestOasisSpot() {
    const btn = $("#ol-spoof-nearest");
    btn.disabled = true;
    $("#ol-spoof-spot").textContent = "検索中…";
    now("最寄りスポットを検索中…");
    try {
      const here = await getDevicePosition();
      dbg(`nearest from lat=${here.lat.toFixed(5)} lng=${here.lng.toFixed(5)} acc=${here.acc}`);
      let best = null;
      for (const r of [1500, 4000, 10000]) {
        const els = await overpassNearby(here.lat, here.lng, r);
        best = pickNearestSpot(here, els);
        dbg(`nearest scan r=${r} candidates≈${els.length} hit=${best ? best.name : "none"}`);
        if (best) break;
      }
      if (!best) throw new Error("付近に対象スポットなし");
      $("#ol-spoof-lat").value = String(best.lat);
      $("#ol-spoof-lng").value = String(best.lng);
      $("#ol-spoof-on").checked = true;
      const distLabel = best.dist < 1000
        ? `${Math.round(best.dist)}m`
        : `${(best.dist / 1000).toFixed(1)}km`;
      const label = `${best.kind}: ${best.name}（約${distLabel}）`;
      $("#ol-spoof-spot").textContent = label;
      saveSpoofFields();
      now("最寄りスポットを設定した");
      dbg(`nearest set ${label} lat=${best.lat} lng=${best.lng}`);
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 80);
      $("#ol-spoof-spot").textContent = "失敗: " + msg;
      now("最寄りスポット検索に失敗");
      dbg("nearest error: " + msg);
    } finally {
      btn.disabled = false;
    }
  }

  loadSpoofFields();
  if (spoofUnlocked) showSpoofPanel(true);
  else updateGeoLabel();
  $("#ol-spoof-on").onchange = saveSpoofFields;
  $("#ol-spoof-lat").onchange = saveSpoofFields;
  $("#ol-spoof-lng").onchange = saveSpoofFields;
  $("#ol-spoof-lat").onblur = saveSpoofFields;
  $("#ol-spoof-lng").onblur = saveSpoofFields;
  $("#ol-spoof-nearest").onclick = () => setNearestOasisSpot();
  $("#ol-help-open").onclick = () => openHelp();
  modal.querySelector("#ol-help-close").onclick = () => closeHelp();
  modal.querySelector("#ol-help-bg").onclick = () => closeHelp();

  $("#ol-s-geo").addEventListener("click", (ev) => {
    if (ev.target.closest && ev.target.closest("#ol-spoof")) return;
    const nowMs = Date.now();
    geoTapTimes = geoTapTimes.filter((x) => nowMs - x < SPOOF_UNLOCK_MS);
    geoTapTimes.push(nowMs);
    if (geoTapTimes.length >= SPOOF_UNLOCK_TAPS) {
      geoTapTimes = [];
      toggleSpoofPanel();
    }
  });

  const u = new URL(location.href);
  dbg(`boot origin=${location.origin} href=${location.href.slice(0, 120)} tokenCached=${!!token} spoof=${$("#ol-spoof-on").checked} native=${!!(window.OasisNative && OasisNative.postJson)}`);

  async function pkce() {
    const verifier = rnd(32);
    const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return { verifier, challenge: b64u(dig) };
  }

  function webMsgAuth(extra) {
    return new Promise(async (resolve, reject) => {
      const { verifier, challenge } = await pkce();
      const authState = rnd(16);
      const params = {
        client_id: CID, scope: SCOPE, redirect_uri: REDIR, audience: AUD,
        prompt: "none", response_type: "code", response_mode: "web_message",
        state: authState, nonce: rnd(16), code_challenge: challenge,
        code_challenge_method: "S256", auth0Client: A0C, ...extra,
      };
      const hasSso = !!extra.session_transfer_token;
      // 失敗時は Auth0 がすぐ返す想定。iframe 読込後の猶予で早期打ち切り、上限も短め。
      const softMs = 1200;
      const hardMs = hasSso ? 10000 : 7000;
      dbg(`auth0 authorize sso=${hasSso} soft=${softMs} hard=${hardMs}`);
      let settled = false;
      let softTimer = 0;
      let hardTimer = 0;
      const iframe = document.createElement("iframe");
      const cleanup = () => {
        window.removeEventListener("message", onMsg);
        clearTimeout(softTimer);
        clearTimeout(hardTimer);
        try { iframe.remove(); } catch (_) {}
      };
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(arg);
      };
      const onMsg = (ev) => {
        if (settled) return;
        if (ev.origin && ev.origin !== AUTH && ev.origin !== REDIR) return;
        const d = ev.data;
        const r = d && (d.response || d);
        if (!r || (d.type && d.type !== "authorization_response")) return;
        if (r.state && r.state !== authState) return;
        dbg(`auth0 web_message ok=${!r.error} keys=${Object.keys(r).join(",")}`);
        if (r.error) return finish(reject, new Error(r.error_description || r.error));
        if (!r.code) return finish(reject, new Error("no code"));
        finish(resolve, { code: r.code, verifier, st: extra.session_transfer_token });
      };
      window.addEventListener("message", onMsg);
      iframe.style.cssText = "display:none;width:0;height:0;border:0;position:absolute";
      iframe.onload = () => {
        // リダイレクト連鎖のたびに猶予を延長。最終ページ読込後も postMessage が無ければ失敗。
        clearTimeout(softTimer);
        softTimer = setTimeout(() => {
          finish(reject, new Error("auth_no_response"));
        }, softMs);
      };
      iframe.onerror = () => finish(reject, new Error("auth iframe error"));
      iframe.src = `${AUTH}/authorize?${qs(params)}`;
      document.body.appendChild(iframe);
      hardTimer = setTimeout(() => finish(reject, new Error("timeout")), hardMs);
    });
  }

  async function exchange({ code, verifier, st }) {
    const body = {
      client_id: CID, redirect_uri: REDIR, code_verifier: verifier,
      code, grant_type: "authorization_code",
    };
    if (st) body.session_transfer_token = st;
    dbg("POST oauth/token …");
    const res = await fetch(`${AUTH}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: qs(body),
    });
    const j = await res.json().catch(() => ({}));
    dbg(`POST oauth/token → ${res.status} has_access_token=${!!j.access_token}`);
    if (!res.ok) throw new Error(j.error_description || j.error || String(res.status));
    return j.access_token;
  }

  async function doAuth() {
    setStep("auth", "run");
    now("認証中…");
    try {
      let st = "";
      const raw = getSsoRaw().trim();
      if (raw) {
        try {
          const parsed = new URL(raw);
          st = parsed.searchParams.get("token") || "";
          // sso=true なのに token が空なら Auth0 を待たず即失敗
          if (parsed.searchParams.get("sso") === "true" && !st) {
            throw new Error("invalid_token");
          }
        } catch (e) {
          if (e && e.message === "invalid_token") throw e;
          st = /^[A-Za-z0-9._~-]+$/.test(raw) ? raw : "";
        }
      }
      dbg(`doAuth mode=${st ? "sso" : "silent"} urlLen=${raw.length}`);
      const pack = await webMsgAuth(st ? { session_transfer_token: st } : {});
      token = await exchange(pack);
      sessionStorage.setItem("ol_at", token);
      setStep("auth", "ok");
      now("認証完了");
    } catch (e) {
      dbg("doAuth error: " + (e && e.message));
      setStep("auth", "ng", authErrLabel(e));
      setAuthFailHint();
      throw e;
    }
  }

  function geo() {
    return new Promise((resolve, reject) => {
      setStep("geo", "run");
      if (spoofUnlocked && $("#ol-spoof-on").checked) {
        try {
          saveSpoofFields();
          const loc = readSpoofLoc();
          now("偽装位置を使用中…");
          dbg(`geo spoof lng=${loc[0]} lat=${loc[1]}`);
          setStep("geo", "ok", "偽装");
          resolve(loc);
        } catch (e) {
          dbg("geo spoof error: " + (e && e.message));
          setStep("geo", "ng", String(e.message || e).slice(0, 40));
          reject(e);
        }
        return;
      }
      if (!navigator.geolocation) return reject(new Error("非対応"));
      now("位置情報を取得中…");
      dbg("geolocation getCurrentPosition…");
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const loc = [p.coords.longitude, p.coords.latitude];
          dbg(`geo ok lng=${loc[0].toFixed(5)} lat=${loc[1].toFixed(5)} acc=${p.coords.accuracy}`);
          setStep("geo", "ok");
          resolve(loc);
        },
        (e) => {
          dbg("geo error: " + e.message + " code=" + e.code);
          setStep("geo", "ng", e.message);
          reject(e);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }

  window.__oasisNativeCbs = Object.create(null);
  window.__oasisNativeResult = (id, err, status, text) => {
    const cb = window.__oasisNativeCbs[id];
    if (!cb) return;
    delete window.__oasisNativeCbs[id];
    cb(err, status, text);
  };

  function postClaim(url, bearer, location) {
    const body = JSON.stringify({ location });
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization: "Bearer " + bearer,
    };
    const native = window.OasisNative;
    if (native && typeof native.postJson === "function") {
      return new Promise((resolve, reject) => {
        const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        window.__oasisNativeCbs[id] = (err, status, text) => {
          if (err) reject(new Error(err));
          else resolve({ ok: status >= 200 && status < 300, status, text: text || "" });
        };
        dbg("POST claim via native bridge (CORS bypass)");
        native.postJson(url, JSON.stringify(headers), body, id);
      });
    }
    dbg("POST claim via fetch (may fail CORS on shop origin)");
    return fetch(url, { method: "POST", headers, body }).then(async (res) => {
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    });
  }

  async function doClaim() {
    if (busy) return;
    busy = true;
    $("#ol-go").disabled = true;
    setStep("claim", "idle");
    setStep("geo", "idle");
    dbg("doClaim start");
    try {
      if (!token) await doAuth();
      else {
        setStep("auth", "ok");
        dbg("reuse cached token");
      }
      const location = await geo();
      setStep("claim", "run");
      now("データ取得を送信中…");
      const url = `${API}/rewards/v5/jp/ja/webfront/actions/claim/system_wide_promotion/${PROMO}`;
      dbg(`POST claim ${url}`);
      const res = await postClaim(url, token, location);
      const text = res.text;
      let j; try { j = JSON.parse(text); } catch { j = {}; }
      dbg(`POST claim → ${res.status} body=${text.slice(0, 180)}`);
      if (!res.ok) {
        const msg = (j.error && (j.error.message_code || j.error.message)) || String(res.status);
        setStep("claim", "ng", String(msg).slice(0, 40));
        now("データ取得失敗");
        throw new Error(msg);
      }
      setStep("claim", "ok");
      now("完了");
    } catch (e) {
      dbg("doClaim catch: " + (e && e.message));
      if (state.claim === "run" || state.claim === "idle") {
        if (state.auth === "ng") setAuthFailHint();
        else if (state.geo === "ng") now("位置情報の取得に失敗");
        else if (state.claim !== "ng") {
          setStep("claim", "ng", String(e.message || e).slice(0, 40));
          now("失敗");
        }
      }
    } finally {
      busy = false;
      $("#ol-go").disabled = false;
    }
  }

  $("#ol-go").onclick = () => doClaim();

  if (u.searchParams.get("sso") === "true" && u.searchParams.get("token")) {
    now("SSO URL を検出");
    doClaim();
  } else if (token) {
    setStep("auth", "ok");
    setIdleHint();
  } else {
    setIdleHint();
  }
})();
