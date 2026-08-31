package expo.modules.moekoenative

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.widget.FrameLayout
import java.lang.ref.WeakReference
import java.util.WeakHashMap

object GlassBackdropRegistry {
    private val backdrops = WeakHashMap<Int, WeakReference<View>>()

    fun register(id: Int, view: View) {
        backdrops[id] = WeakReference(view)
    }

    fun unregister(id: Int) {
        backdrops.remove(id)
    }

    fun find(id: Int): View? {
        return backdrops[id]?.get()
    }
}

class BackdropAnchorView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        (parent as? View)?.let {
            GlassBackdropRegistry.register(id, it)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        GlassBackdropRegistry.unregister(id)
    }
    
    companion object {
        fun findBackdrop(id: Int): View? {
            return GlassBackdropRegistry.find(id)
        }
    }
}
