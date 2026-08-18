# iOS 兼容性源码改动清单（IOS-CHANGES）

> 目标：让 YuMusic 能在 iOS 上干净构建并运行，且不破坏安卓现有功能。
> 原则：**只做最小、必要的跨平台适配**，安卓专属能力在 iOS 上优雅降级，不删除任何源文件。

---

## 1. `src/components/ui/liquid-glass.tsx`（关键修复）

**问题**：原实现顶层直接调用
`requireNativeViewManager('ExpoMoekoeNative', 'LiquidGlassSurfaceView')`，
该原生 View **仅在 Android 上存在**。在 iOS 上渲染此组件会立即崩溃
（`LiquidGlassSurface` 被 `tabs/_layout.tsx` 与 `segmented-control.tsx` 全屏使用，必崩）。

**改动**：
- 将 `requireNativeViewManager(...)` 的调用放进 `if (Platform.OS === 'android')` 守卫内，
  iOS 上 `NativeLiquidGlassView` 保持 `null`，绝不触发未注册的原生 View。
- iOS 分支改用 `expo-glass-effect` 的 **`GlassView`**（iOS 26 原生 Liquid Glass，
  旧系统自动降级为 vibrancy / blur），获得**真·液态玻璃**而非 BlurView 伪效果。
- 保留 `BackdropContext` / `useBackdropTargetId` / `LiquidGlassSurface` 导出与
  `radius` / `backdropTargetId` / `style` props，调用方（`tabs`、`segmented-control`）无需改动。

```tsx
let NativeLiquidGlassView = null;
if (Platform.OS === 'android') {
  NativeLiquidGlassView = requireNativeViewManager('ExpoMoekoeNative', 'LiquidGlassSurfaceView');
}
// iOS: <GlassView glassEffectStyle="regular" ... />
```

---

## 2. `app.json`（iOS 段补充）

在 `expo.ios.infoPlist` 增加：

```json
"ITSAppUsesNonExemptEncryption": false
```

用于跳过 App Store 提交的「加密出口合规」问卷。其余 iOS 配置（`bundleIdentifier`、
`buildNumber`、`UIBackgroundModes: ["audio"]`、`NSAppTransportSecurity`）原本已存在且正确。

`expo.ios` 段不含任何 Android 专属项；`expo.android.permissions` 本就是平台隔离的，
不会泄漏到 iOS 构建。

---

## 3. 已确认「无需改动」的降级点

以下原生能力通过 `src/features/android/native.ts` 的 `requireOptionalNativeModule` 实现：
非 Android 时模块返回 `null`，对外暴露的 API 全部切换为 **no-op 桩**，iOS 上安全空转。

| 模块 / 文件 | iOS 行为 |
| --- | --- |
| `native.ts`（命令式 API 入口） | 返回 null → 全部 no-op |
| `features/player/equalizer.ts` | `setEqualizerBands` 返回 `false`，EQ 自动失效 |
| `components/ui/spectrum-bars.tsx` | `requestSpectrumPermission` 返回 `false`，频谱不可用 |
| `features/theme/system-accent.ts` | `getSystemAccentColors` / `extractPaletteFromImage` 返回 `null`，用固定主题色 |
| `features/android/media-session.tsx` | `updateMediaSession` / `setPlaybackState` 为 no-op；**iOS 锁屏控制由 `expo-audio` 自动提供** |
| `features/android/floating-lyrics.tsx` | 已被 `Platform.OS !== 'android'` 守卫，桌面歌词在 iOS 不启用 |

`modules/expo-moekoe-native` 只有 Android 目标（`android/` 目录，无 `ios/`），
iOS prebuild / autolinking 时不会链接该模块，因此不会阻断 iOS 构建。

---

## 4. `src/lib/download.ts`（iOS 下载改系统分享）

**问题**：原逻辑在 iOS 上调用 `moekoeNative.saveToPublicDownloads` —— 该原生方法
**仅 Android 存在**，iOS 返回 `null`，等同于「下载失败」，且 iOS 本就没有
「公共下载目录」概念（无法像 Android 一样存到 `Download/yumusic/`）。

**改动**（按用户要求「文件下载在 apple 上改成分享」）：
- 新增 `Platform`、`expo-sharing` 导入，以及 `mimeFor()` / `utiFor()` 辅助函数
  （按扩展名映射 `audio/flac`、`public.mp3` 等 MIME / UTI，确保分享面板识别正确）。
- `downloadTrackToLibrary(track, share = true)` 按平台分流：
  - **Android**：走原 `MediaStore` 公共下载逻辑（不变）。
  - **iOS / 非 Android**：下载到应用缓存后加入本地音乐（`addLocalTrack`，应用内可播），
    并调起 `Sharing.shareAsync`，用户可保存到「文件」App / AirDrop / 微信等第三方。
    分享异常（取消 / 失败）被 `try/catch` 吞掉，**不影响已下载到本地音乐的结果**。
- `downloadTracksToLibrary(tracks)` 批量场景传 `share = false`，避免连续弹出多个分享框
  （批量仅入本地音乐，单首分享可后续在歌曲菜单单独操作）。
- 复用项目既有分享 API（`src/lib/share.ts` 的 `Sharing.shareAsync`），不引入新依赖。

```ts
export async function downloadTrackToLibrary(track, share = true): Promise<string | null> {
  // ... 下载到 cache ...
  if (Platform.OS === 'android' && isNativeAvailable()) {
    const publicUri = moekoeNative.saveToPublicDownloads(downloaded.uri, displayName);
    if (!publicUri) return null;
    addLocalTrack(track, publicUri);
    return publicUri;
  }
  // iOS / 非 Android：入本地音乐 + 走系统分享导出
  addLocalTrack(track, downloaded.uri);
  if (share && await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: mimeFor(ext), dialogTitle: `保存 / 分享《${displayName}》`, UTI: utiFor(ext),
    });
  }
  return downloaded.uri;
}
```

---

## 5. 均衡器（EQ）/ 音效 —— 按用户意愿「不行就算了」

**用户诉求**：音效尝试加入，不行就算了。

**结论**：**iOS 上无法做成真·有效的 EQ，已按「就算了」处理，不做假实现。**

**原因（硬约束）**：
- `features/player/equalizer.ts` 的核心依赖是 `getAudioSessionId()`（来自播放 store）
  与 `moekoeNative.setEqualizerBands(sessionId, gains)` —— 二者均为 **Android 专属**
  （安卓 `AudioEffect` / `Equalizer` 按 audio session id 注入 EQ 节点）。
- iOS 当前音频由 **`expo-audio`**（底层 `AVPlayer`）驱动，`expo-audio` **自管音频图**，
  不暴露可注入 EQ 节点的音频管线；iOS 也没有「按 session id 给第三方播放器加 EQ」的等价 API
  （`AVAudioEngine` 的 Graphic EQ 只能作用于自建音频引擎，无法作用于 `AVPlayer`）。
- 若要「真有效」，必须：① 用 `AVAudioEngine` 重写 iOS 播放管线（替换 `expo-audio`），
  或 ② 新增 Swift 原生模块桥接 `AVAudioEngine` 并在播放时切换引擎 —— 工作量重且会改变
  安卓已验证稳定的播放行为，属于过度工程；若只做 UI 开关而无真实音频处理，则是用户明确反对的
  「空壳 / 假实现」。

**当前 iOS 行为（设计内降级，非缺陷）**：
- `settings.tsx` 第 276 行已有守卫 `if (Platform.OS !== 'android' || !isNativeAvailable())`，
  EQ 面板在非 Android 上本来就**不显示入口**，用户也不会看到失效的 EQ 开关。
- 即便走到 `equalizer.ts`，`moekoeNative` 在非 Android 为 null，`setEqualizerBands` 安全返回 `false`。

> 后续若确实要在 iOS 提供 EQ，建议路线是原生 `AVAudioEngine` 模块 + 平台切换播放引擎，
> 但需单独评估，不作为本次 iOS 适配范围。

---

## 6. 验证方式（受限于无 iOS 工具链）

- ✅ 已确认全仓仅 `liquid-glass.tsx` 一处使用 `requireNativeViewManager`，已修复。
- ✅ 已确认除该处外，所有原生调用均经 `native.ts` 的 no-op 桩，iOS 不引用未注册原生对象。
- ⚠️ 实际 `.ipa` 编译与真机运行需在 macOS + Xcode 26 或 EAS 云上验证（见 `README.md`）。
