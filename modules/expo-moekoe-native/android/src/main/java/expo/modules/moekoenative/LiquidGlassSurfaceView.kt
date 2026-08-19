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
import android.graphics.RuntimeShader
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
  // 以 Any? 存储，避免 minSdk<29 设备加载类时引用 RenderNode 触发 NoClassDefFoundError；
  // 仅在 API31+ 的 drawBackdropRenderNode 内安全强转为 RenderNode。
  private var renderNode: Any? = null

  // API33+ 液态玻璃光学着色器（折射 / 色散 / 饱和度提升）。
  // 以 Any? 存储，仅在 API33+ 方法内强转为 RuntimeShader，规避低版本类加载 NoClassDefFoundError。
  private var glassShader: Any? = null

  /** 重入保护，防止把玻璃自身作为 backdrop 时递归绘制。 */
  @Volatile
  private var isDrawing = false

  init {
    // 透明背景 + 允许自身绘制
    setBackgroundColor(Color.TRANSPARENT)
    setWillNotDraw(false)
  }

  companion object {
    /**
     * AGSL（Skia SkSL 方言）液态玻璃光学着色器。
     * 把上游模糊后的 backdrop 当作 `content` 输入，沿圆角矩形的边缘法线做折射偏移
     * （中心清晰、边缘像透镜一样弯曲），并按法线做 RGB 色散，模拟 iOS 26 Liquid Glass
     * 的"透镜"观感——这是"像玻璃而不像模糊"的关键。低于 API33 不编译、不引用。
     *
     * 坐标在像素空间：fragCoord ∈ [0,w]×[0,h]，iResolution 为节点像素尺寸。
     * 仅在边缘 band 内施加折射/色散，中心区域（d 远离 0）保持原样。
     */
    private const val GLASS_AGSL = """
      uniform shader content;
      uniform float2 iResolution;
      uniform float iCorner;
      uniform float iLens;
      uniform float iAberration;
      uniform float iVibrancy;

      float sdRoundRect(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }
      vec3 sat(vec3 c, float s) {
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(l), c, s);
      }
      vec4 main(vec2 fragCoord) {
        vec2 halfSize = iResolution * 0.5;
        float r = min(iCorner, min(halfSize.x, halfSize.y));
        vec2 p = fragCoord - halfSize;
        float d = sdRoundRect(p, halfSize, r);
        float band = min(iResolution.x, iResolution.y) * 0.18;
        float edge = smoothstep(-band, 0.0, d);
        float e = 1.5;
        float nx = sdRoundRect(p + vec2(e, 0.0), halfSize, r) - sdRoundRect(p - vec2(e, 0.0), halfSize, r);
        float ny = sdRoundRect(p + vec2(0.0, e), halfSize, r) - sdRoundRect(p - vec2(0.0, e), halfSize, r);
        vec2 n = normalize(vec2(nx, ny) + vec2(1e-5));
        vec2 off = -n * (iLens * edge);
        vec2 base = fragCoord + off;
        vec2 disp = n * (iAberration * edge);
        vec3 col;
        col.r = content.eval(clamp(base + disp, vec2(0.0), iResolution)).r;
        col.g = content.eval(clamp(base, vec2(0.0), iResolution)).g;
        col.b = content.eval(clamp(base - disp, vec2(0.0), iResolution)).b;
        col = sat(col, iVibrancy);
        return vec4(col, 1.0);
      }
    """
  }

  /**
   * 绑定背景采样源（页面内容容器）。
   *
   * 这里**允许**把祖先视图作为 backdrop：玻璃本就是 backdrop 子树的一部分，
   * 采样时必然把"玻璃自身"也圈进 backdrop 的绘制范围。重入递归的保护不靠"拒绝祖先"，
   * 而由 [onDraw] 中的 [isDrawing] 标志承担——在绘制 backdrop 的过程中再次遍历到玻璃自身时，
   * onDraw 直接提前返回，不再二次 beginRecording 同一 RenderNode，从而既避免崩溃，
   * 又保证玻璃能真正拿到背后被模糊的画面（而不是永远退化成兜底白块）。
   *
   * 仅拒绝把玻璃自身（target == this）作为 backdrop，避免无意义自采样。
   */
  fun bindBackdrop(target: View) {
    if (target == this) {
      return
    }
    backdropTarget = target
    invalidate()
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
      // 兜底：无采样源时也给一层淡淡冷白，保证「看得见」。
      // 注意：drawColor 会忽略 clip 而填整块画布，故改用 drawRect(Paint) 以尊重圆角裁剪，
      // 避免圆角外的四角出现多余白边。
      val fb = Paint().apply { color = Color.argb(28, 255, 255, 255) }
      canvas.drawRect(0f, 0f, w, h, fb)
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
   *
   * 关键修复（RenderNode 重入崩溃）：
   *   玻璃本就是 backdrop 的子节点，系统绘制时正处于「backdrop 自身 DisplayList 录制中」。
   *   旧实现用硬件 RecordingCanvas 直接对 backdrop 调用 [View.draw]（→ 内部再触发
   *   [View.updateDisplayListIfDirty]），等于对同一个 backdrop RenderNode 二次 beginRecording，
   *   触发 `IllegalStateException: Recording currently in progress` 闪退。
   *
   *   现改为：**用软件 Canvas 把 backdrop 降采样绘制到离屏 Bitmap**（软件路径绝不会重录
   *   backdrop 的 RenderNode），再对这张 Bitmap 做模糊后贴回玻璃。玻璃自身作为 backdrop 子节点
   *   在软件采样时再次触发的 onDraw 已由 [isDrawing] 标志提前返回，不会递归。
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

    // 降采样到较小尺寸：兼顾性能，且「放大即柔化」本身也贡献模糊观感
    val maxSide = 200
    val scale = (maxSide.toFloat() / maxOf(w, h).coerceAtLeast(1))
      .coerceIn(0.05f, 1f)
    val sw = maxOf(1, (w * scale).toInt())
    val sh = maxOf(1, (h * scale).toInt())

    var sample = sampleBitmap
    if (sample == null || sample.width != sw || sample.height != sh) {
      sample?.recycle()
      sample = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
      sampleBitmap = sample
    }

    // 软件离屏采样：绝不对 backdrop 调用硬件录制，避免 RenderNode 重入崩溃
    val sCanvas = Canvas(sample)
    sCanvas.setMatrix(Matrix())
    sCanvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    sCanvas.translate(dx * scale, dy * scale)
    sCanvas.scale(scale, scale)
    try {
      backdrop.draw(sCanvas)
    } catch (e: Exception) {
      // 极少数子视图（视频/地图等）在软件画布下绘制可能抛错，降级为兜底冷白
      sample.eraseColor(Color.argb(28, 255, 255, 255))
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // API31+：GPU RenderEffect 高斯模糊（作用于降采样图，再放大贴回）
      drawBlurredViaRenderEffect(canvas, sample!!, blurPx * scale, w, h)
    } else {
      // 旧机型：3 趟盒式模糊近似高斯
      val radius = maxOf(1, (blurPx * scale).toInt())
      val blurred = boxBlur(sample!!, radius)
      canvas.drawBitmap(blurred, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), blurPaint)
      // 回收上一帧的临时模糊图，复用当前帧
      blurredBitmap?.recycle()
      blurredBitmap = blurred
    }
  }

  /**
   * API31+：把降采样样本绘制到「我们自己的」离屏 [RenderNode] 并施加 GPU [RenderEffect]
   * 高斯模糊，再将其放大贴回玻璃画布。这里操作的是独立离屏节点 + 一张静态 Bitmap，
   * 与 backdrop 的 RenderNode 完全无关，因此不会重入录制、不会闪退。
   */
  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun getGlassShader(): RuntimeShader? {
    if (glassShader == null) {
      // 编译失败（AGSL 语法/驱动问题）时降级为 null，调用方退化为纯模糊，绝不崩溃
      glassShader = try {
        RuntimeShader(GLASS_AGSL)
      } catch (_: Throwable) {
        null
      }
    }
    return glassShader as? RuntimeShader
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun buildGlassChainEffect(blurPx: Float, w: Int, h: Int): RenderEffect {
    val blur = RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
    val shader = getGlassShader() ?: return blur
    // 折射强度随玻璃较小边成比例（像素），色散随 enableChromaticAberration / aberrationIntensity
    val lens = (minOf(w, h) * 0.08f).coerceIn(6f, 40f)
    val aberr = if (enableChromaticAberration) aberrationIntensity.coerceAtLeast(0f) * 1.5f else 0f
    shader.setFloatUniform("iResolution", w.toFloat(), h.toFloat())
    shader.setFloatUniform("iCorner", cornerRadius)
    shader.setFloatUniform("iLens", lens)
    shader.setFloatUniform("iAberration", aberr)
    shader.setFloatUniform("iVibrancy", 1.15f)
    val material = RenderEffect.createRuntimeShaderEffect(shader, "content")
    // 先跑 blur（作为 content 输入），再跑透镜着色器
    return RenderEffect.createChainEffect(material, blur)
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun drawBlurredViaRenderEffect(
    canvas: Canvas,
    sample: Bitmap,
    blurPx: Float,
    w: Int,
    h: Int
  ) {
    var node = renderNode as? RenderNode
    if (node == null || node.width != w || node.height != h) {
      node = RenderNode("liquidGlassBlur")
      node.setPosition(0, 0, w, h)
      renderNode = node
    }
    val n = node!!
    val rnCanvas = n.beginRecording(w, h)
    rnCanvas.drawBitmap(sample, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), blurPaint)
    n.endRecording()

    // API33+：模糊 → AGSL 透镜（折射 / 色散）；低于 33 仅纯模糊
    val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      buildGlassChainEffect(blurPx, w, h)
    } else {
      RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
    }
    n.setRenderEffect(effect)
    canvas.drawRenderNode(n)
    n.setRenderEffect(null)
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
