package expo.modules.moekoenative

import android.Manifest
import android.app.WallpaperManager
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.audiofx.Equalizer
import android.media.audiofx.Visualizer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.palette.graphics.Palette
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 安卓端系统能力桥接：
 * 1. 悬浮窗权限（SYSTEM_ALERT_WINDOW）检查与申请跳转；
 * 2. 桌面歌词悬浮窗（show/update/hide）；
 * 3. 前台播放服务（PlaybackService）承载 MediaSession + MediaStyle 通知，
 *    锁屏/通知栏「上一曲/下一曲」通过广播回传 JS；
 * 4. Android 12+ 系统壁纸动态取色（Monet）；
 * 5. 音频 Equalizer 均衡器（4 种预设，presetIndex）。
 */
class ExpoMoekoeNativeModule : Module() {
  private var emit: ((String, Map<String, Any?>?) -> Unit)? = null
  private var equalizer: Equalizer? = null
  private var visualizer: Visualizer? = null
  private var playbackReceiver: BroadcastReceiver? = null

  // 播控事件去重：记录每个 action 最近一次到达时间，
  // 防止部分 OEM（MIUI 等）小组件对同一点击重复派发导致连跳两首/状态回跳。
  private val lastPlaybackEventAt = HashMap<String, Long>()

  companion object {
    /** 播控事件统一走广播单通道，此 sink 已废弃保留占位，禁止再挂双通道。 */
    @Volatile
    @Deprecated("单一广播通道即可，勿再使用")
    var playbackEventSink: ((String) -> Unit)? = null
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoMoekoeNative")

    Events("onNext", "onPrevious", "onPlayPause", "onSeekTo", "onStop", "onSpectrumData")

    OnCreate {
      emit = { name, params -> sendEvent(name, params ?: emptyMap()) }
      registerPlaybackReceiver()
    }

    OnDestroy {
      emit = null
      playbackEventSink = null
      unregisterPlaybackReceiver()
      releaseEqualizer()
      releaseVisualizer()
      LyricOverlayManager.hide()
    }

    // ---------- 原生液态玻璃 View（Liquid-Glass-Android） ----------

    View(LiquidGlassSurfaceView::class) {
      Name("LiquidGlassSurfaceView")
      Prop("cornerRadius") { view: LiquidGlassSurfaceView, value: Float -> view.setCornerRadius(value) }
      Prop("refractionHeight") { view: LiquidGlassSurfaceView, value: Float -> view.setRefractionHeight(value) }
      Prop("bevelWidth") { view: LiquidGlassSurfaceView, value: Float -> view.setBevelWidth(value) }
      Prop("dispersionStrength") { view: LiquidGlassSurfaceView, value: Float -> view.setDispersionStrength(value) }
      Prop("blurAmount") { view: LiquidGlassSurfaceView, value: Float -> view.setBlurAmount(value) }
      Prop("saturation") { view: LiquidGlassSurfaceView, value: Float -> view.setSaturation(value) }
      Prop("aberrationIntensity") { view: LiquidGlassSurfaceView, value: Float -> view.setAberrationIntensity(value) }
      Prop("displacementScale") { view: LiquidGlassSurfaceView, value: Float -> view.setDisplacementScale(value) }
      Prop("elasticity") { view: LiquidGlassSurfaceView, value: Float -> view.setElasticity(value) }
      Prop("enableSensorHighlight") { view: LiquidGlassSurfaceView, value: Boolean -> view.setEnableSensorHighlight(value) }
      Prop("enableAdaptiveTint") { view: LiquidGlassSurfaceView, value: Boolean -> view.setEnableAdaptiveTint(value) }
      Prop("enablePressEffect") { view: LiquidGlassSurfaceView, value: Boolean -> view.setEnablePressEffect(value) }
      Prop("enableChromaticAberration") { view: LiquidGlassSurfaceView, value: Boolean -> view.setEnableChromaticAberration(value) }
      Prop("enableEdgeHighlight") { view: LiquidGlassSurfaceView, value: Boolean -> view.setEnableEdgeHighlight(value) }
      Prop("fallbackColor") { view: LiquidGlassSurfaceView, value: Int -> view.setFallbackColor(value) }
      Prop("surfaceTintColor") { view: LiquidGlassSurfaceView, value: Int -> view.setSurfaceTintColor(value) }
      Prop("surfaceTintAlpha") { view: LiquidGlassSurfaceView, value: Float -> view.setSurfaceTintAlpha(value) }
      // 采样源：传页面内容容器的 node handle，绑定为背景采样源，避免自采样递归。
      Prop("backdropTargetId") { view: LiquidGlassSurfaceView, id: Int ->
        val target = appContext.findView<android.view.View>(id)
        if (target != null) {
          view.bindBackdrop(target)
        }
      }
    }

    // ---------- 悬浮窗权限 ----------

    Function("canDrawOverlays") {
      val context = appContext.reactContext ?: return@Function false
      Settings.canDrawOverlays(context)
    }

    Function("requestOverlayPermission") {
      val context = appContext.reactContext ?: return@Function null
      val uri = Uri.parse("package:${context.packageName}")
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, uri).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    // ---------- 桌面歌词悬浮窗 ----------

    Function("showLyricOverlay") {
      val context = appContext.reactContext ?: return@Function null
      LyricOverlayManager.show(context)
    }

    Function("hideLyricOverlay") {
      LyricOverlayManager.hide()
    }

    Function("updateLyricOverlay") {
        text: String,
        subText: String,
        isDark: Boolean,
        bgColor: String?,
        textColor: String? ->
      LyricOverlayManager.update(text, subText, isDark, bgColor, textColor)
    }

    // ---------- 前台播放服务桥接 ----------

    Function("updateMediaSession") {
        title: String,
        artist: String,
        album: String,
        artworkUrl: String?,
        durationMs: Long ->
      val context = appContext.reactContext ?: return@Function null
      PlaybackService.start(context)
      val intent = Intent(context, PlaybackService::class.java).apply {
        action = PlaybackService.ACTION_UPDATE
        putExtra(PlaybackService.EXTRA_TITLE, title)
        putExtra(PlaybackService.EXTRA_ARTIST, artist)
        putExtra(PlaybackService.EXTRA_ARTWORK, artworkUrl ?: "")
        putExtra(PlaybackService.EXTRA_DURATION, durationMs)
      }
      context.startService(intent)
    }

    Function("setPlaybackState") { playing: Boolean, positionMs: Long, durationMs: Long ->
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(context, PlaybackService::class.java).apply {
        action = PlaybackService.ACTION_UPDATE
        putExtra(PlaybackService.EXTRA_PLAYING, playing)
        putExtra(PlaybackService.EXTRA_POSITION, positionMs)
        putExtra(PlaybackService.EXTRA_DURATION, durationMs)
      }
      context.startService(intent)
    }

    Function("releaseMediaSession") {
      val context = appContext.reactContext ?: return@Function null
      PlaybackService.stop(context)
    }

    // ---------- 莫奈系统动态取色 ----------

    Function("getSystemAccentColors") {
      val context = appContext.reactContext ?: return@Function null
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
        return@Function null
      }
      try {
        val manager = WallpaperManager.getInstance(context)
        val colors = manager.getWallpaperColors(WallpaperManager.FLAG_SYSTEM) ?: return@Function null
        val primary = colors.primaryColor?.toArgb() ?: return@Function null
        val secondary = colors.secondaryColor?.toArgb() ?: primary
        val tertiary = colors.tertiaryColor?.toArgb() ?: primary
        return@Function mapOf(
          "primary" to colorToHex(primary),
          "secondary" to colorToHex(secondary),
          "tertiary" to colorToHex(tertiary),
        )
      } catch (_: Throwable) {
        return@Function null
      }
    }

    Function("extractPaletteFromImage") { url: String ->
      try {
        val bitmap = loadArtwork(url) ?: return@Function null
        val palette = Palette.from(bitmap).generate()
        val vibrant = palette.vibrantSwatch
        val dominant = palette.dominantSwatch
        val muted = palette.mutedSwatch
        val primary = vibrant?.rgb ?: dominant?.rgb ?: return@Function null
        return@Function mapOf(
          "primary" to colorToHex(primary),
          "secondary" to colorToHex(dominant?.rgb ?: primary),
          "tertiary" to colorToHex(muted?.rgb ?: primary),
        )
      } catch (_: Throwable) {
        return@Function null
      }
    }

    // ---------- 均衡器 ----------

    // 按预设索引应用 4 种声音风格到当前播放器 audioSessionId 对应的硬件 Equalizer。
    Function("applyEqualizerPreset") { audioSessionId: Int, presetIndex: Int ->
      val preset = EQUALIZER_PRESETS.getOrNull(presetIndex) ?: return@Function false
      try {
        applyGainPoints(audioSessionId, preset)
        return@Function true
      } catch (_: Throwable) {
        return@Function false
      }
    }

    // 下发显式频段增益（gains 为扁平数组 [freqHz, millibel, freqHz, millibel, ...]），
    // 原生侧按设备实际 band 中心频率线性插值并 setEnabled(true)。
    Function("setEqualizerBands") { audioSessionId: Int, gains: List<Double> ->
      try {
        val points = mutableListOf<EqBand>()
        var i = 0
        while (i + 1 < gains.size) {
          val freqHz = gains[i].toInt()
          val millibel = gains[i + 1].toFloat()
          if (freqHz > 0) {
            points.add(EqBand(freqHz, millibel / 100f))
          }
          i += 2
        }
        applyGainPoints(audioSessionId, points)
        return@Function true
      } catch (_: Throwable) {
        return@Function false
      }
    }

    Function("resetEqualizer") {
      releaseEqualizer()
    }

    // ---------- 频谱可视化 ----------

    // 检查/申请 RECORD_AUDIO 权限（Visualizer 绑定全局输出混音 session 0 需要）。
    Function("requestSpectrumPermission") {
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@Function true
      }
      val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
      if (granted) {
        return@Function true
      }
      ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.RECORD_AUDIO), 1001)
      return@Function false
    }

    // 启动频谱采集：Visualizer 绑定 audioSessionId（0=全局输出混音），
    // 实时 FFT 通过 onSpectrumData 事件回传 JS。
    Function("startSpectrum") { audioSessionId: Int ->
      try {
        releaseVisualizer()
        val session = if (audioSessionId > 0) audioSessionId else 0
        val viz = Visualizer(session)
        viz.captureSize = 256
        viz.setDataCaptureListener(
          object : Visualizer.OnDataCaptureListener {
            override fun onWaveFormDataCapture(visualizer: Visualizer, waveform: ByteArray, samplingRate: Int) {
            }

            override fun onFftDataCapture(visualizer: Visualizer, fft: ByteArray, samplingRate: Int) {
              val bandCount = 24
              val bins = fft.size / 2
              if (bins <= 0) return
              val step = (bins / bandCount).coerceAtLeast(1)
              val out = ArrayList<Double>(bandCount)
              for (i in 0 until bandCount) {
                var acc = 0.0
                var n = 0
                for (j in 0 until step) {
                  val idx = i * step + j
                  if (idx >= bins) break
                  val lo = fft[idx * 2].toInt() and 0xFF
                  val hi = fft[idx * 2 + 1].toInt()
                  val v = (lo or (hi shl 8)).toShort().toInt()
                  acc += Math.abs(v.toDouble())
                  n++
                }
                val avg = if (n > 0) acc / n else 0.0
                out.add((avg / 128.0).coerceIn(0.0, 1.0))
              }
              emit?.invoke("onSpectrumData", mapOf("amplitudes" to out))
            }
          },
          Math.max(10000, Visualizer.getMaxCaptureRate() / 2),
          false,
          true
        )
        viz.enabled = true
        visualizer = viz
        Log.d("Spectrum", "startSpectrum session=$session captureSize=${viz.captureSize} rate=${Visualizer.getMaxCaptureRate()}")
        return@Function true
      } catch (e: Throwable) {
        Log.e("Spectrum", "startSpectrum 失败", e)
        return@Function false
      }
    }

    Function("stopSpectrum") {
      releaseVisualizer()
    }

    // ---------- 批量分享音频文件 ----------

    // 通过 FileProvider 构造 ACTION_SEND_MULTIPLE，批量拉起系统分享面板（微信/QQ 等）。
    Function("shareAudioFiles") { files: List<String> ->
      val context = appContext.reactContext ?: return@Function false
      try {
        val authority = "${context.packageName}.SharingFileProvider"
        val uris = ArrayList<Uri>()
        for (raw in files) {
          val path = Uri.parse(raw).path ?: raw
          val file = File(path)
          if (file.exists() && file.length() > 0) {
            uris.add(FileProvider.getUriForFile(context, authority, file))
          }
        }
        if (uris.isEmpty()) {
          return@Function false
        }

        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
          type = "audio/*"
          putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          clipData = ClipData.newUri(context.contentResolver, "audio", uris[0]).apply {
            for (index in 1 until uris.size) {
              addItem(ClipData.Item(uris[index]))
            }
          }
        }
        context.startActivity(Intent.createChooser(intent, "分享音频"))
        return@Function true
      } catch (_: Throwable) {
        return@Function false
      }
    }

    // ---------- 保存到公共下载目录（/storage/emulated/0/Download/yumusic/） ----------

    // 把已下载到 cache 的音频复制进系统「下载」目录的 yumusic 子目录，
    // 返回公开路径（API 29+ 为 content:// 或 file:// 路径，API <29 为绝对路径）。
    Function("saveToPublicDownloads") { sourcePath: String, displayName: String ->
      val context = appContext.reactContext ?: return@Function null
      val src = File(uriToPath(sourcePath))
      if (!src.exists() || src.length() == 0L) {
        return@Function null
      }
      val ext = src.extension.lowercase().ifEmpty { "mp3" }
      val mime = when (ext) {
        "mp3" -> "audio/mpeg"
        "m4a", "mp4" -> "audio/mp4"
        "flac" -> "audio/flac"
        "aac" -> "audio/aac"
        "wav" -> "audio/wav"
        else -> "audio/mpeg"
      }
      return@Function saveToPublicDownloads(context, src, "$displayName.$ext", mime)
    }
  }

  private fun uriToPath(uri: String): String {
    return Uri.parse(uri).path ?: uri
  }

  private fun saveToPublicDownloads(context: Context, src: File, fileName: String, mime: String): String? {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, fileName)
          put(MediaStore.Downloads.MIME_TYPE, mime)
          put(MediaStore.Downloads.RELATIVE_PATH, "Download/yumusic")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
        resolver.openOutputStream(uri)?.use { out ->
          src.inputStream().use { input -> input.copyTo(out) }
        }
        val update = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
        resolver.update(uri, update, null, null)
        Log.d("Download", "已保存到公共下载: $uri")
        uri.toString()
      } else {
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "yumusic")
        if (!dir.exists()) {
          dir.mkdirs()
        }
        val dest = File(dir, fileName)
        src.copyTo(dest, overwrite = true)
        Log.d("Download", "已保存到公共下载: ${dest.absolutePath}")
        dest.absolutePath
      }
    } catch (e: Exception) {
      Log.e("Download", "保存到公共下载目录失败", e)
      null
    }
  }

  // ---------- 播放服务事件接收 ----------

  private fun registerPlaybackReceiver() {
    val context = appContext.reactContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        val action = intent?.action ?: return
        // 同一事件 250ms 内只透传一次（去重兜底，正常链路本就只会到达一次）。
        val now = android.os.SystemClock.elapsedRealtime()
        val last = lastPlaybackEventAt[action] ?: 0L
        if (now - last < 250L) {
          Log.d("MediaSession", "去重丢弃重复播控事件: $action")
          return
        }
        lastPlaybackEventAt[action] = now
        Log.d("MediaSession", "收到播控事件: $action")
        when (action) {
          PlaybackService.EVENT_NEXT -> emit?.invoke("onNext", null)
          PlaybackService.EVENT_PREVIOUS -> emit?.invoke("onPrevious", null)
          PlaybackService.EVENT_PLAY_PAUSE -> emit?.invoke("onPlayPause", null)
          PlaybackService.EVENT_SEEK -> {
            val pos = intent.getLongExtra(PlaybackService.EXTRA_SEEK_POSITION, -1L)
            if (pos >= 0) {
              emit?.invoke("onSeekTo", mapOf("positionMs" to pos))
            }
          }
        }
      }
    }
    val filter = IntentFilter().apply {
      addAction(PlaybackService.EVENT_NEXT)
      addAction(PlaybackService.EVENT_PREVIOUS)
      addAction(PlaybackService.EVENT_PLAY_PAUSE)
      addAction(PlaybackService.EVENT_SEEK)
    }
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    playbackReceiver = receiver
  }

  private fun unregisterPlaybackReceiver() {
    val context = appContext.reactContext ?: return
    playbackReceiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    playbackReceiver = null
  }

  // ---------- 均衡器实现 ----------

  private var equalizerSessionId = -1

  private fun ensureEqualizer(audioSessionId: Int): Equalizer {
    val session = if (audioSessionId > 0) audioSessionId else 0
    val current = equalizer
    if (current != null && equalizerSessionId == session) {
      return current
    }
    releaseEqualizer()
    val eq = Equalizer(0, session).apply { enabled = true }
    equalizer = eq
    equalizerSessionId = session
    return eq
  }

  private fun releaseEqualizer() {
    equalizer?.release()
    equalizer = null
    equalizerSessionId = -1
  }

  private fun releaseVisualizer() {
    visualizer?.let {
      try {
        it.enabled = false
        it.release()
      } catch (_: Throwable) {
      }
    }
    visualizer = null
  }

  /** 将频段增益点插值下发到设备实际 band；空列表 = 原声（全部归零 + 关闭）。 */
  private fun applyGainPoints(audioSessionId: Int, points: List<EqBand>) {
    val eq = ensureEqualizer(audioSessionId)
    eq.enabled = points.isNotEmpty()
    val bands = eq.numberOfBands
    val range = eq.bandLevelRange
    for (band in 0 until bands) {
      val bandShort = band.toShort()
      val centerHz = eq.getCenterFreq(bandShort) / 1000
      val gainDb = if (points.isEmpty()) 0f else interpolateGain(centerHz, points)
      val millibel = (gainDb * 100).toInt().coerceIn(range[0].toInt(), range[1].toInt())
      eq.setBandLevel(bandShort, millibel.toShort())
    }
    Log.d("EQ", "applyGainPoints session=$audioSessionId enabled=${eq.enabled} bands=$bands points=${points.size}")
  }

  private fun interpolateGain(freqHz: Int, presets: List<EqBand>): Float {
    if (presets.isEmpty()) return 0f
    val sorted = presets.sortedBy { it.freqHz }
    if (freqHz <= sorted.first().freqHz) return sorted.first().gainDb
    if (freqHz >= sorted.last().freqHz) return sorted.last().gainDb
    for (i in 0 until sorted.size - 1) {
      val a = sorted[i]
      val b = sorted[i + 1]
      if (freqHz in a.freqHz..b.freqHz) {
        val t = (freqHz - a.freqHz).toFloat() / (b.freqHz - a.freqHz)
        return a.gainDb + (b.gainDb - a.gainDb) * t
      }
    }
    return 0f
  }

  private fun colorToHex(color: Int): String {
    return String.format("#%06X", color and 0xFFFFFF)
  }

  private fun loadArtwork(url: String): Bitmap? {
    return try {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = 8000
      connection.readTimeout = 8000
      connection.instanceFollowRedirects = true
      connection.connect()
      if (connection.responseCode !in 200..299) {
        return null
      }
      connection.inputStream.use { stream -> BitmapFactory.decodeStream(stream) }
    } catch (_: Throwable) {
      null
    }
  }
}

/** 均衡器频段定义：中心频率(Hz) + 增益(dB)。 */
data class EqBand(val freqHz: Int, val gainDb: Float)

/** 4 种均衡器预设（按 index），频点增益会线性插值到设备实际 band。 */
val EQUALIZER_PRESETS: List<List<EqBand>> = listOf(
  // 0: 原声（Flat）
  emptyList(),
  // 1: 母带处理：低频+2dB，中频平直，高频 1k-2.5k +1.5dB
  listOf(
    EqBand(30, 2.0f), EqBand(100, 0.0f), EqBand(500, 0.0f),
    EqBand(1500, 1.5f), EqBand(2500, 1.5f), EqBand(4000, 1.0f), EqBand(8000, 1.0f)
  ),
  // 2: 通透饱满：低频 20-63Hz +4dB，高频 1k-4k +3.5dB
  listOf(
    EqBand(30, 4.0f), EqBand(63, 4.0f), EqBand(300, 0.0f),
    EqBand(2000, 3.5f), EqBand(4000, 3.5f), EqBand(8000, 2.0f)
  ),
  // 3: 哈基米曲线：超低频 20-31Hz +3.5dB，中频 160-800Hz -1dB，高频 2.5k+ +1.2dB
  listOf(
    EqBand(25, 3.5f), EqBand(50, 1.7f), EqBand(160, -1.0f),
    EqBand(400, -1.0f), EqBand(800, -1.0f), EqBand(2500, 1.2f), EqBand(8000, 1.2f)
  ),
)
