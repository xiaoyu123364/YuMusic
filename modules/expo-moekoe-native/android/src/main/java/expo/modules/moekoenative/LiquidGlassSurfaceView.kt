package expo.modules.moekoenative

import android.content.Context
import android.widget.FrameLayout
import com.example.liquidglass.BlurMethod
import com.example.liquidglass.GlassMaterial
import com.example.liquidglass.LiquidGlassView

/**
 * 包装 QWEA0/Liquid-Glass-Android 的 LiquidGlassView（iOS 26 液态玻璃）：
 * SDF 折射 + 色散 + 传感器高光 + 触摸弹性。minSdk 24（经典管线），
 * API 33+ 自动切 AGSL 透镜管线（完整折射/色散）。
 *
 * 注意：LiquidGlassView 是 Kotlin 的 final 类，无法继承，因此用「组合」模式——
 * 本类继承 FrameLayout，内部 addView 一个 LiquidGlassView 并转发属性。
 * QWEA0 库是 Kotlin 编译的，属性必须用 Kotlin 属性语法（xxx = v）而非 setXxx(v)。
 *
 * 采样源通过 [bindBackdrop] 显式指定为「页面内容容器」（不含玻璃自身），
 * 避免把玻璃采样进自身导致递归（QmDeve 曾因此闪退）。
 */
class LiquidGlassSurfaceView(context: Context) : FrameLayout(context) {

  private val glassView = LiquidGlassView(context, null, 0)

  init {
    addView(
      glassView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    // 关键：背景/玻璃会随页面滚动变化，必须开启动态采样，否则只捕获一帧。
    glassView.enableDynamicBackground = true
    // 防御性：禁用 GPU 管线（AGSL 透镜 / RuntimeShader 硬件模糊）与传感器/自适应染色，
    // 强制走稳定的 CPU 经典管线（C++ NEON 模糊 + 色差），避免部分设备 GPU 管线崩溃闪退。
    glassView.useShaderPipeline = false
    glassView.useHardwareBlurWhenPossible = false
    glassView.enableSensorHighlight = false
    glassView.enableAdaptiveTint = false
    glassView.material = GlassMaterial.REGULAR
    glassView.blurMethod = BlurMethod.SMART
    glassView.enableBackdropBlur = true
    glassView.enableEdgeHighlight = true
    glassView.enablePressEffect = true
    glassView.enableChromaticAberration = true
    // 经典管线参数
    glassView.blurAmount = 0.08f
    glassView.saturation = 140f
    glassView.aberrationIntensity = 2f
    glassView.displacementScale = 60f
    glassView.elasticity = 0.15f
  }

  /** 把采样源绑定到指定原生 View（页面内容容器），并确保动态采样开启。 */
  fun bindBackdrop(target: android.view.View) {
    glassView.backdropSource = target
    glassView.enableDynamicBackground = true
  }

  // ---- 属性转发 ----
  fun setCornerRadius(value: Float) { glassView.cornerRadius = value }
  fun setRefractionHeight(value: Float) { glassView.refractionHeight = value }
  fun setBevelWidth(value: Float) { glassView.bevelWidth = value }
  fun setDispersionStrength(value: Float) { glassView.dispersionStrength = value }
  fun setBlurAmount(value: Float) { glassView.blurAmount = value }
  fun setSaturation(value: Float) { glassView.saturation = value }
  fun setAberrationIntensity(value: Float) { glassView.aberrationIntensity = value }
  fun setDisplacementScale(value: Float) { glassView.displacementScale = value }
  fun setElasticity(value: Float) { glassView.elasticity = value }
  fun setEnableSensorHighlight(value: Boolean) { glassView.enableSensorHighlight = value }
  fun setEnableAdaptiveTint(value: Boolean) { glassView.enableAdaptiveTint = value }
  fun setEnablePressEffect(value: Boolean) { glassView.enablePressEffect = value }
  fun setEnableChromaticAberration(value: Boolean) { glassView.enableChromaticAberration = value }
  fun setEnableEdgeHighlight(value: Boolean) { glassView.enableEdgeHighlight = value }
}
