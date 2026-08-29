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

const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);

function TabItem({
  route,
  index,
  state,
  navigation,
  tabWidth,
  indicatorPosition,
}: {
  route: any;
  index: number;
  state: any;
  navigation: any;
  tabWidth: number;
  indicatorPosition: SharedValue<number>;
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
        [palette.textSecondary, palette.accent]
      ) as string,
      fontWeight: progress.value > 0.5 ? '700' : '500',
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
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
      style={{ width: tabWidth, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.item, animatedStyle]}>
        <Ionicons
          name={focused ? meta.glyph : (`${meta.glyph}-outline` as const)}
          size={24}
          color={focused ? palette.accent : palette.textSecondary}
        />
        <Animated.Text style={[styles.label, animatedTextStyle]}>
          {meta.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/** Apple Music 式底部导航栏：全宽半透明材质、49pt 内容高、顶部发丝线、图标+小标签。 */
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

  const TAB_BAR_MARGIN = 36;
  const tabBarWidth = Math.min(width - TAB_BAR_MARGIN * 2, 280); // Tighter span, max width 280
  const numTabs = state.routes.length;
  const tabWidth = tabBarWidth / numTabs;

  const indicatorPosition = useSharedValue(state.index * tabWidth);
  const isDragging = useSharedValue(false);
  const isPressed = useSharedValue(false);
  const panelOffset = useSharedValue(0);

  useEffect(() => {
    if (!isDragging.value) {
      indicatorPosition.value = withSpring(state.index * tabWidth, {
        damping: 15,
        stiffness: 180,
        mass: 0.8,
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
    .onBegin(() => {
      isDragging.value = true;
      isPressed.value = true;
    })
    .onChange((event) => {
      const newPos = indicatorPosition.value + event.changeX;
      const maxPos = tabWidth * (numTabs - 1);
      indicatorPosition.value = Math.max(0, Math.min(newPos, maxPos));
      panelOffset.value = event.translationX * 0.08;
    })
    .onFinalize(() => {
      isDragging.value = false;
      isPressed.value = false;
      panelOffset.value = withSpring(0, { damping: 15, stiffness: 180 });
      const nearestIndex = Math.round(indicatorPosition.value / tabWidth);
      runOnJS(navigateToTab)(nearestIndex);
      runOnJS(triggerHaptic)();
      indicatorPosition.value = withSpring(nearestIndex * tabWidth, {
        damping: 15,
        stiffness: 180,
        mass: 0.8,
      });
    });

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: indicatorPosition.value },
        { scale: withSpring(isPressed.value ? 1.25 : 1.0) }
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
              backgroundColor: liquidGlass ? 'transparent' : palette.barSurface,
              borderRadius: 32,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.border,
            },
            animatedPanelStyle,
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

          {/* 滑动液态玻璃药丸指示器 */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { width: tabWidth, justifyContent: 'center', alignItems: 'center', zIndex: 0 },
              animatedIndicatorStyle,
            ]}>
            <View style={{ width: Math.min(tabWidth - 24, 72), height: 44, borderRadius: 24, overflow: 'hidden' }}>
              <GlassPanel kind="liquid" variant="control" radius={24} />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  },
                ]}
              />
            </View>
          </Animated.View>

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
    overflow: 'hidden',
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
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  dock: {
    position: 'absolute',
    left: 0,
  },
});

