import { useMemo } from 'react';

import {
  useBarBlur,
  useCustomBarGlass,
  useCustomControlGlass,
  useCustomSliderLook,
  useDesignStyle,
  useLiquidGlass,
  type GlassKind,
} from '@/features/settings/store';
import { isNativeAvailable } from '@/features/android/native';

/**
 * 设计风格统一解析：
 * - apple：全液态玻璃（原生 LiquidGlassSurface，降级 BlurView）+ 平滑滑杆；
 * - material（安卓 17 / M3 Expressive）：全毛玻璃 + 波浪「毛毛虫」进度；
 * - custom：控件材质 / 底栏材质 / 滑杆样式三项独立混搭。
 */
export type DesignSpec = {
  /** 按钮/开关/选项卡等小控件材质。 */
  controlGlass: GlassKind;
  /** 顶栏/底栏/迷你播放器材质。 */
  barGlass: GlassKind;
  /** 滑杆是否使用 M3E 波浪「毛毛虫」形态。 */
  wavySlider: boolean;
  /** 原生液态玻璃当前是否真实可用（Android + 已预构建）。 */
  liquidReady: boolean;
};

export function resolveDesignSpec(
  style: 'apple' | 'material' | 'custom',
  controlGlass: GlassKind,
  barGlass: GlassKind,
  sliderLook: 'wavy' | 'smooth',
  liquidEnabled: boolean
): DesignSpec {
  const liquidReady = isNativeAvailable() && liquidEnabled;
  if (style === 'material') {
    // M3 Expressive 本意是毛玻璃，但 Android 端 expo-blur 默认没有真实模糊
    // （只有一层半透明色调，观感是「一块灰」）。原生液态玻璃可用时直接用
    // KSU 风格玻璃，不可用才退回 BlurView 毛玻璃。
    return {
      controlGlass: liquidReady ? 'liquid' : 'frost',
      barGlass: liquidReady ? 'liquid' : 'frost',
      wavySlider: true,
      liquidReady,
    };
  }
  if (style === 'custom') {
    return {
      controlGlass: controlGlass,
      barGlass: barGlass,
      wavySlider: sliderLook === 'wavy',
      liquidReady,
    };
  }
  return {
    controlGlass: liquidReady ? 'liquid' : 'frost',
    barGlass: liquidReady ? 'liquid' : 'frost',
    wavySlider: false,
    liquidReady,
  };
}

/** 响应式读取当前生效的设计规格。 */
export function useDesignSpec(): DesignSpec {
  const style = useDesignStyle();
  const controlGlass = useCustomControlGlass();
  const barGlass = useCustomBarGlass();
  const sliderLook = useCustomSliderLook();
  const liquidEnabled = useLiquidGlass();
  const barBlur = useBarBlur();

  return useMemo(() => {
    const spec = resolveDesignSpec(style, controlGlass, barGlass, sliderLook, liquidEnabled);
    // 全局「顶栏/底栏模糊」总开关关闭时，把毛玻璃降级为素面（液态玻璃不受此开关约束）。
    if (!barBlur) {
      if (spec.barGlass === 'frost') {
        spec.barGlass = 'plain';
      }
    }
    return spec;
  }, [style, controlGlass, barGlass, sliderLook, liquidEnabled, barBlur]);
}
