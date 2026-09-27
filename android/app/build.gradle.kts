import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val backendRaw = listOf(
    localProps.getProperty("backend.url"),
    (findProperty("sana.backend.url") as String?),
    System.getenv("SANA_BACKEND_URL"),
).firstOrNull { !it.isNullOrBlank() }.orEmpty().trim().trimEnd('/')

fun rejectSecretUrl(value: String) {
    if (value.contains("AIza") || Regex("sk-[A-Za-z0-9_\\-]{8,}").containsMatchIn(value)) {
        throw GradleException("backend.url looks like an API key. Set GEMINI_API_KEY on the server, not in the app.")
    }
    if (Regex("[?&](api[_-]?key|token|secret|password)=", RegexOption.IGNORE_CASE).containsMatchIn(value)) {
        throw GradleException("Do not put an API key in backend.url.")
    }
}

fun escapeBuildConfig(value: String) = value.replace("\\", "\\\\").replace("\"", "\\\"")

val productionBackend = "https://sana-ai-0ejd.onrender.com"
val localHosts = listOf("localhost", "127.0.0.1", "10.0.2.2", "::1")

fun unusableForRelease(value: String): Boolean {
    if (!value.startsWith("https://")) return true
    val host = runCatching { URI(value).host?.lowercase().orEmpty() }.getOrDefault("")
    if (host.isBlank() || localHosts.contains(host)) return true
    if (host == "trycloudflare.com" || host.endsWith(".trycloudflare.com")) return true
    return false
}

rejectSecretUrl(backendRaw)
if (backendRaw.isNotEmpty() && unusableForRelease(backendRaw)) {
    logger.warn("Sana: ignoring a local or temporary backend.url for release. Using the Render server.")
}
val releaseBackend = if (unusableForRelease(backendRaw)) productionBackend else backendRaw

android {
    namespace = "com.sanaai.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sanaai.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    val keystoreProps = Properties()
    val keystorePropsFile = rootProject.file("keystore.properties")
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { keystoreProps.load(it) }
    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "BACKEND_URL", "\"${escapeBuildConfig(backendRaw)}\"")
        }
        release {
            buildConfigField("String", "BACKEND_URL", "\"${escapeBuildConfig(releaseBackend)}\"")
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
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
        buildConfig = true
    }
    packaging {
        resources.excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
