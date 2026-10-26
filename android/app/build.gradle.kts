plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "jp.local.oasislite"
    compileSdk = 35

    defaultConfig {
        applicationId = "jp.local.oasislite"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            // 個人インストール用（未署名だと入れられない）。ストア用キーは別途
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = false
        viewBinding = false
        aidl = false
        renderScript = false
        resValues = false
        shaders = false
    }
    packaging {
        resources {
            excludes += setOf(
                "META-INF/**",
                "kotlin/**",
                "DebugProbesKt.bin",
                "**.kotlin_builtins",
                "**.kotlin_module",
                "**.kotlin_metadata"
            )
        }
    }
}

// 依存ゼロ（Android SDK + Kotlin stdlib のみ。Material / AppCompat は使わない）
dependencies {
}

// リリース成果物を「OasisLite.apk」に揃える
tasks.register("nameReleaseApk") {
    dependsOn("assembleRelease")
    doLast {
        val dir = layout.buildDirectory.dir("outputs/apk/release").get().asFile
        val src = dir.listFiles()
            ?.filter { it.isFile && it.extension.equals("apk", true) && it.name != "OasisLite.apk" }
            ?.maxByOrNull { it.lastModified() }
            ?: error("release APK not found in $dir")
        val dest = dir.resolve("OasisLite.apk")
        src.copyTo(dest, overwrite = true)
        logger.lifecycle("Release APK: ${dest.absolutePath} (${dest.length()} bytes)")
    }
}

afterEvaluate {
    tasks.named("assembleRelease").configure {
        finalizedBy("nameReleaseApk")
    }
}
