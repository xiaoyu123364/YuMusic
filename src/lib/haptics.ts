/**
 * 触觉震动模块
 * 提供基于平台的震动反馈，用于交互操作
 */
import { Vibration, Platform } from 'react-native';

export function triggerHaptic(type: 'selection' | 'impact' | 'heavy' = 'selection') {
  if (Platform.OS === 'android') {
    Vibration.vibrate(type === 'heavy' ? 25 : type === 'impact' ? 14 : 6);
  }
}
