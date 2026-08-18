# YuMusic · iOS / Apple 构建工作区（apple/）

本项目是 **YuMusic**（基于 Expo SDK 57 / React Native 0.86 的第三方酷狗音乐播放器）的 **iOS 版本构建工作区**。
所有源码改动都在 `../`（项目根）完成，**未删除、未改动任何安卓源文件**；本目录仅承载 iOS 专属的
构建脚本、资源模板与文档。

---

## ⚠️ 重要说明（务必先读）

1. **`.ipa` 不能在 Windows / Android 环境下编译产出。**
   iOS 应用包必须由 **Apple 工具链** 生成，二选一：
   - **方案 A（推荐，零本地依赖）**：用 Expo 官方的 **EAS 云构建**（`eas build -p ios`），
     编译在 Expo 服务器上完成，Windows 上也能触发，产物 `.ipa` 自动回传。
   - **方案 B（本地）**：在 **macOS + Xcode 26** 上执行 `expo prebuild` + `xcodebuild`。
   本工作区已为两种方式都准备好脚本与配置，**你只需在对应环境运行即可**。

2. **真机安装 / 上架需要 Apple 开发者账号。**
   - 仅想跑**模拟器**：EAS 的 `simulator` 构建或本地 `expo run:ios` 不需要付费账号。
   - **真机 Ad Hoc / TestFlight / App Store**：需要付费 Apple Developer 账号用于签名。

3. **iOS 上部分安卓专属原生能力会自动降级**（见下方功能对照表），这是设计内的，不是 bug。

---

## 📁 目录说明

```
apple/
├── README.md            # 本文件：构建指南与功能对照
├── IOS-CHANGES.md       # 为兼容 iOS 所做的事源码改动清单
├── build-ipa.sh         # macOS 本地构建脚本（prebuild + xcodebuild 归档）
├── build-ipa.ps1        # Windows 触发 EAS 云构建的脚本
├── exportOptions.plist  # 本地 xcodebuild 导出 IPA 的模板（Ad Hoc / App Store）
└── AppIcon-Contents.json# 手动用 Xcode 管理图标的 AppIcon 集合描述（可选）
```

根目录相关的 iOS 配置已就绪（在 `app.json` 的 `expo.ios` 段）：
- `bundleIdentifier`: `cn.moekoe.music`（如需改成 `com.yumusic.app` 风格，请同步修改签名与 EAS 项目）
- `buildNumber`: `1.5.5`
- `UIBackgroundModes`: `audio`（后台播放）
- `NSAppTransportSecurity.NSAllowsArbitraryLoads`: `true`（直连酷狗接口，绕过 ATS）
- `ITSAppUsesNonExemptEncryption`: `false`（跳过加密出口合规问卷）

---

## 🧰 前置条件

| 工具 | 版本 / 说明 |
| --- | --- |
| Node.js | ≥ 22（与安卓构建一致） |
| EAS CLI | `npm i -g eas-cli`，并 `eas login` |
| （本地方案）macOS | macOS 15+，Xcode 26（液态玻璃需 iOS 26 SDK；旧系统会自动降级为 vibrancy/blur） |
| （真机）Apple 账号 | 付费 Developer 账号，用于证书 / Provisioning Profile |

> 根目录依赖已安装（`node_modules` 存在）。若需重装：`npm install` 与 `npm --prefix api install`。

---

## 🚀 构建方式一：EAS 云构建（推荐，无需 Mac）

在 **任意平台（含 Windows）** 执行：

```powershell
# 1) 登录 EAS（首次）
eas login

# 2) 触发 iOS 生产构建（产物回传为 .ipa）
eas build -p ios --profile production

# 仅想跑模拟器（免付费账号）：
eas build -p ios --profile preview
```

构建完成后 EAS 控制台会给出 `.ipa` 下载链接。App Store 上架可继续：

```powershell
eas submit -p ios --profile production
```

> 根 `eas.json` 的 `development` / `preview` / `production` 三套配置对 iOS 同样生效，
> 无需为 iOS 单独新增配置。

---

## 🍎 构建方式二：本地 macOS 构建

```bash
# 进入项目根
cd /path/to/MoeKoeMusic-Mobile-master

# 生成 iOS 原生工程（输出到 ./ios）
npx expo prebuild --platform ios --clean

# 用本工作区脚本完成归档与导出
bash apple/build-ipa.sh
```

`apple/build-ipa.sh` 会执行 `xcodebuild archive` + `xcodebuild -exportArchive`，
按 `apple/exportOptions.plist` 导出 `.ipa` 到 `ios/build/IPA/YuMusic.ipa`。
导出前请先在 Xcode 中配置好签名（Team / Bundle Id / Provisioning Profile）。

---

## 📲 真机安装

| 场景 | 方式 |
| --- | --- |
| 模拟器 | EAS `preview` 构建下载后直接拖入 simulator；或本地 `expo run:ios` |
| 内部分发（Ad Hoc） | 用 `exportOptions.plist` 的 `ad-hoc` 方法导出，通过隔空投送 / 第三方分发安装 |
| TestFlight | `eas submit -p ios` 上传后邀请测试 |
| App Store | `eas submit -p ios` 提交审核 |

---

## ✅ iOS 功能对照表

| 功能 | iOS 状态 | 说明 |
| --- | --- | --- |
| 首页 / 发现 / 搜索 / 歌单 / 专辑 / 排行榜 | ✅ 完整 | 纯 JS，跨平台一致 |
| 播放器（歌词 / 队列 / MiniPlayer） | ✅ 完整 | 跨平台一致 |
| **后台播放** | ✅ 完整 | `expo-audio` + `UIBackgroundModes: audio` |
| **锁屏 / 控制中心播放控制** | ✅ 完整 | `expo-audio` 在 iOS 自动注入 Now Playing（封面 / 进度 / 上一首下一首） |
| **液态玻璃导航栏 / 分段控件** | ✅ 真·液态玻璃 | iOS 走 `expo-glass-effect`（iOS 26 原生 Liquid Glass）；旧系统自动降级 |
| 深色模式 | ✅ 完整 | 跟随系统 |
| 分享码 / 本地音乐 / 最近播放 | ✅ 完整 | 跨平台一致 |
| 手机号 / 账号登录 | ✅ 完整 | 跨平台一致 |
| **系统动态取色（Material You）** | ⚠️ 降级 | Android 专属；iOS 使用固定主题色（后续可用 iOS 墙纸取色增强） |
| **均衡器（EQ）** | ⚠️ 不可用 | 依赖安卓 `AudioEffect`；iOS 无等价原生实现（`expo-audio` 自管音频图），用户决定暂不实现 |
| **实时频谱** | ⚠️ 不可用 | 同上，依赖安卓 `Visualizer` |
| **桌面歌词悬浮窗** | ⚠️ 不可用 | 依赖安卓 `SYSTEM_ALERT_WINDOW` 悬浮窗；iOS 无系统级悬浮窗，自动禁用 |
| **下载 / 分享音频文件** | ✅ 跨平台完整 | 安卓存公共下载目录；iOS 走系统分享（`expo-sharing`）导出到「文件」/ AirDrop / 第三方，并加入应用内本地音乐 |

> 降级策略已在 `src/features/android/native.ts` 实现：非 Android 时 `requireOptionalNativeModule`
> 返回 `null`，所有命令式原生 API 自动切换为 no-op 桩；UI 上对应的开关 / 入口会安全隐藏或提示不支持。

---

## 🚧 已知限制与后续建议

1. **EQ / 频谱 / 桌面歌词在 iOS 缺失** 是平台能力差异，非工程缺陷。其中 **EQ 经评估后按用户意愿「不行就算了」暂不做**
   （`expo-audio` 自管音频图 + iOS 无 per-session 等价 API，真有效需替换播放引擎并新增 Swift 原生模块，属过度工程/空壳实现）。若后续确需：
   - EQ：可基于 `expo-audio` 之外引入 iOS `AVAudioEngine`  Graphic EQ（需新增 Swift 原生模块 + 平台切换播放引擎）；
   - 桌面歌词：iOS 可用 **Live Activities / 灵动岛** 或应用内常驻小窗替代悬浮窗。
2. **动态取色**：iOS 可用 `expo-system-ui` 读取系统色调，或自研封面取色（已有 `extractPaletteFromImage` 逻辑可复用）。
3. **bundleIdentifier** 当前为 `cn.moekoe.music`，与安卓 `com.yumusic.app` 不同属正常（两平台独立）；
   若想统一，请同步修改 `app.json`、EAS 项目与签名。
4. 本工作区 **不依赖** `modules/expo-moekoe-native` 的 iOS 实现——该模块只有 Android 目标，
   在 iOS prebuild 时不会被链接，因此不会阻断 iOS 构建。

---

## ❓ 常见问题

**Q：Windows 上能直接 `expo run:ios` 吗？**
A：不能（需要 Xcode）。请用 EAS 云构建（`eas build -p ios`），或在 Mac 上本地构建。

**Q：构建报 “missing scheme / pod install 失败”？**
A：先 `npx expo prebuild --platform ios --clean` 重新生成 `ios/` 工程，再 `cd ios && pod install`。

**Q：iOS 启动白屏 / 闪退？**
A：确认已应用 `IOS-CHANGES.md` 中的液态玻璃修复；用 `eas build --profile development` 跑 Dev Client 看红屏日志。

**Q：能上架 App Store 吗？**
A：技术上可以，但本项目为第三方酷狗客户端，请自行评估版权与平台合规风险（详见根目录 README 免责声明）。
