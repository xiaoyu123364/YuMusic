package expo.modules.moekoenative

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 桌面歌词悬浮窗：TYPE_APPLICATION_OVERLAY（API 26+）/ TYPE_PHONE（旧系统）。
 * 由 JS 侧在拿到 SYSTEM_ALERT_WINDOW 权限后调用 show/update/hide 控制。
 */
object LyricOverlayManager {
  private var windowManager: WindowManager? = null
  private var overlay: LinearLayout? = null
  private var lineView: TextView? = null
  private var subView: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private val ui = Handler(Looper.getMainLooper())

  private fun dp(context: Context, value: Int): Int {
    return (value * context.resources.displayMetrics.density).toInt()
  }

  private fun roundedBackground(color: Int, radius: Float): GradientDrawable {
    return GradientDrawable().apply {
      setColor(color)
      cornerRadius = radius
    }
  }

  @SuppressLint("RtlHardcoded", "ClickableViewAccessibility")
  fun show(context: Context) {
    ui.post {
      if (overlay != null) {
        return@post
      }

      val wm = context.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }

      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT
      ).apply {
        gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        y = dp(context, 96)
      }

      val container = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(dp(context, 20), dp(context, 11), dp(context, 20), dp(context, 11))
        background = roundedBackground(Color.argb(205, 16, 16, 22), dp(context, 24).toFloat())
        elevation = dp(context, 6).toFloat()
      }

      lineView = TextView(context).apply {
        setTextColor(Color.WHITE)
        textSize = 17f
        gravity = Gravity.CENTER
        maxLines = 1
        setSingleLine(true)
      }
      subView = TextView(context).apply {
        setTextColor(Color.argb(170, 255, 255, 255))
        textSize = 12f
        gravity = Gravity.CENTER
        maxLines = 1
        setSingleLine(true)
      }

      container.addView(lineView)
      container.addView(subView)

      // 支持拖动悬浮窗
      var touchStartX = 0f
      var touchStartY = 0f
      var paramsStartX = 0
      var paramsStartY = 0
      container.setOnTouchListener { _, event ->
        when (event.action) {
          MotionEvent.ACTION_DOWN -> {
            touchStartX = event.rawX
            touchStartY = event.rawY
            paramsStartX = params.x
            paramsStartY = params.y
            true
          }
          MotionEvent.ACTION_MOVE -> {
            params.x = paramsStartX + (event.rawX - touchStartX).toInt()
            params.y = paramsStartY + (event.rawY - touchStartY).toInt()
            try {
              wm.updateViewLayout(container, params)
            } catch (_: Exception) {
              // 窗口尚未就绪时忽略
            }
            true
          }
          else -> false
        }
      }

      overlay = container
      windowManager = wm
      layoutParams = params
      try {
        wm.addView(container, params)
      } catch (_: Exception) {
        // 权限未授予或已被回收时静默失败，由 JS 侧重新检查权限
        overlay = null
        windowManager = null
        layoutParams = null
      }
    }
  }

  fun hide() {
    ui.post {
      overlay?.let { view ->
        try {
          windowManager?.removeView(view)
        } catch (_: Exception) {
          // 已被系统回收，忽略
        }
      }
      overlay = null
      windowManager = null
      layoutParams = null
    }
  }

  fun update(text: String, subText: String, isDark: Boolean) {
    ui.post {
      if (overlay == null) {
        return@post
      }
      val lineColor = if (isDark) Color.WHITE else Color.rgb(20, 20, 28)
      val subColor = if (isDark) Color.argb(175, 255, 255, 255) else Color.argb(190, 60, 60, 72)
      lineView?.setTextColor(lineColor)
      subView?.setTextColor(subColor)
      lineView?.text = text
      subView?.text = subText
    }
  }
}
