package jp.local.oasislite

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Toast
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.regex.Pattern

/**
 * 公式 shop SPA は読まず、Origin だけ shop.povo.jp の最小 HTML + JS。
 * AndroidX / Material なしの素の Activity。
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var urlInput: EditText
    private lateinit var progress: ProgressBar
    private var injectJs: String = ""
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private val httpExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var currentSsoUrl: String = ""

    inner class OasisNativeBridge {
        @JavascriptInterface
        fun hasBridge(): Boolean = true

        @JavascriptInterface
        fun getSsoUrl(): String = currentSsoUrl

        @JavascriptInterface
        fun openPovoApp() {
            runOnUiThread {
                val pkg = "com.kddi.kdla.jp"
                val launch = packageManager.getLaunchIntentForPackage(pkg)
                if (launch != null) {
                    startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    return@runOnUiThread
                }
                try {
                    startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("market://details?id=$pkg")
                        )
                    )
                } catch (_: Exception) {
                    startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://play.google.com/store/apps/details?id=$pkg")
                        )
                    )
                }
            }
        }

        @JavascriptInterface
        fun postJson(url: String, headersJson: String, body: String, callbackId: String) {
            httpExecutor.execute {
                var status = 0
                var text = ""
                var err: String? = null
                try {
                    val u = URL(url)
                    require(u.protocol == "https") { "https only" }
                    require(u.host == "app.povo.jp") { "host not allowed" }
                    val conn = (u.openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 20_000
                        readTimeout = 20_000
                        doOutput = true
                        setRequestProperty("Origin", "https://kddi-openapi-web.povo.jp")
                        setRequestProperty("Referer", "https://kddi-openapi-web.povo.jp/")
                        val headers = JSONObject(headersJson)
                        val keys = headers.keys()
                        while (keys.hasNext()) {
                            val key = keys.next()
                            setRequestProperty(key, headers.getString(key))
                        }
                    }
                    conn.outputStream.use { os ->
                        os.write(body.toByteArray(Charsets.UTF_8))
                    }
                    status = conn.responseCode
                    val stream = if (status >= 400) {
                        conn.errorStream ?: conn.inputStream
                    } else {
                        conn.inputStream
                    }
                    text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    conn.disconnect()
                } catch (e: Exception) {
                    err = e.message ?: e.toString()
                }
                val jsId = JSONObject.quote(callbackId)
                val jsErr = if (err == null) "null" else JSONObject.quote(err)
                val jsText = JSONObject.quote(text)
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__oasisNativeResult&&window.__oasisNativeResult($jsId,$jsErr,$status,$jsText)",
                        null
                    )
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)
        urlInput = findViewById(R.id.urlInput)
        progress = findViewById(R.id.progress)
        val openButton = findViewById<Button>(R.id.openButton)
        val defaultOpenButton = findViewById<Button>(R.id.defaultOpenButton)

        injectJs = assets.open("oasis-lite.inject.js").bufferedReader().use { it.readText() }

        CookieManager.getInstance().setAcceptCookie(true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_NO_CACHE
            blockNetworkImage = true
            userAgentString = userAgentString.replace("; wv", "")
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(OasisNativeBridge(), "OasisNative")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (hasLocationPermission()) {
                    callback?.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    requestPermissions(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        ),
                        REQ_LOCATION
                    )
                }
            }

            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.visibility =
                    if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean = false

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                if (request == null) return null
                val host = request.url.host ?: return null
                if (isShopHost(host) && isHtmlRequest(request)) {
                    return if (request.isForMainFrame) {
                        htmlResponse(LITE_SHELL_HTML)
                    } else {
                        htmlResponse(AUTH_CALLBACK_HTML)
                    }
                }
                if (host in BLOCKED_HOSTS || BLOCKED_SUFFIXES.any { host.endsWith(it) }) {
                    return emptyResponse()
                }
                return null
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                if (url != null && isShopHost(Uri.parse(url).host)) {
                    urlInput.setText(url)
                    currentSsoUrl = url
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                maybeInject(url)
            }
        }

        openButton.setOnClickListener { openFromInput() }
        defaultOpenButton.setOnClickListener { openDefaultLinkSettings() }
        urlInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                currentSsoUrl = s?.toString().orEmpty()
            }
            override fun afterTextChanged(s: Editable?) {}
        })
        urlInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) {
                openFromInput()
                true
            } else false
        }

        if (!handleIncomingIntent(intent)) {
            openLite(null)
        }
        maybePromptDefaultOpen()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent, fromNewIntent = true)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (requestCode != REQ_LOCATION) return
        val ok = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        val origin = pendingGeoOrigin
        val cb = pendingGeoCallback
        pendingGeoOrigin = null
        pendingGeoCallback = null
        if (origin != null && cb != null) {
            cb.invoke(origin, ok, false)
        }
        if (!ok) {
            Toast.makeText(this, R.string.need_location, Toast.LENGTH_SHORT).show()
        }
    }

    private fun hasLocationPermission(): Boolean {
        val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    private fun openFromInput() {
        val raw = urlInput.text?.toString().orEmpty().trim()
        if (raw.isEmpty()) {
            openLite(null)
            return
        }
        val url = extractUrl(raw) ?: raw
        val target = when {
            url.startsWith("http://") || url.startsWith("https://") -> url
            else -> "https://$url"
        }
        if (!isShopHost(Uri.parse(target).host)) {
            Toast.makeText(this, R.string.only_shop_url, Toast.LENGTH_SHORT).show()
            return
        }
        if (!isOasisLink(target) && target.trimEnd('/') != DEFAULT_BASE.trimEnd('/')) {
            openInDefaultBrowser(target)
            Toast.makeText(this, R.string.opened_in_browser, Toast.LENGTH_SHORT).show()
            return
        }
        openLite(target)
    }

    private fun openInDefaultBrowser(url: String) {
        val view = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val candidates = packageManager.queryIntentActivities(view, PackageManager.MATCH_DEFAULT_ONLY)
            .filter { it.activityInfo.packageName != packageName }
        if (candidates.isEmpty()) {
            try {
                startActivity(Intent.createChooser(view, null))
            } catch (_: Exception) {
                Toast.makeText(this, R.string.default_open_unsupported, Toast.LENGTH_SHORT).show()
            }
            return
        }
        val pick = candidates.first()
        view.setClassName(pick.activityInfo.packageName, pick.activityInfo.name)
        try {
            startActivity(view)
        } catch (_: Exception) {
            Toast.makeText(this, R.string.default_open_unsupported, Toast.LENGTH_SHORT).show()
        }
    }

    private fun openLite(ssoUrl: String?) {
        val target = when {
            !ssoUrl.isNullOrBlank() && isShopHost(Uri.parse(ssoUrl).host) -> ssoUrl.trim()
            else -> DEFAULT_BASE
        }
        urlInput.setText(target)
        currentSsoUrl = target
        webView.loadUrl(target)
    }

    private fun maybePromptDefaultOpen() {
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        if (prefs.getBoolean(KEY_ASKED_DEFAULT, false)) return
        prefs.edit().putBoolean(KEY_ASKED_DEFAULT, true).apply()
        AlertDialog.Builder(this)
            .setTitle(R.string.default_open_dialog_title)
            .setMessage(R.string.default_open_dialog_message)
            .setPositiveButton(R.string.default_open_dialog_ok) { _, _ -> openDefaultLinkSettings() }
            .setNegativeButton(R.string.default_open_dialog_later, null)
            .show()
    }

    private fun openDefaultLinkSettings() {
        val intents = mutableListOf<Intent>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            intents.add(
                Intent(
                    Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS,
                    Uri.parse("package:$packageName")
                )
            )
        }
        intents.add(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
        )
        for (i in intents) {
            try {
                startActivity(i)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Toast.makeText(this, R.string.default_open_hint, Toast.LENGTH_LONG).show()
                }
                return
            } catch (_: Exception) {
            }
        }
        Toast.makeText(this, R.string.default_open_unsupported, Toast.LENGTH_SHORT).show()
    }

    private fun handleIncomingIntent(intent: Intent?, fromNewIntent: Boolean = false): Boolean {
        if (intent == null) return false
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                val url = extractUrl(text)
                if (url != null) {
                    if (!isOasisLink(url)) {
                        openInDefaultBrowser(url)
                        Toast.makeText(this, R.string.opened_in_browser, Toast.LENGTH_SHORT).show()
                        if (!fromNewIntent) finish()
                        return true
                    }
                    openLite(url)
                    return true
                }
            }
            Intent.ACTION_VIEW -> {
                val url = intent.dataString
                if (url.isNullOrBlank() || !isShopHost(Uri.parse(url).host)) return false
                if (!isOasisLink(url)) {
                    openInDefaultBrowser(url)
                    Toast.makeText(this, R.string.opened_in_browser, Toast.LENGTH_SHORT).show()
                    if (!fromNewIntent) finish()
                    return true
                }
                openLite(url)
                return true
            }
        }
        return false
    }

    private fun maybeInject(url: String?) {
        if (url.isNullOrBlank()) return
        val host = runCatching { Uri.parse(url).host }.getOrNull()
        if (!isShopHost(host) && url != "about:blank") return
        webView.evaluateJavascript(injectJs, null)
    }

    companion object {
        private const val REQ_LOCATION = 1001
        private const val PREFS = "oasis_lite"
        private const val KEY_ASKED_DEFAULT = "asked_default_open"
        private const val DEFAULT_BASE = "https://shop.povo.jp/"

        private const val LITE_SHELL_HTML =
            """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Oasis Lite</title>
<style>html,body{margin:0;background:#111;min-height:100%}</style>
</head><body></body></html>"""

        private const val AUTH_CALLBACK_HTML =
            """<!DOCTYPE html><html><body><script>
(function(){
  var q=new URLSearchParams(location.search);
  var h=(location.hash||"").replace(/^#/,"");
  var p=h?new URLSearchParams(h):q;
  var r={}; p.forEach(function(v,k){r[k]=v;});
  var msg={type:"authorization_response",response:r};
  try{(window.opener||window.parent).postMessage(msg,"https://shop.povo.jp");}catch(e){}
})();
</script></body></html>"""

        private val BLOCKED_HOSTS = setOf(
            "maps.googleapis.com",
            "api.ipify.org",
            "js.stripe.com",
            "m.stripe.com",
            "m.stripe.network",
            "b.karte.io",
            "cdn-edge.karte.io",
            "static.karte.io",
            "cdn-blocks.karte.io",
            "timestamp-blocks.karte.io",
            "www.google-analytics.com",
            "analytics.google.com",
            "www.googletagmanager.com",
            "www.google.com",
            "www.gstatic.com",
            "fonts.gstatic.com",
            "www.clarity.ms",
            "a.clarity.ms",
            "scripts.clarity.ms",
            "bam.nr-data.net",
            "js-agent.newrelic.com",
            "analytics.tiktok.com",
            "analytics.twitter.com",
            "static.ads-twitter.com",
            "connect.facebook.net",
            "www.facebook.com",
            "googleads.g.doubleclick.net",
            "j.wovn.io",
            "data.wovn.io",
            "kddi-openapi-web.povo.jp"
        )

        private val BLOCKED_SUFFIXES = listOf(
            ".doubleclick.net",
            ".google-analytics.com",
            ".googletagmanager.com",
            ".facebook.net",
            ".karte.io",
            ".stripe.com",
            ".nr-data.net",
            ".wovn.io",
            ".clarity.ms",
            ".tiktok.com",
            ".demdex.net",
            ".omtrdc.net",
            ".newrelic.com"
        )

        private val URL_PATTERN: Pattern = Pattern.compile(
            "https?://(?:www\\.)?shop\\.povo\\.jp\\S+",
            Pattern.CASE_INSENSITIVE
        )

        private fun isShopHost(host: String?): Boolean =
            host == "shop.povo.jp" || host == "www.shop.povo.jp"

        /** Data Oasis SSO（/dashboard または token+sso=true）。それ以外はブラウザへ渡す。 */
        private fun isOasisLink(url: String): Boolean {
            val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
            if (!isShopHost(uri.host)) return false
            val path = uri.path.orEmpty()
            if (path.startsWith("/dashboard")) return true
            val token = uri.getQueryParameter("token")
            val sso = uri.getQueryParameter("sso")
            return !token.isNullOrBlank() && sso.equals("true", ignoreCase = true)
        }

        private fun isHtmlRequest(request: WebResourceRequest): Boolean {
            if (request.isForMainFrame) return true
            val accept = request.requestHeaders["Accept"] ?: request.requestHeaders["accept"] ?: ""
            if (accept.contains("text/html")) return true
            val path = request.url.path ?: return false
            return path == "/" || path.endsWith(".html") || !path.contains('.')
        }

        private fun htmlResponse(html: String): WebResourceResponse =
            WebResourceResponse(
                "text/html",
                "utf-8",
                ByteArrayInputStream(html.toByteArray(Charsets.UTF_8))
            )

        private fun emptyResponse(): WebResourceResponse =
            WebResourceResponse(
                "text/plain",
                "utf-8",
                204,
                "No Content",
                mapOf("Access-Control-Allow-Origin" to "*"),
                ByteArrayInputStream(ByteArray(0))
            )

        fun extractUrl(text: String): String? {
            val m = URL_PATTERN.matcher(text)
            if (m.find()) {
                return m.group().trimEnd(')', ']', '"', '\'', '>', ',', '.')
            }
            val t = text.trim()
            return if (t.startsWith("https://shop.povo.jp") || t.startsWith("http://shop.povo.jp")) t
            else null
        }
    }
}
