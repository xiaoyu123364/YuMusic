package expo.modules.moekoenative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

/**
 * 前台播放服务：承载 MediaSessionCompat + NotificationCompat.MediaStyle，
 * 在锁屏/通知栏/桌面小组件正确显示「上一曲 / 播放暂停 / 下一曲」三个按钮，
 * 并以前台服务保证息屏后台连续播放不受系统 3 分钟限制。
 *
 * 关键点（确保系统不销毁播控组件）：
 * - 启动即调用 startForeground(NOTIFICATION_ID, notification)；
 * - 创建专属通知渠道 NotificationChannel("music_playback", "音乐播放", IMPORTANCE_LOW)；
 * - NotificationCompat.MediaStyle.setShowActionsInCompactView(0,1,2).setMediaSession(sessionToken)；
 * - 返回 START_STICKY 并在系统重建时从静态状态恢复元数据。
 * 按钮点击通过 MediaButtonReceiver 转发到 MediaSessionCompat.Callback，
 * 再由广播桥接到 JS 播放队列切歌。
 */
class PlaybackService : Service() {
  companion object {
    const val CHANNEL_ID = "music_playback"
    const val CHANNEL_NAME = "音乐播放"
    const val NOTIFICATION_ID = 0x51

    const val ACTION_UPDATE = "moekoe.playback.UPDATE"
    const val ACTION_STOP = "moekoe.playback.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_ARTIST = "artist"
    const val EXTRA_ARTWORK = "artwork"
    const val EXTRA_DURATION = "duration"
    const val EXTRA_PLAYING = "playing"
    const val EXTRA_POSITION = "position"

    // 切歌/播放暂停事件广播，ExpoMoekoeNative 动态接收后 emit 给 JS。
    const val EVENT_NEXT = "moekoe.playback.event.NEXT"
    const val EVENT_PREVIOUS = "moekoe.playback.event.PREVIOUS"
    const val EVENT_PLAY_PAUSE = "moekoe.playback.event.PLAY_PAUSE"
    const val EVENT_SEEK = "moekoe.playback.event.SEEK"
    const val EXTRA_SEEK_POSITION = "seek_position"

    // 静态保存最后一次元数据，供系统重建服务（START_STICKY）时恢复。
    private var lastTitle = ""
    private var lastArtist = ""
    private var lastArtworkUrl = ""
    private var lastDuration = 0L
    private var lastPosition = 0L
    private var lastPlaying = false

    fun start(context: Context) {
      val intent = Intent(context, PlaybackService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, PlaybackService::class.java))
    }
  }

  private var mediaSession: MediaSessionCompat? = null
  private var title: String = ""
  private var artist: String = ""
  private var artwork: Bitmap? = null
  private var playing: Boolean = false

  /** 已成功加载封面对应的 URL，避免进度 tick 反复重新下载。 */
  private var loadedArtworkUrl: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    ensureSession()
    // 立即进入前台，避免 startForegroundService 后 5 秒内未调用 startForeground 而崩溃。
    updateNotification()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_UPDATE -> {
        title = intent.getStringExtra(EXTRA_TITLE) ?: title
        artist = intent.getStringExtra(EXTRA_ARTIST) ?: artist
        playing = intent.getBooleanExtra(EXTRA_PLAYING, playing)
        val duration = intent.getLongExtra(EXTRA_DURATION, 0)
        val position = intent.getLongExtra(EXTRA_POSITION, 0)
        val artworkUrl = intent.getStringExtra(EXTRA_ARTWORK) ?: lastArtworkUrl

        lastTitle = title
        lastArtist = artist
        lastPlaying = playing
        lastDuration = duration
        lastPosition = position
        lastArtworkUrl = artworkUrl

        updateSession(duration, position)
        // 封面只在 URL 变化时重新下载：进度/播放状态 tick 高频到达，
        // 若每次都走 lastArtworkUrl 兜底重下，会反复重建通知并造成状态显示延迟。
        if (artworkUrl.isNotEmpty() && artworkUrl != loadedArtworkUrl) {
          val urlToLoad = artworkUrl
          CoroutineScope(Dispatchers.IO).launch {
            val bmp = loadArtwork(urlToLoad)
            if (bmp != null) {
              artwork = bmp
              loadedArtworkUrl = urlToLoad
              updateSession(lastDuration, lastPosition)
            }
            updateNotification()
          }
        } else {
          updateNotification()
        }
      }
      ACTION_STOP -> stopSelf()
      else -> {
        // 系统重建（intent == null）时从静态状态恢复，保证锁屏播控不丢失。
        title = lastTitle
        artist = lastArtist
        playing = lastPlaying
        updateSession(lastDuration, lastPosition)
        updateNotification()
      }
    }
    return START_STICKY
  }

  private fun ensureSession() {
    if (mediaSession != null) return
    val callback = object : MediaSessionCompat.Callback() {
      // 统一走广播单通道：MediaSession 回调与通知栏按钮都只发一次广播，
      // 由 ExpoMoekoeNativeModule 的接收器 emit 给 JS。
      // 严禁在此再直接调用 playbackEventSink —— 双通道会导致每次点击触发两次
      // （下一首连跳两首、播放暂停切两次等于没切，表现为状态"自己弹回去"）。
      override fun onPlay() {
        sendBroadcast(Intent(EVENT_PLAY_PAUSE).setPackage(packageName))
      }

      override fun onPause() {
        sendBroadcast(Intent(EVENT_PLAY_PAUSE).setPackage(packageName))
      }

      override fun onSkipToNext() {
        sendBroadcast(Intent(EVENT_NEXT).setPackage(packageName))
      }

      override fun onSkipToPrevious() {
        sendBroadcast(Intent(EVENT_PREVIOUS).setPackage(packageName))
      }

      override fun onSeekTo(pos: Long) {
        sendBroadcast(Intent(EVENT_SEEK).putExtra(EXTRA_SEEK_POSITION, pos).setPackage(packageName))
      }
    }

    mediaSession = MediaSessionCompat(this, "YuMusicMediaSession").apply {
      setCallback(callback)
      setMediaButtonReceiver(
        MediaButtonReceiver.buildMediaButtonPendingIntent(
          this@PlaybackService,
          PlaybackStateCompat.ACTION_PLAY_PAUSE
        )
      )
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
    }
  }

  private fun updateSession(duration: Long, position: Long) {
    val session = mediaSession ?: return
    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title.ifEmpty { "YuMusic" })
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration)
        .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artwork)
        .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
        .build()
    )
    // 队列两条以上，部分 OEM 锁屏/通知栏才会显示上一首/下一首。
    session.setQueue(
      listOf(
        MediaSessionCompat.QueueItem(MediaDescriptionCompat.Builder().setMediaId("0").build(), 0L),
        MediaSessionCompat.QueueItem(MediaDescriptionCompat.Builder().setMediaId("1").build(), 1L)
      )
    )
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SEEK_TO
        )
        .setState(
          if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
          position,
          1f
        )
        .setBufferedPosition(duration)
        .build()
    )
    session.isActive = true
  }

  private fun buildNotification(): Notification {
    val session = mediaSession ?: return Notification()
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(title.ifEmpty { "YuMusic" })
      .setContentText(artist)
      .setContentIntent(
        PendingIntent.getActivity(
          this,
          0,
          packageManager.getLaunchIntentForPackage(packageName),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setOngoing(playing)
      .setAutoCancel(false)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      // 按钮直接发自定义广播（更可靠），由 ExpoMoekoeNative 动态接收后 emit 给 JS，
      // 不依赖 MediaButtonReceiver→静态 MediaSessionCompat 这条在 Android 12+ 常失效的链路。
      .addAction(
        NotificationCompat.Action.Builder(
          android.R.drawable.ic_media_previous, "上一曲",
          broadcastPendingIntent(EVENT_PREVIOUS, 0x61)
        ).build()
      )
      .addAction(
        NotificationCompat.Action.Builder(
          if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
          if (playing) "暂停" else "播放",
          broadcastPendingIntent(EVENT_PLAY_PAUSE, 0x62)
        ).build()
      )
      .addAction(
        NotificationCompat.Action.Builder(
          android.R.drawable.ic_media_next, "下一曲",
          broadcastPendingIntent(EVENT_NEXT, 0x63)
        ).build()
      )

    if (artwork != null) {
      builder.setLargeIcon(artwork)
    }

    val style = MediaStyle()
      .setMediaSession(session.sessionToken)
      .setShowActionsInCompactView(0, 1, 2)
      .setShowCancelButton(false)
    builder.setStyle(style)

    return builder.build()
  }

  private fun broadcastPendingIntent(action: String, requestCode: Int): PendingIntent {
    return PendingIntent.getBroadcast(
      this,
      requestCode,
      Intent(action).setPackage(packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun updateNotification() {
    try {
      val type =
        if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
      startForeground(NOTIFICATION_ID, buildNotification(), type)
    } catch (_: Exception) {
      // 通知发布失败不影响播放主流程
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
          description = "锁屏与通知栏的播放控制"
          setShowBadge(false)
        }
      )
    }
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
    } catch (_: Exception) {
      null
    }
  }

  override fun onDestroy() {
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    super.onDestroy()
  }
}
