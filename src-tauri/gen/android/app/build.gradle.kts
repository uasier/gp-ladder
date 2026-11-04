import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

fun releaseSigningProperties(): Properties {
    val props = Properties()
    val propFile = file("${System.getProperty("user.home")}/.android/gp-ladder-signing.properties")
    if (propFile.isFile) {
        propFile.inputStream().use { props.load(it) }
    }
    return props
}

fun releaseSigningValue(envName: String, propName: String, props: Properties): String? {
    val fromEnv = System.getenv(envName)?.takeIf { it.isNotBlank() }
    if (fromEnv != null) return fromEnv
    return props.getProperty(propName)?.takeIf { it.isNotBlank() }
}

android {
    compileSdk = 36
    namespace = "com.gp.ladder.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.gp.ladder.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    val releaseSigningProps = releaseSigningProperties()
    signingConfigs {
        // 发布包必须使用同一张证书。每次构建都生成 debug keystore 时，Android 会拒绝覆盖安装。
        create("release") {
            val storePath = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }
                ?: "${System.getProperty("user.home")}/.android/gp-ladder-release.keystore"
            val store = file(storePath)
            if (store.isFile) {
                storeFile = store
                storePassword = releaseSigningValue("ANDROID_KEYSTORE_PASSWORD", "storePassword", releaseSigningProps)
                keyAlias = releaseSigningValue("ANDROID_KEY_ALIAS", "keyAlias", releaseSigningProps) ?: "gp-ladder"
                keyPassword = releaseSigningValue("ANDROID_KEY_PASSWORD", "keyPassword", releaseSigningProps)
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile?.isFile == true &&
                !releaseSigning.storePassword.isNullOrBlank() &&
                !releaseSigning.keyPassword.isNullOrBlank()) {
                signingConfig = releaseSigning
            }
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")