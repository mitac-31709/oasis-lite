# Oasis Lite — keep only what WebView / JS bridge needs

-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep class jp.local.oasislite.MainActivity { *; }
-keep class jp.local.oasislite.MainActivity$OasisNativeBridge { *; }

-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
