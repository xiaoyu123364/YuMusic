import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedProps,
  interpolateColor,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

import { MiniPlayer } from '@/components/ui/mini-player';
import { LiquidGlassBackdrop, LiquidGlassSurface, useBackdropTargetId } from '@/components/ui/liquid-glass';
import { GlassPanel } from '@/components/ui/glass';
import { DockGap, TabBarHeight } from '@/constants/layout';
import { useBarBlur, useLiquidGlass } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

const TAB_META: Record<string, { glyph: 'home' | 'compass' | 'person'; label: string }> = {
  index: { glyph: 'home', label: '首页' },
  discover: { glyph: 'compass', label: '发现' },
  me: { glyph: 'person', label: '我的' },
};

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

import { triggerHaptic } from '@/lib/haptics';
import type { SharedValue } from 'react-native-reanimated';

function TabItem({
  route,
  index,
  state,
  navigation,
  tabWidth,
  indicatorPosition,
  isPressed,
}: {
  route: any;
  index: number;
  state: any;
  navigation: any;
  tabWidth: number;
  indicatorPosition: SharedValue<number>;
  isPressed: SharedValue<boolean>;
}) {
  const palette = usePalette();
  const meta = TAB_META[route.name];
  const scale = useSharedValue(1);

  if (!meta) return null;

  const focused = state.index === index;

  const progress = useDerivedValue(() => {
    const distance = Math.abs(indicatorPosition.value - index * tabWidth);
    return Math.max(0, 1 - distance / tabWidth);
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(
        progress.value,
        [0, 1],
        [palette.textSecondary, '#0088FF']
      ) as string,
      fontWeight: progress.value > 0.5 ? '700' : '500',
    };
  });

  const handlePressIn = () => {
    isPressed.value = true;
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    isPressed.value = false;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      triggerHaptic();
      navigation.navigate(route.name);
    }
  };

  return (
    <Pressable
      key={route.key}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ width: tabWidth, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.item, animatedStyle]}>
        <Ionicons
          name={focused ? meta.glyph : (`${meta.glyph}-outline` as const)}
          size={26}
          color={focused ? '#0088FF' : palette.textSecondary}
        />
        <Animated.Text style={[styles.label, animatedTextStyle]}>
          {meta.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/** Kyant0 原版 1:1 物理液态玻璃 Dock 栏（LiquidBottomTabs） */
function FloatingGlassTabBar({
  state,
  navigation,
  backdropTargetId,
}: TabBarProps & { backdropTargetId: number | null }) {
  const palette = usePalette();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const barBlur = useBarBlur();
  const liquidGlass = useLiquidGlass();
  const { width } = useWindowDimensions();

  // Kyant0 官方规范：两边各 padding 36dp，最大宽度 320dp
  const tabBarWidth = Math.min(width - 72, 320);
  const numTabs = state.routes.length;
  const tabWidth = (tabBarWidth - 8) / numTabs; // 除去左右 4dp padding

  const indicatorPosition = useSharedValue(state.index * tabWidth);
  const isDragging = useSharedValue(false);
  const isPressed = useSharedValue(false);
  const velocityX = useSharedValue(0);
  const panelOffset = useSharedValue(0);

  useEffect(() => {
    if (!isDragging.value && tabWidth > 0) {
      indicatorPosition.value = withSpring(state.index * tabWidth, {
        damping: 14,
        stiffness: 220,
        mass: 0.7,
      });
    }
  }, [state.index, tabWidth]);

  const navigateToTab = (index: number) => {
    const route = state.routes[index];
    if (route) {
      navigation.navigate(route.name);
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-30, 30])
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      isDragging.value = true;
      isPressed.value = true;
      runOnJS(triggerHaptic)();
    })
    .onChange((event) => {
      const newPos = indicatorPosition.value + event.changeX;
      const maxPos = tabWidth * (numTabs - 1);
      indicatorPosition.value = Math.max(0, Math.min(newPos, maxPos));
      panelOffset.value = (event.translationX / tabBarWidth) * 8;
      velocityX.value = withSpring(event.velocityX, { damping: 18, stiffness: 200 });
    })
    .onFinalize(() => {
      isDragging.value = false;
      isPressed.value = false;
      velocityX.value = withSpring(0, { damping: 12, stiffness: 240 });
      panelOffset.value = withSpring(0, { damping: 14, stiffness: 220, mass: 0.7 });
      const nearestIndex = Math.max(0, Math.min(numTabs - 1, Math.round(indicatorPosition.value / tabWidth)));
      runOnJS(navigateToTab)(nearestIndex);
      runOnJS(triggerHaptic)();
      indicatorPosition.value = withSpring(nearestIndex * tabWidth, {
        damping: 13,
        stiffness: 240,
        mass: 0.6,
      });
    });

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    // Kyant0 原版按压放大 78dp / 56dp = 1.393x，突破 64dp 底栏外框
    const baseScale = withSpring(isPressed.value ? 1.393 : 1.0, {
      damping: 12,
      stiffness: 260,
      mass: 0.6,
    });
    // Kyant0 水滴 Squash & Stretch 物理拉伸
    const stretch = Math.min(0.24, Math.abs(velocityX.value) / 2800);
    const scaleX = baseScale * (1 + stretch);
    const scaleY = baseScale * (1 - stretch * 0.6);
    return {
      transform: [
        { translateX: indicatorPosition.value },
        { scaleX },
        { scaleY },
      ],
    };
  });

  const animatedPanelStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: panelOffset.value }],
    };
  });

  return (
    <View
      style={[
        styles.tabBarWrap,
        {
          bottom: insets.bottom + (Platform.OS === 'ios' ? 0 : 16),
          width: tabBarWidth,
          marginLeft: (width - tabBarWidth) / 2,
        },
      ]}
      pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.card,
            {
              height: 64,
              padding: 4,
            },
            animatedPanelStyle,
          ]}>
          {/* Layer 1: Kyant0 底栏独立背景圆角胶囊 (64dp, radius 32dp) */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 32,
                overflow: 'hidden',
                backgroundColor: liquidGlass
                  ? (isDark ? 'rgba(18, 18, 18, 0.40)' : 'rgba(250, 250, 250, 0.40)')
                  : palette.barSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.4 : 0.12,
                shadowRadius: 16,
                elevation: 10,
              },
            ]}>
            {liquidGlass ? (
              <LiquidGlassSurface radius={32} backdropTargetId={backdropTargetId} />
            ) : (
              <BlurView
                intensity={barBlur ? 75 : 0}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>

          {/* Layer 2: Kyant0 1:1 悬浮水滴物理滑块（56dp, radius 28dp, 突破放大 1.393x） */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 4,
                left: 4,
                width: tabWidth,
                height: 56,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              },
              animatedIndicatorStyle,
            ]}>
            <View
              style={{
                width: tabWidth,
                height: 56,
                borderRadius: 28,
                overflow: 'hidden',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.92)',
                borderWidth: 1.5,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.60)' : 'rgba(255, 255, 255, 0.98)',
                shadowColor: palette.accent,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.40,
                shadowRadius: 12,
                elevation: 8,
              }}>
              <GlassPanel
                kind="liquid"
                variant="control"
                radius={28}
              />
            </View>
          </Animated.View>

          {/* Layer 3: 单层前景 TabItem (高度 56dp) */}
          <View style={styles.row}>
            {state.routes.map((route, index) => (
              <TabItem
                key={route.key}
                route={route}
                index={index}
                state={state}
                navigation={navigation}
                tabWidth={tabWidth}
                indicatorPosition={indicatorPosition}
                isPressed={isPressed}
              />
            ))}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const backdropTargetId = useBackdropTargetId();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const dockWidth = Math.min(width - 16 * 2, 680);
  const floatingTabOffset = Platform.OS === 'ios' ? 0 : 16;

  return (
    <LiquidGlassBackdrop>
      <View style={styles.root}>
        <View style={{ flex: 1 }}>
          <Tabs
            tabBar={(props) => (
              <FloatingGlassTabBar {...props} backdropTargetId={backdropTargetId} />
            )}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: palette.background },
            }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="discover" />
            <Tabs.Screen name="me" />
          </Tabs>
        </View>

        {keyboardVisible ? null : (
          <View
            pointerEvents="box-none"
            style={[
              styles.dock,
              {
                bottom: insets.bottom + 64 + DockGap + floatingTabOffset,
                width: dockWidth,
                marginLeft: (width - dockWidth) / 2,
              },
            ]}>
            <MiniPlayer />
          </View>
        )}
      </View>
    </LiquidGlassBackdrop>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBarWrap: {
    position: 'absolute',
  },
  card: {
    overflow: 'visible',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    zIndex: 1, // Ensure tabs receive touches above indicator
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  dock: {
    position: 'absolute',
    left: 0,
  },
});

