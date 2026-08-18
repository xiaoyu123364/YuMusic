package expo.modules.moekoenative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.widget.FrameLayout
import androidx.annotation.RequiresApi

/**
 * 自包含「液态玻璃」表层（iOS 26 Liquid Glass 风格），不依赖任何第三方模糊库。
 *
 * 设计要点：
 * 1. 真·背景模糊：通过 [bindBackdrop] 拿到背后内容视图（页面内容容器，不含玻璃自身），
 *    将其内容绘制到离屏缓冲后做模糊，再贴回玻璃区域，因此「看得见背后被模糊的画面」。
 *    - API 31+：使用 [RenderNode] + [RenderEffect.createBlurEffect] 走 GPU 硬件模糊，高效。
 *    - API <31：将目标视图降采样绘制到 Bitmap，再做 3 趟盒式模糊（近似高斯），
 *      最后放大贴回（放大本身也贡献柔化），保证各机型都有真实模糊、不空壳。
 * 2. 玻璃质感：半透明冷白填充（frosted tint）+ 沿圆角描边的浅色高光（模拟边缘高光 / 棱镜反光），
 *    贴近 iOS 液态玻璃的「有厚度、有反光」观感，绝不是空 View。
 * 3. 动态采样：绑定 backdrop 后每帧重绘，使玻璃随页面滚动实时刷新。
 *
 * 采用「组合」模式：本类继承 [FrameLayout]，自身负责绘制，不持有第三方视图。
 * 所有 setXxx 方法签名与 ExpoMoekoeNativeModule 中的 Prop 一一对应，保证 JS 桥接零改动。
 */
class LiquidGlassSurfaceView(context: Context) : FrameLayout(context) {

  // ---- 可配置属性（镜像 JS 侧 Prop） ----
  private var cornerRadius = 0f
  private var refractionHeight = 64f
  private var bevelWidth = 16f
  private var dispersionStrength = 0.12f
  private var blurAmount = 0.08f
  private var blurRadiusPx = 18f // 由 blurAmount 推导出的真实模糊半径(px)
  private var saturation = 150f
  private var aberrationIntensity = 2.2f
  private var elasticity = 0.18f
  private var enableChromaticAberration = true
  private var enableSensorHighlight = false
  private var enableAdaptiveTint = false
  private var enablePressEffect = true
  private var enableEdgeHighlight = true

  /** 背后采样源（页面内容容器）。 */
  private var backdropTarget: View? = null

  // ---- 离屏缓冲（API<31 降级用） ----
  private var sampleBitmap: Bitmap? = null
  private var blurredBitmap: Bitmap? = null
  private val blurPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isFilterBitmap = true }

  // ---- API31+ 硬件模糊用 ----
  private var renderNode: RenderNode? = null

  /** 重入保护，防止把玻璃自身作为 backdrop 时递归绘制。 */
  @Volatile
  private var isDrawing = false

  init {
    // 透明背景 + 允许自身绘制
    setBackgroundColor(Color.TRANSPARENT)
    setWillNotDraw(false)
  }

  /**
   * 绑定背景采样源。会做防御：拒绝把玻璃自身或其祖先作为 backdrop，避免自采样递归。
   * 若目标尚未 attach / 尺寸为 0，仅保存引用，待下次绘制时再尝试。
   */
  fun bindBackdrop(target: View) {
    if (target == this || isDescendantOf(target)) {
      return
    }
    backdropTarget = target
    invalidate()
  }

  private fun isDescendantOf(candidate: View): Boolean {
    var p: View? = this
    while (p != null) {
      if (p == candidate) return true
      p = p.parent as? View
    }
    return false
  }

  // ---------- 属性转发（与 ExpoMoekoeNativeModule Prop 名称严格对应） ----------

  fun setCornerRadius(value: Float) {
    cornerRadius = value.coerceAtLeast(0f)
    invalidate()
  }

  fun setRefractionHeight(value: Float) {
    refractionHeight = value
    invalidate()
  }

  fun setBevelWidth(value: Float) {
    bevelWidth = value.coerceAtLeast(0f)
    invalidate()
  }

  fun setDispersionStrength(value: Float) {
    dispersionStrength = value
    invalidate()
  }

  fun setBlurAmount(value: Float) {
    blurAmount = value
    // 将 0..1 量级的 blurAmount 映射为真实模糊半径(px)
    blurRadiusPx = (6f + value * 180f).coerceIn(2f, 60f)
    invalidate()
  }

  fun setSaturation(value: Float) {
    saturation = value.coerceAtLeast(0f)
    invalidate()
  }

  fun setAberrationIntensity(value: Float) {
    aberrationIntensity = value
    invalidate()
  }

  fun setDisplacementScale(value: Float) {
    // 折射位移在自包含实现中以圆角/高光近似，保留接口以兼容契约
  }

  fun setElasticity(value: Float) {
    elasticity = value
    invalidate()
  }

  fun setEnableSensorHighlight(value: Boolean) {
    enableSensorHighlight = value
    invalidate()
  }

  fun setEnableAdaptiveTint(value: Boolean) {
    enableAdaptiveTint = value
    invalidate()
  }

  fun setEnablePressEffect(value: Boolean) {
    enablePressEffect = value
    invalidate()
  }

  fun setEnableChromaticAberration(value: Boolean) {
    enableChromaticAberration = value
    invalidate()
  }

  fun setEnableEdgeHighlight(value: Boolean) {
    enableEdgeHighlight = value
    invalidate()
  }

  // ---------- 绘制 ----------

  override fun onDraw(canvas: Canvas) {
    if (isDrawing) return
    isDrawing = true
    try {
      drawGlass(canvas)
    } finally {
      isDrawing = false
    }
  }

  private fun drawGlass(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0 || h <= 0) return

    val radius = cornerRadius.coerceAtLeast(0f)
    val clipPath = Path().apply {
      addRoundRect(0f, 0f, w, h, radius, radius, Path.Direction.CW)
    }

    // 1) 背景模糊（裁剪到圆角区域）
    canvas.save()
    canvas.clipPath(clipPath)
    val backdrop = backdropTarget
    if (backdrop != null && backdrop.width > 0 && backdrop.height > 0 && isAttachedToWindow) {
      drawBlurredBackdrop(canvas, backdrop)
    } else {
      // 兜底：无采样源时也给一层淡淡冷白，保证「看得见」
      canvas.drawColor(Color.argb(28, 255, 255, 255))
    }
    canvas.restore()

    // 2) 玻璃质感叠加（tint + 边缘高光，裁剪到同一圆角区域）
    canvas.save()
    canvas.clipPath(clipPath)
    drawGlassOverlay(canvas, w, h)
    canvas.restore()

    // 动态采样：绑定了 backdrop 就持续重绘，使玻璃随内容滚动刷新
    if (backdropTarget != null) {
      postInvalidateOnAnimation()
    }
  }

  /**
   * 将 backdrop 视图中「位于玻璃背后」的那一块区域模糊后贴回。
   * 通过 getLocationOnScreen 计算玻璃与目标视图的屏幕坐标偏移，
   * 在离屏画布上按偏移绘制目标视图，使对齐区域正确。
   */
  private fun drawBlurredBackdrop(canvas: Canvas, backdrop: View) {
    val w = width
    val h = height
    if (w <= 0 || h <= 0) return

    val glassLoc = IntArray(2)
    getLocationOnScreen(glassLoc)
    val backLoc = IntArray(2)
    backdrop.getLocationOnScreen(backLoc)
    val dx = (backLoc[0] - glassLoc[0]).toFloat()
    val dy = (backLoc[1] - glassLoc[1]).toFloat()

    val blurPx = blurRadiusPx.coerceAtLeast(1f)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      drawBackdropRenderNode(canvas, backdrop, dx, dy, blurPx, w, h)
    } else {
      drawBackdropBitmap(canvas, backdrop, dx, dy, blurPx, w, h)
    }
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun drawBackdropRenderNode(
    canvas: Canvas,
    backdrop: View,
    dx: Float,
    dy: Float,
    blurPx: Float,
    w: Int,
    h: Int
  ) {
    var node = renderNode
    if (node == null || node.width != w || node.height != h) {
      node = RenderNode("liquidGlassBackdrop")
      node.setPosition(0, 0, w, h)
      renderNode = node
    }
    val rnCanvas = node.beginRecording(w, h)
    rnCanvas.translate(dx, dy)
    backdrop.draw(rnCanvas)
    node.endRecording()
    node.setRenderEffect(RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP))
    canvas.drawRenderNode(node)
  }

  private fun drawBackdropBitmap(
    canvas: Canvas,
    backdrop: View,
    dx: Float,
    dy: Float,
    blurPx: Float,
    w: Int,
    h: Int
  ) {
    // 降采样到较小尺寸，兼顾性能与「放大即柔化」的模糊观感
    val maxSide = 180
    val scale = (maxSide.toFloat() / maxOf(w, h).coerceAtLeast(1))
      .coerceAtMost(1f)
      .coerceAtLeast(0.04f)
    val sw = maxOf(1, (w * scale).toInt())
    val sh = maxOf(1, (h * scale).toInt())

    var sample = sampleBitmap
    if (sample == null || sample.width != sw || sample.height != sh) {
      sample?.recycle()
      sample = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
      sampleBitmap = sample
    }
    val sCanvas = Canvas(sample)
    sCanvas.setMatrix(Matrix())
    sCanvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    sCanvas.translate(dx * scale, dy * scale)
    sCanvas.scale(scale, scale)
    backdrop.draw(sCanvas)

    // 在小图上做盒式模糊（3 趟近似高斯），半径随缩放同步减小
    val radius = maxOf(1, (blurPx * scale).toInt())
    val blurred = boxBlur(sample!!, radius)

    canvas.drawBitmap(blurred, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), blurPaint)

    // 回收上一帧的临时模糊图，复用当前帧
    blurredBitmap?.recycle()
    blurredBitmap = blurred
  }

  /** 玻璃质感：冷白磨砂填充 + 沿圆角描边的浅色高光。 */
  private fun drawGlassOverlay(canvas: Canvas, w: Float, h: Float) {
    val tintAlpha = (saturation / 150f * 42f).toInt().coerceIn(8, 70)
    val tintPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.argb(tintAlpha, 245, 248, 255) // 冷白 tint
    }
    canvas.drawRect(0f, 0f, w, h, tintPaint)

    if (enableEdgeHighlight) {
      // 浅色渐变描边模拟边缘高光（棱镜反光），沿圆角路径绘制，
      // 由于外部半边已被 clip 裁掉，最终呈现为内侧高光。
      val stroke = bevelWidth.coerceAtLeast(1f)
      val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        shader = LinearGradient(
          0f, 0f, 0f, h,
          intArrayOf(
            Color.argb(170, 255, 255, 255),
            Color.argb(45, 255, 255, 255),
            Color.argb(110, 255, 255, 255)
          ),
          null,
          Shader.TileMode.CLAMP
        )
      }
      val rimPath = Path().apply {
        addRoundRect(0f, 0f, w, h, cornerRadius.coerceAtLeast(0f), cornerRadius.coerceAtLeast(0f), Path.Direction.CW)
      }
      canvas.drawPath(rimPath, rim)
    }

    // 顶部轻微亮带，增强「厚度」观感
    val topGlow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      shader = LinearGradient(
        0f, 0f, 0f, (h * 0.18f).coerceAtLeast(8f),
        intArrayOf(Color.argb(60, 255, 255, 255), Color.argb(0, 255, 255, 255)),
        null,
        Shader.TileMode.CLAMP
      )
    }
    canvas.drawRect(0f, 0f, w, (h * 0.18f).coerceAtLeast(8f), topGlow)
  }

  // ---------- 盒式模糊（API<31 降级，O(w*h*r) 小图足够快） ----------

  private fun boxBlur(source: Bitmap, radius: Int): Bitmap {
    val w = source.width
    val h = source.height
    val src = IntArray(w * h)
    source.getPixels(src, 0, w, 0, 0, w, h)
    val tmp = src.copyOf()
    // 3 趟（横+竖）近似高斯模糊
    for (pass in 0 until 3) {
      boxBlurPass(src, tmp, w, h, radius, horizontal = true)
      boxBlurPass(tmp, src, w, h, radius, horizontal = false)
    }
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    out.setPixels(src, 0, w, 0, 0, w, h)
    return out
  }

  private fun boxBlurPass(
    src: IntArray,
    dst: IntArray,
    w: Int,
    h: Int,
    radius: Int,
    horizontal: Boolean
  ) {
    val r = radius.coerceAtLeast(0)
    if (r == 0) {
      src.copyInto(dst)
      return
    }
    if (horizontal) {
      for (y in 0 until h) {
        val off = y * w
        for (x in 0 until w) {
          var a = 0
          var rr = 0
          var g = 0
          var b = 0
          var cnt = 0
          for (k in -r..r) {
            val xi = x + k
            if (xi in 0 until w) {
              val c = src[off + xi]
              a += c ushr 24
              rr += (c shr 16) and 0xff
              g += (c shr 8) and 0xff
              b += c and 0xff
              cnt++
            }
          }
          dst[off + x] = (clamp8(a / cnt) shl 24)
            .or(clamp8(rr / cnt) shl 16)
            .or(clamp8(g / cnt) shl 8)
            .or(clamp8(b / cnt))
        }
      }
    } else {
      for (x in 0 until w) {
        for (y in 0 until h) {
          var a = 0
          var rr = 0
          var g = 0
          var b = 0
          var cnt = 0
          for (k in -r..r) {
            val yi = y + k
            if (yi in 0 until h) {
              val c = src[yi * w + x]
              a += c ushr 24
              rr += (c shr 16) and 0xff
              g += (c shr 8) and 0xff
              b += c and 0xff
              cnt++
            }
          }
          dst[y * w + x] = (clamp8(a / cnt) shl 24)
            .or(clamp8(rr / cnt) shl 16)
            .or(clamp8(g / cnt) shl 8)
            .or(clamp8(b / cnt))
        }
      }
    }
  }

  private fun clamp8(v: Int): Int = if (v < 0) 0 else if (v > 255) 255 else v

  // ---------- 资源回收 ----------

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    sampleBitmap?.recycle()
    sampleBitmap = null
    blurredBitmap?.recycle()
    blurredBitmap = null
    renderNode = null
  }
}
