package expo.modules.moekoenative

import android.content.Context
import android.view.View

/**
 * 页面内容锚点注册表：解决「玻璃找不到 backdrop」的跨架构难题。
 *
 * 背景：旧链路 JS findNodeHandle → 原生 appContext.findView(tag) 在 React Native
 * 新架构（Fabric）下经常解析失败，玻璃拿不到采样源，退化成隐形/纯色块。
 *
 * 方案：反转方向——JS 在页面内容容器内挂一个原生 [BackdropAnchorView]，
 * 它 attach 时把自己注册进这里；玻璃 attach 时直接从注册表取锚点。
 * 整个解析发生在原生 attach 链路里，不依赖任何 tag 查找，新架构下稳定可靠。
 */
object GlassBackdropRegistry {

  @Volatile
  private var anchorRef: java.lang.ref.WeakReference<View>? = null

  @Synchronized
  fun attach(view: View) {
    anchorRef = java.lang.ref.WeakReference(view)
  }

  @Synchronized
  fun detach(view: View) {
    if (anchorRef?.get() === view) {
      anchorRef = null
    }
  }

  /** 当前存活且已布局的锚点；没有则 null。 */
  fun current(): View? {
    val v = anchorRef?.get() ?: return null
    return if (v.isAttachedToWindow && v.width > 0 && v.height > 0) v else null
  }
}

/**
 * 页面内容锚点：由 JS 的 LiquidGlassBackdrop 以 absoluteFill 方式挂在
 * 页面内容容器内（pointerEvents=none，零视觉）。attach 即注册，detach 即注销。
 */
class BackdropAnchorView(context: Context) : View(context) {

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    GlassBackdropRegistry.attach(this)
  }

  override fun onDetachedFromWindow() {
    GlassBackdropRegistry.detach(this)
    super.onDetachedFromWindow()
  }
}
