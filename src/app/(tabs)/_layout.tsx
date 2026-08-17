import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MiniPlayer } from '@/components/ui/mini-player';
import { BackdropContext, LiquidGlassSurface } from '@/components/ui/liquid-glass';
import {
  DockGap,
  TabBarBottomInset,
  TabBarHeight,
  TabBarSideMargin,
} from '@/constants/layout';
import { useBarBlur, useFloatingBar, useLiquidGlass } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

const TAB_META: Record<string, { glyph: 'home' | 'compass' | 'person'; label: string }> = {
  index: { glyph: 'home', label: '首页' },
  discover: { glyph: 'compass', label: '发现' },
  me: { glyph: 'person', label: '我的' },
};

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** 悬浮液态玻璃底栏：单色线稿图标、无遮罩圆圈、激活仅图标与文字高亮。 */
function FloatingGlassTabBar({
  state,
  navigation,
  backdropTargetId,
}: TabBarProps & { backdropTargetId: number | null }) {
  const palette = usePalette();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const barBlur = useBarBlur();
  const floatingBar = useFloatingBar();
  const liquidGlass = useLiquidGlass();

  const radius = floatingBar ? 28 : 0;

  // 液态玻璃物理拖拽：水平拖拽带阻尼位移 + 轻微倾斜，松手弹性回弹。
  const dragX = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onUpdate((event) => {
      dragX.value = event.translationX * 0.55;
    })
    .onEnd(() => {
      dragX.value = withSpring(0, { damping: 15, stiffness: 200 });
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { rotate: `${dragX.value / 60}deg` },
      { scale: 1 - Math.min(Math.abs(dragX.value) / 600, 0.03) },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.tabBarWrap,
          dragStyle,
          floatingBar
            ? {
                left: TabBarSideMargin,
                right: TabBarSideMargin,
                bottom: insets.bottom + TabBarBottomInset,
                borderRadius: radius,
              }
            : { left: 0, right: 0, bottom: 0 },
        ]}
        pointerEvents="box-none">
        <View
          style={[
            styles.card,
            {
              height: TabBarHeight,
              borderRadius: radius,
              backgroundColor: palette.barSurface,
              borderColor: liquidGlass ? palette.barBorder : palette.border,
            },
          ]}>
          {liquidGlass ? (
            <LiquidGlassSurface radius={radius} backdropTargetId={backdropTargetId} />
          ) : (
            <BlurView
              intensity={barBlur ? 75 : 0}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          )}

          <View style={styles.row}>
          {state.routes.map((route, index) => {
            const meta = TAB_META[route.name];
            if (!meta) return null;
            const focused = state.index === index;
            const tint = focused ? palette.accent : palette.textTertiary;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
                <Ionicons
                  name={focused ? meta.glyph : (`${meta.glyph}-outline` as const)}
                  size={22}
                  color={tint}
                />
                <RNText
                  style={[styles.label, { color: tint }, focused && styles.labelFocused]}>
                  {meta.label}
                </RNText>
              </Pressable>
            );
          })}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const backdropRef = useRef<View>(null);
  const [backdropTargetId, setBackdropTargetId] = useState<number | null>(null);

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

  // 把页面内容容器的 native handle 传给液态玻璃作为采样源（避开玻璃自身，避免递归）。
  useEffect(() => {
    const id = findNodeHandle(backdropRef.current);
    if (id != null) {
      setBackdropTargetId(id);
    }
  }, []);

  const dockWidth = Math.min(width - TabBarSideMargin * 2, 680);

  return (
    <BackdropContext.Provider value={backdropTargetId}>
      <View style={styles.root}>
        <View ref={backdropRef} collapsable={false} style={{ flex: 1 }}>
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
                bottom: insets.bottom + TabBarBottomInset + TabBarHeight + DockGap,
                width: dockWidth,
                marginLeft: (width - dockWidth) / 2,
              },
            ]}>
            <MiniPlayer backdropTargetId={backdropTargetId} />
          </View>
        )}
      </View>
    </BackdropContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBarWrap: {
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 14,
  },
  card: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  itemPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  labelFocused: {
    fontWeight: '700',
  },
  dock: {
    position: 'absolute',
    left: 0,
  },
});
