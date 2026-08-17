import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, XStack, YStack } from 'tamagui';

import { SectionHeader } from '@/components/ui/section-header';
import { EqualizerPanel } from '@/components/ui/equalizer-panel';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { showToast } from '@/components/ui/toast';
import { ACCENT_PRESETS, getPalette, type AccentPreset } from '@/constants/accents';
import { MaxContentWidth, type SchemeName } from '@/constants/theme';
import { ensureOverlayPermission } from '@/features/android/floating-lyrics';
import { isNativeAvailable } from '@/features/android/native';
import { isLoggedIn } from '@/features/account/user-api';
import { libraryActions } from '@/features/library/store';
import { settingsActions, useSettings, type ThemeMode } from '@/features/settings/store';
import { useEffectiveScheme, usePalette } from '@/hooks/use-palette';
import { clearApiSession } from '@/lib/kugou-api';

const THEME_MODE_OPTIONS = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const satisfies readonly { value: ThemeMode; label: string }[];

const REPO_URL = 'https://github.com/MoeKoeMusic/MoeKoeMusic-Mobile';
const WEBSITE_URL = 'https://music.moekoe.cn';
const DISCLAIMER = [
  '0. 本程序是酷狗第三方客户端，并非酷狗官方，需要更完善的功能请下载官方客户端体验.',
  '1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途！',
  '2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24 小时内清除使用本项目的过程中所产生的版权数据。',
  '3.由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。',
  '4. 禁止在违反当地法律法规的情况下使用本项目。对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。',
  '5. 音乐平台不易，请尊重版权，支持正版。',
  '6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。',
  '7. 分享码仅为歌曲标识（hash），不包含任何音频内容；本项目不分发、不存储任何音乐资源。',
  '8. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。',
];

function AccentSwatch({
  preset,
  scheme,
  active,
  onPress,
}: {
  preset: AccentPreset;
  scheme: SchemeName;
  active: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const presetPalette = getPalette(preset.id, scheme);

  return (
    <YStack
      alignItems="center"
      gap={6}
      transition="quickest"
      pressStyle={{ opacity: 0.7 }}
      onPress={onPress}>
      <View
        width={44}
        height={44}
        borderRadius={22}
        borderWidth={2}
        borderColor={active ? presetPalette.accent : 'transparent'}
        alignItems="center"
        justifyContent="center">
        <View
          width={34}
          height={34}
          borderRadius={17}
          backgroundColor={presetPalette.accent}
          alignItems="center"
          justifyContent="center">
          {active ? (
            <Ionicons name="checkmark" size={18} color={presetPalette.onAccent} />
          ) : null}
        </View>
      </View>
      <Text
        color={active ? palette.text : palette.textTertiary}
        fontSize={10.5}
        fontWeight={active ? '700' : '500'}>
        {preset.label}
      </Text>
    </YStack>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  const palette = usePalette();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [palette.cardAlt, palette.accent]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 18 }],
  }));

  return (
    <XStack
      height={48}
      paddingHorizontal={14}
      gap={10}
      alignItems="center"
      transition="quickest"
      pressStyle={{ opacity: 0.75 }}
      onPress={onToggle}>
      <Text flex={1} color={palette.text} fontSize={14.5} fontWeight="500">
        {label}
      </Text>
      <Animated.View
        style={[
          styles.switchTrack,
          { backgroundColor: palette.cardAlt },
          trackStyle,
        ]}>
        <Animated.View style={[styles.switchKnob, knobStyle]} />
      </Animated.View>
    </XStack>
  );
}

const OVERLAY_COLORS = [
  '#101016',
  '#FFFFFF',
  '#FF5C9E',
  '#3D8BFF',
  '#34A853',
  '#F0B429',
] as const;

const OVERLAY_TEXT_COLORS = [
  '#FFFFFF',
  '#101016',
  '#FF5C9E',
  '#3D8BFF',
  '#34A853',
] as const;

/** 颜色选择行：横向圆点，点击选中；null = 默认。 */
function ColorRow({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: readonly `#${string}`[];
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const palette = usePalette();

  return (
    <XStack height={52} paddingHorizontal={14} gap={10} alignItems="center">
      <Text flex={1} color={palette.text} fontSize={14.5} fontWeight="500">
        {label}
      </Text>
      {colors.map((color) => {
        const active = value === color;
        return (
          <XStack
            key={color}
            width={26}
            height={26}
            borderRadius={13}
            alignItems="center"
            justifyContent="center"
            borderWidth={2}
            borderColor={active ? palette.accent : 'transparent'}
            transition="quickest"
            pressStyle={{ scale: 0.88 }}
            onPress={() => onChange(active ? null : color)}>
            <View width={18} height={18} borderRadius={9} backgroundColor={color} />
          </XStack>
        );
      })}
    </XStack>
  );
}

function SettingsRow({
  label,
  value,
  danger,
  icon,
  onPress,
}: {
  label: string;
  value?: string;
  danger?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      height={48}
      paddingHorizontal={14}
      gap={10}
      transition="quickest"
      pressStyle={onPress ? { opacity: 0.65, backgroundColor: palette.cardAlt } : undefined}
      onPress={onPress}>
      <Text
        flex={1}
        color={danger ? palette.danger : palette.text}
        fontSize={14.5}
        fontWeight={danger ? '600' : '500'}
        textAlign={danger && !value && !icon ? 'center' : undefined}>
        {label}
      </Text>
      {value ? (
        <Text color={palette.textTertiary} fontSize={13}>
          {value}
        </Text>
      ) : null}
      {icon ? (
        <Ionicons name={icon} size={18} color={palette.textTertiary} />
      ) : null}
    </XStack>
  );
}

export default function SettingsScreen() {
  const palette = usePalette();
  const scheme = useEffectiveScheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    themeMode,
    accentId,
    desktopLyrics,
    monetColor,
    barBlur,
    floatingBar,
    liquidGlass,
    lyricOverlayBg,
    lyricOverlayText,
  } = useSettings();
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [aboutVisible, setAboutVisible] = useState(false);
  const version = Constants.expoConfig?.version ?? '';

  function toggleDesktopLyrics() {
    if (desktopLyrics) {
      settingsActions.setDesktopLyrics(false);
      return;
    }

    if (Platform.OS !== 'android' || !isNativeAvailable()) {
      showToast('桌面歌词仅在 Android 原生构建可用');
      return;
    }

    settingsActions.setDesktopLyrics(true);
    void ensureOverlayPermission().then((granted) => {
      if (!granted) {
        showToast('请在系统设置中开启「显示在其他应用上层」');
      }
    });
  }

  function openWeb(url: string, title: string) {
    router.push({ pathname: '/web', params: { url, title } });
  }

  function confirmLogout() {
    Alert.alert('退出登录', '将清除本机保存的登录信息', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearApiSession();
            libraryActions.reset();
            setLoggedIn(false);
          })();
        },
      },
    ]);
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <YStack
          alignSelf="center"
          width="100%"
          maxWidth={MaxContentWidth}
          paddingHorizontal={16}
          paddingTop={insets.top + 10}
          gap={18}>
          <XStack alignItems="center" gap={12}>
            <XStack
              width={38}
              height={38}
              borderRadius={19}
              alignItems="center"
              justifyContent="center"
              backgroundColor={palette.card}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              transition="quickest"
              pressStyle={{ opacity: 0.7, scale: 0.96 }}
              onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </XStack>
            <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
              设置
            </Text>
          </XStack>

          <YStack gap={10}>
            <SectionHeader title="外观" />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              padding={14}
              gap={14}>
              <YStack gap={10}>
                <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                  深色模式
                </Text>
                <SegmentedControl
                  options={THEME_MODE_OPTIONS}
                  value={themeMode}
                  onChange={settingsActions.setThemeMode}
                />
              </YStack>
              <View height={StyleSheet.hairlineWidth} backgroundColor={palette.border} />
              <YStack gap={12}>
                <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                  主题色
                </Text>
                <XStack flexWrap="wrap" gap={14} justifyContent="flex-start">
                  {ACCENT_PRESETS.map((preset) => (
                    <AccentSwatch
                      key={preset.id}
                      preset={preset}
                      scheme={scheme}
                      active={preset.id === accentId}
                      onPress={() => settingsActions.setAccentId(preset.id)}
                    />
                  ))}
                </XStack>
              </YStack>
            </YStack>

            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              paddingVertical={4}
              overflow="hidden">
              <ToggleRow
                label="启用 Monet 颜色"
                value={monetColor}
                onToggle={() => settingsActions.setMonetColor(!monetColor)}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <ToggleRow
                label="顶栏 / 底栏模糊"
                value={barBlur}
                onToggle={() => settingsActions.setBarBlur(!barBlur)}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <ToggleRow
                label="悬浮底栏"
                value={floatingBar}
                onToggle={() => settingsActions.setFloatingBar(!floatingBar)}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <ToggleRow
                label="液态玻璃"
                value={liquidGlass}
                onToggle={() => settingsActions.setLiquidGlass(!liquidGlass)}
              />
            </YStack>
          </YStack>

          <YStack gap={10}>
            <SectionHeader title="播放" />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              paddingVertical={4}
              overflow="hidden">
              <ToggleRow label="桌面歌词" value={desktopLyrics} onToggle={toggleDesktopLyrics} />
              {desktopLyrics ? (
                <>
                  <View
                    height={StyleSheet.hairlineWidth}
                    backgroundColor={palette.border}
                    marginHorizontal={14}
                  />
                  <ColorRow
                    label="歌词框颜色"
                    colors={OVERLAY_COLORS}
                    value={lyricOverlayBg}
                    onChange={(c) => settingsActions.setLyricOverlayBg(c)}
                  />
                  <ColorRow
                    label="歌词字体颜色"
                    colors={OVERLAY_TEXT_COLORS}
                    value={lyricOverlayText}
                    onChange={(c) => settingsActions.setLyricOverlayText(c)}
                  />
                </>
              ) : null}
            </YStack>
          </YStack>

          <YStack gap={10}>
            <SectionHeader title="音效" />
            <EqualizerPanel />
          </YStack>

          <YStack gap={10}>
            <SectionHeader title="通用" />
            <YStack
              backgroundColor={palette.card}
              borderRadius={20}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              paddingVertical={4}
              overflow="hidden">
              <SettingsRow
                label="运行日志"
                icon="document-text-outline"
                onPress={() => router.push('/logs')}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow label="版本" value={version ? `v${version}` : '—'} />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow
                label="GitHub"
                icon="logo-github"
                onPress={() => openWeb(REPO_URL, 'GitHub')}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow
                label="官网"
                icon="globe-outline"
                onPress={() => openWeb(WEBSITE_URL, '官网')}
              />
              <View
                height={StyleSheet.hairlineWidth}
                backgroundColor={palette.border}
                marginHorizontal={14}
              />
              <SettingsRow
                label="关于"
                icon="information-circle-outline"
                onPress={() => setAboutVisible(true)}
              />
              {loggedIn ? (
                <>
                  <View
                    height={StyleSheet.hairlineWidth}
                    backgroundColor={palette.border}
                    marginHorizontal={14}
                  />
                  <SettingsRow label="退出登录" danger onPress={confirmLogout} />
                </>
              ) : null}
            </YStack>
          </YStack>

          {version ? (
            <Text color={palette.textTertiary} fontSize={11} textAlign="center" paddingTop={6}>
              YuMusic v{version}
            </Text>
          ) : null}
        </YStack>
      </ScrollView>

      <Modal
        visible={aboutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAboutVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={(event) => event.stopPropagation()}>
            <YStack
              maxHeight="82%"
              backgroundColor={palette.card}
              borderRadius={22}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              overflow="hidden">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}>
                <Text color={palette.text} fontSize={21} fontWeight="800" textAlign="center">
                  免责声明
                </Text>
                <YStack gap={12}>
                  {DISCLAIMER.map((content) => (
                    <Text key={content} color={palette.textSecondary} fontSize={13} lineHeight={20}>
                      {content}
                    </Text>
                  ))}
                </YStack>
                <XStack
                  height={44}
                  borderRadius={14}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.accent}
                  transition="quickest"
                  pressStyle={{ opacity: 0.78 }}
                  onPress={() => setAboutVisible(false)}>
                  <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                    关闭
                  </Text>
                </XStack>
                <Text color={palette.textTertiary} fontSize={11} textAlign="center">
                  © YuMusic{version ? ` V${version} - ${Platform.OS}` : ''}
                </Text>
              </ScrollView>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 560,
  },
  modalContent: {
    gap: 18,
    padding: 20,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
