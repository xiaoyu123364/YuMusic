package expo.modules.moekoenative

import android.content.Context
import android.graphics.*
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import kotlin.math.max

private const val RoundedRectSDF = """
float radiusAt(float2 coord, float4 radii) {
    if (coord.x >= 0.0) {
        if (coord.y <= 0.0) return radii.y;
        else return radii.z;
    } else {
        if (coord.y <= 0.0) return radii.x;
        else return radii.w;
    }
}

float sdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

float2 gradSdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(coord) * normalize(max(cornerCoord, 0.0));
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * float2(gradX, 1.0 - gradX);
    }
}"""

private const val RoundedRectRefractionShaderString = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;

$RoundedRectSDF

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(coord, cornerRadii);
    
    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);
    
    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));
    
    float2 refractedCoord = coord + d * grad;
    return content.eval(refractedCoord);
}"""

private const val RoundedRectRefractionWithDispersionShaderString = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;
uniform float chromaticAberration;

$RoundedRectSDF

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(coord, cornerRadii);
    
    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);
    
    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));
    
    float2 refractedCoord = coord + d * grad;
    float dispersionIntensity = chromaticAberration * ((centeredCoord.x * centeredCoord.y) / (halfSize.x * halfSize.y));
    float2 dispersedCoord = d * grad * dispersionIntensity;
    
    half4 color = half4(0.0);
    
    half4 red = content.eval(refractedCoord + dispersedCoord);
    color.r += red.r / 3.5;
    color.a += red.a / 7.0;
    
    half4 orange = content.eval(refractedCoord + dispersedCoord * (2.0 / 3.0));
    color.r += orange.r / 3.5;
    color.g += orange.g / 7.0;
    color.a += orange.a / 7.0;
    
    half4 yellow = content.eval(refractedCoord + dispersedCoord * (1.0 / 3.0));
    color.r += yellow.r / 3.5;
    color.g += yellow.g / 3.5;
    color.a += yellow.a / 7.0;
    
    half4 green = content.eval(refractedCoord);
    color.g += green.g / 3.5;
    color.a += green.a / 7.0;
    
    half4 cyan = content.eval(refractedCoord - dispersedCoord * (1.0 / 3.0));
    color.g += cyan.g / 3.5;
    color.b += cyan.b / 3.0;
    color.a += cyan.a / 7.0;
    
    half4 blue = content.eval(refractedCoord - dispersedCoord * (2.0 / 3.0));
    color.b += blue.b / 3.0;
    color.a += blue.a / 7.0;
    
    half4 purple = content.eval(refractedCoord - dispersedCoord);
    color.r += purple.r / 7.0;
    color.b += purple.b / 3.0;
    color.a += purple.a / 7.0;
    
    return color;
}"""

private const val DefaultHighlightShaderString = """
uniform float2 size;
uniform float4 cornerRadii;
layout(color) uniform half4 color;
uniform float angle;
uniform float falloff;

$RoundedRectSDF

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = coord - halfSize;
    float radius = radiusAt(coord, cornerRadii);
    
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = gradSdRoundedRect(centeredCoord, halfSize, gradRadius);
    float2 normal = float2(cos(angle), sin(angle));
    float d = dot(grad, normal);
    float intensity = pow(abs(d), falloff);
    return color * intensity;
}"""

class LiquidGlassSurfaceView(context: Context) : View(context) {

    private var backdropTarget: View? = null

    private var cornerRadius: Float = 0f
    private var refractionHeight: Float = 24f * resources.displayMetrics.density
    private var refractionAmount: Float = -0.5f
    private var blurAmount: Float = 0f
    private var chromaticAberration: Float = 0f
    private var depthEffect: Boolean = true
    private var surfaceTintColor: Int = Color.TRANSPARENT
    private var surfaceTintAlpha: Float = 0f
    private var enableHighlight: Boolean = true
    private var highlightAngle: Float = 0f
    private var highlightFalloff: Float = 1f

    private var downscaleFactor = 0.25f

    private var bgBitmap: Bitmap? = null
    private var bgCanvas: Canvas? = null
    private val location = IntArray(2)
    private val backdropLocation = IntArray(2)
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val tintPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.5f * resources.displayMetrics.density
        color = Color.parseColor("#40FFFFFF")
    }
    private val path = Path()

    private var renderNode: Any? = null 

    private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
        if (visibility == VISIBLE && isAttachedToWindow && width > 0 && height > 0) {
            invalidate()
        }
        true
    }

    init {
        setWillNotDraw(false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            renderNode = RenderNode("GlassSurface")
        }
    }

    fun setCornerRadius(value: Float) { cornerRadius = value; invalidate() }
    fun setRefractionHeight(value: Float) { refractionHeight = value; invalidate() }
    fun setRefractionAmount(value: Float) { refractionAmount = value; invalidate() }
    fun setBlurAmount(value: Float) { blurAmount = value; invalidate() }
    fun setChromaticAberration(value: Float) { chromaticAberration = value; invalidate() }
    fun setDepthEffect(enabled: Boolean) { depthEffect = enabled; invalidate() }
    fun setSurfaceTintColor(value: Int) { surfaceTintColor = value; invalidate() }
    fun setSurfaceTintAlpha(value: Float) { surfaceTintAlpha = value; invalidate() }
    fun setEnableHighlight(value: Boolean) { enableHighlight = value; invalidate() }
    fun setHighlightAngle(value: Float) { highlightAngle = value; invalidate() }
    fun setHighlightFalloff(value: Float) { highlightFalloff = value; invalidate() }
    fun bindBackdrop(view: View) { 
        backdropTarget = view 
        setupListeners()
        invalidate() 
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        setupListeners()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        viewTreeObserver.removeOnPreDrawListener(preDrawListener)
        bgBitmap?.recycle()
        bgBitmap = null
        bgCanvas = null
    }
    
    private fun setupListeners() {
        viewTreeObserver.removeOnPreDrawListener(preDrawListener)
        viewTreeObserver.addOnPreDrawListener(preDrawListener)
    }

    private fun prepareBitmap(w: Int, h: Int) {
        val bw = max(1, (w * downscaleFactor).toInt())
        val bh = max(1, (h * downscaleFactor).toInt())
        if (bgBitmap == null || bgBitmap?.width != bw || bgBitmap?.height != bh) {
            bgBitmap?.recycle()
            bgBitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
            bgCanvas = Canvas(bgBitmap!!)
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        path.reset()
        if (w > 0 && h > 0) {
            path.addRoundRect(0f, 0f, w.toFloat(), h.toFloat(), cornerRadius, cornerRadius, Path.Direction.CW)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        try {
            val target = backdropTarget ?: rootView
            if (width <= 0 || height <= 0 || target == null || target.width <= 0 || target.height <= 0) {
                drawFallback(canvas)
                return
            }

            getLocationInWindow(location)
            target.getLocationInWindow(backdropLocation)

            val dx = location[0] - backdropLocation[0]
            val dy = location[1] - backdropLocation[1]

            prepareBitmap(width, height)
            val bmp = bgBitmap ?: run { drawFallback(canvas); return }
            val cv = bgCanvas ?: run { drawFallback(canvas); return }
            
            cv.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
            cv.save()
            cv.scale(downscaleFactor, downscaleFactor)
            cv.translate(-dx.toFloat(), -dy.toFloat())
            
            try {
                target.draw(cv)
            } catch (_: Throwable) {
                // 忽略子视图采样异常
            }
            cv.restore()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                try {
                    val shaderString = if (chromaticAberration > 0f) RoundedRectRefractionWithDispersionShaderString else RoundedRectRefractionShaderString
                    val runtimeShader = RuntimeShader(shaderString).apply {
                        setFloatUniform("size", width.toFloat(), height.toFloat())
                        setFloatUniform("offset", 0f, 0f)
                        setFloatUniform("cornerRadii", cornerRadius, cornerRadius, cornerRadius, cornerRadius)
                        setFloatUniform("refractionHeight", refractionHeight)
                        setFloatUniform("refractionAmount", refractionAmount)
                        setFloatUniform("depthEffect", if (depthEffect) 1f else 0f)
                        if (chromaticAberration > 0f) {
                            setFloatUniform("chromaticAberration", chromaticAberration)
                        }
                    }

                    val glassEffect = RenderEffect.createRuntimeShaderEffect(runtimeShader, "content")
                    val chainEffect = if (blurAmount > 0f) {
                        val blurEffect = RenderEffect.createBlurEffect(blurAmount, blurAmount, Shader.TileMode.CLAMP)
                        RenderEffect.createChainEffect(glassEffect, blurEffect)
                    } else {
                        glassEffect
                    }
                    
                    paint.shader = BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
                        val matrix = Matrix()
                        matrix.postScale(1f / downscaleFactor, 1f / downscaleFactor)
                        setLocalMatrix(matrix)
                    }
                    
                    val rn = (renderNode as? RenderNode) ?: RenderNode("GlassSurface").also { renderNode = it }
                    rn.setPosition(0, 0, width, height)
                    val rc = rn.beginRecording()
                    rc.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
                    rn.endRecording()
                    rn.setRenderEffect(chainEffect)
                    canvas.drawRenderNode(rn)
                } catch (_: Throwable) {
                    drawFallback(canvas)
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    val blurEffect = RenderEffect.createBlurEffect(max(1f, blurAmount), max(1f, blurAmount), Shader.TileMode.CLAMP)
                    paint.shader = BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
                        val matrix = Matrix()
                        matrix.postScale(1f / downscaleFactor, 1f / downscaleFactor)
                        setLocalMatrix(matrix)
                    }
                    val rn = (renderNode as? RenderNode) ?: RenderNode("GlassSurface").also { renderNode = it }
                    rn.setPosition(0, 0, width, height)
                    val rc = rn.beginRecording()
                    rc.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
                    rn.endRecording()
                    rn.setRenderEffect(blurEffect)
                    canvas.drawRenderNode(rn)
                } catch (_: Throwable) {
                    drawFallback(canvas)
                }
            } else {
                paint.shader = BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
                    val matrix = Matrix()
                    matrix.postScale(1f / downscaleFactor, 1f / downscaleFactor)
                    setLocalMatrix(matrix)
                }
                canvas.drawPath(path, paint)
            }

            if (surfaceTintAlpha > 0f) {
                tintPaint.color = surfaceTintColor
                tintPaint.alpha = (surfaceTintAlpha.coerceIn(0f, 1f) * 255).toInt()
                canvas.drawPath(path, tintPaint)
            }
            
            canvas.drawPath(path, borderPaint)

            if (enableHighlight && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                try {
                    val highlightShader = RuntimeShader(DefaultHighlightShaderString).apply {
                        setFloatUniform("size", width.toFloat(), height.toFloat())
                        setFloatUniform("cornerRadii", cornerRadius, cornerRadius, cornerRadius, cornerRadius)
                        setFloatUniform("color", 1f, 1f, 1f, 0.45f)
                        setFloatUniform("angle", highlightAngle)
                        setFloatUniform("falloff", highlightFalloff)
                    }
                    highlightPaint.shader = highlightShader
                    canvas.drawPath(path, highlightPaint)
                } catch (_: Throwable) {
                    // 忽略高光渲染异常
                }
            }
        } catch (_: Throwable) {
            drawFallback(canvas)
        }
    }

    private fun drawFallback(canvas: Canvas) {
        val fallbackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = if (surfaceTintAlpha > 0f) surfaceTintColor else Color.parseColor("#1AFFFFFF")
        }
        canvas.drawPath(path, fallbackPaint)
        canvas.drawPath(path, borderPaint)
    }
}
