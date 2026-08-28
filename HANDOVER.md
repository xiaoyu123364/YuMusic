# YuMusic 项目交接文档

> 接手人读这一份就够了。下面所有内容都是「血泪踩坑 + 当前真实状态」，不是理想文档。

---

## 0. 一句话定位

**YuMusic**（`com.yumusic.app`）是一款基于 **Expo / React Native** 的**第三方酷狗音乐播放器**，原项目叫 `MoeKoeMusic-Mobile`，已更名为 YuMusic 并规划开源。当前**重点适配 Android 平台**，用本地原生模块实现液态玻璃、悬浮歌词、后台播放等真机功能。

当前版本：**v1.7.0（versionCode 26）**，分支 `main`，最新 tag `v1.7.0`。

---

## 1. 技术栈与版本（务必对齐，错版本会编译不过）

| 项 | 版本 |
|---|---|
| Expo SDK | 57.0.7 |
| React Native | 0.86.0 |
| React | 19.2.3 |
| TypeScript | 6.0.3 |
| Tamagui | 2.4.6 |
| reanimated | 4.5.0 |
| Skia | 2.6.2 |
| 路由 | expo-router（Stack + Tabs） |

- 开发机 Node 走本地 managed 运行时（22.x），不要动全局 node。
- 包管理：`npm`（无 pnpm/yarn 配置）。
- 原生模块在 `modules/expo-moekoe-native/`（Kotlin），是**自己写的 Expo Module**，不是第三方库。

---

## 2. 设计语言现状（重要！避免方向性误解）

**v1.7.0 把所有界面改成了 Apple Music（iOS 主题）设计语言。但这是一个「阶段性半成品」：**

- ✅ **iOS / 苹果主题已完成**：iOS 系统色板、`#FA233B` Apple 红强调色、全宽 49pt 底栏（发丝顶线 + 10pt 标签）、播放页大圆角封面卡片、动态歌词高亮。
- ⏸️ **Android 主题适配被刻意搁置**：用户明确要求「本阶段只做 iOS 主题，Android 适配留待后续」。所以现在 Android 设备上渲染的是 iOS 配色——这**不是 bug，是计划内**。
- 原上游的「Material You / 动态取色」功能已迁移：旧设置项的 `dynamic` 强调色在首次启动时**自动迁移为 `apple`**。相关逻辑在 `src/features/settings/store.ts`。

**接手前先想清楚：下一个阶段是要把 Android 主题单独做一套（Material 3 / Monet），还是继续深耕 iOS 主题。** 主题令牌集中在 `src/constants/theme.ts` + `src/constants/accents.ts`。

---

## 3. 关键目录与文件

```
app.json / android/app/build.gradle      ← 版本号（version + versionCode）两处必须同步
src/constants/theme.ts                    ← 所有颜色令牌（iOS 色板）
src/constants/accents.ts                  ← 强调色预设（默认 apple）
src/constants/layout.ts                   ← 布局常量（TabBarHeight=49 等）
src/app/(tabs)/_layout.tsx                ← 底部导航栏（FloatingGlassTabBar）
src/app/player.tsx                        ← 播放页（最大、最常被改的页面，~660 行）
src/components/ui/lyrics-view.tsx         ← 动态歌词
src/components/ui/glass.tsx               ← 液态玻璃封装（含 KSU 配方）
src/components/ui/mini-player.tsx         ← 迷你播放条
src/features/theme/design-style.ts        ← design spec（controlGlass/barGlass 路由）
modules/expo-moekoe-native/android/.../
  ├─ LiquidGlassSurfaceView.kt           ← 自研液态玻璃（Canvas 降采样 + GPU 模糊 + AGSL 折射）
  ├─ BackdropAnchorView.kt               ← GlassBackdropRegistry 采样源注册
  ├─ PlaybackService.kt                  ← 后台播放 / MediaSession
  ├─ LyricOverlayManager.kt              ← 悬浮歌词（Android 悬浮窗）
  └─ ExpoMoekoeNativeModule.kt           ← 模块入口
```

---

## 4. 构建与发布（最容易翻车的环节，逐字照做）

### 4.1 本地构建 release APK
```bash
# 先同步版本号（见 4.4），再：
cd android
./gradlew assembleRelease --console=plain
# 产物：android/app/build/outputs/apk/release/app-release.apk
```
构建一次约 4 分钟。构建机走 `7891` 本地代理（`https_proxy=http://127.0.0.1:7891`）。

### 4.2 ⚠️ prebuild 资源陷阱（最高频坑）
`android/` 目录被 gitignore，**改下面的东西不会自动进 APK**，必须手动同步：
- **开屏图标**：改了 `assets/images/` 源图后，要手动重生成 `android/app/src/main/res/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/splashscreen_logo.png`。否则 APK 里还是旧图（曾经方角开屏改不圆就是因为只动了源图）。
- `android/app/build.gradle` 的 `versionCode` / `versionName` 不会跟 `app.json` 自动同步，要手改两处。

### 4.3 验证 APK（不要只看构建成功）
```bash
AAPT=$(ls "$LOCALAPPDATA/Android/Sdk/build-tools/"*/aapt.exe | tail -1)
"$AAPT" dump badging android/app/build/outputs/apk/release/app-release.apk | grep -E "package:|application-label:"
```
确认 `versionName` 与 `versionCode` 正确（aapt 读的是 UTF-16LE，是权威来源）。

### 4.4 推送代码 + 打 tag
```bash
git add <改动文件> && git commit -m "..."
https_proxy=http://127.0.0.1:7891 GIT_TERMINAL_PROMPT=0 git push origin main
https_proxy=http://127.0.0.1:7891 GIT_TERMINAL_PROMPT=0 git tag -f vX.Y.Z main
https_proxy=http://127.0.0.1:7891 GIT_TERMINAL_PROMPT=0 git push -f origin vX.Y.Z
```
**注意**：`GIT_TERMINAL_PROMPT=0` 必须带，否则远程有冲突时弹交互框会把命令挂死。

### 4.5 ⚠️ GitHub Release + 上传 APK（最阴间的坑）
**机器上没有装 `gh` CLI，也没有可用的 `git credential fill`**，因为 Windows 凭据管理器里存了**两个 GitHub 账号**（GCM 要弹选择框，非交互环境直接失败）。

解法（已验证可用）：
```bash
# 1) 用 x-access-token 账号显式取 token（GCM 不再弹窗）
printf "protocol=https\nhost=github.com\nusername=x-access-token\n\n" | \
  "/c/Users/yuzhengxin/.workbuddy/binaries/PortableGit/versions/1.2.0/mingw64/bin/git-credential-manager.exe" get
# 取输出里的 password= 那行作为 Bearer token

# 2) 创建 Release（用 GitHub API）
curl -X POST "https://api.github.com/repos/xiaoyu123364/YuMusic/releases" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d '{"tag_name":"vX.Y.Z","name":"YuMusic vX.Y.Z","body":"...","draft":false,"prerelease":false}'

# 3) 上传 APK（curl 的 @路径必须用 Windows 风格 C:/Users/...，MSYS /c/... 会 read error）
curl -X POST "https://uploads.github.com/repos/xiaoyu123364/YuMusic/releases/<id>/assets?name=YuMusic-vX.Y.Z.apk" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"C:/Users/yuzhengxin/YuMusic-vX.Y.Z.apk"
```
额外提醒：后台任务里的 `/tmp` 临时文件不可靠，token 和 APK 路径用 `$HOME`（即 `C:/Users/yuzhengxin/`）存。用完删掉含 token 的临时文件。

---

## 5. 关键技术决策与已知坑

1. **液态玻璃是自研原生模块，不是 BlurView 假效果**。
   - `LiquidGlassSurfaceView.kt`：软件 Canvas 降采样 backdrop → RenderEffect GPU 模糊 → API33+ AGSL 运行时着色器做透镜折射/色散。
   - KSU 配方落地：blurAmount≈0.105（≈27px）+ barSurface tint（暗 0.60 / 亮 0.70 alpha）。
2. **防闪烁用 `suppressed` 标志，绝不用 visibility 切换**：切换页面时若对其它玻璃 `setVisibility(INVISIBLE)`，会引发 invalidate 风暴导致整页狂闪。采样时用 `@Volatile suppressed` 抑制其它玻璃绘制；采样异常时**保留上一帧好样本**，不要擦成 fallback 浅色（否则会出现「玻璃中间一条白」）。
3. **BackdropAnchorView + GlassBackdropRegistry**：原生 `attach` 时自注册采样源，绕开新架构 `findView(tag)` 解析失败。
4. **Tamagui `View` 不认 `elevation` 属性**（会 tsc 报错），阴影要放原生 `View` + `style` 里，或改用 `shadow*` 系列。播放页封面卡片就是这么处理的。
5. **expo-blur 在 Android 默认无真实模糊**（只有色调），所以 Android 上液态玻璃没就绪时会是灰块——`design-style.ts` 里 `liquidReady` 时让 controlGlass/barGlass 走 `liquid` 绕过。
6. **tsc 历史遗留错误**：项目里有几个旧文件（`recognize-api`/`bootstrap`/`use-axios` 相关）一直有类型错误，属于历史债，不必理会；改版时只 `grep` 自己动过的文件即可。

---

## 6. 尚未完成 / 待办（接手人须知）

按优先级：

1. **🔴 播放页需求落地状态**：
   - ✅ 「点击放大的专辑图片 → 变成旋转的唱片模式」：**已完成**。重构了 `PlayerCover` 容器与 `SpinningDisc` 黑胶唱片组件，支持在 Apple Music 封面方卡与拟真旋转黑胶之间点击无缝切换，播放时平滑匀速 360° 旋转、暂停平滑驻留并记忆角度，状态通过 `playerCoverLook` 同步至 settings store 与持久化存储。
   - ❓ 「不要这个，把这个改到里面去」：附了一张截图（图里某个元素当前在「外面」，用户要求移进播放页「里面」）。**需向用户确认具体是哪个组件/开关**。
2. **🟠 Android 主题适配**：v1.7.0 只做了 iOS 主题，Android 上现在渲染 iOS 配色。下一步要补 Material 3 / Monet 一套（或至少中性深色）。
3. **🟡 开屏圆角**：已在 v1.6.6 达成（drawable 重生成验证过角落 alpha=0），无需再做。
4. **🟡 性能优化**：README 功能清单里标了 `[ ] 性能优化`，未做。

---

## 7. 项目知识库在哪

- **工作记忆**：`.workbuddy/memory/` 目录下按日期的 `.md`（如 `2026-08-26.md`），记录了每次改版的根因与修复；`MEMORY.md` 是长期项目笔记。接手前把最近的几条读完，能省大量试错。
- **GitHub Release**：`https://github.com/xiaoyu123364/YuMusic/releases`（每个版本 APK 都在这里）。

---

## 8. 接手第一天建议做的 5 件事

1. `git pull` + `npm install` + `npx tsc --noEmit` 看一眼基线。
2. `cd android && ./gradlew assembleRelease` 跑一次，确认本地能出包（约 4 分钟）。
3. 装 `app-release.apk` 到真机，确认 iOS 主题视觉与动态歌词。
4. 读 `.workbuddy/memory/2026-08-26.md` 和本文件第 4、5 节。
5. 向用户确认第 6 节两条未完成需求的具体形态（尤其那张截图）。

---

*最后更新：v1.7.0 发布当日。本文件随版本推进请持续更新。*
