<div align="center">

<img src="assets/images/icon.png" width="240" alt="YuMusic" />

# YuMusic

一款开源、简洁、高颜值的第三方酷狗音乐移动端播放器

基于 Expo / React Native 构建，开箱即用，无需自建服务器

<a href="https://github.com/xiaoyu123364/YuMusic" target="blank"><strong>🌎 GitHub 仓库</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
<a href="https://github.com/xiaoyu123364/YuMusic/releases" target="blank"><strong>📦️ 下载安装包</strong></a>

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-GPL--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Android-lightgrey)](#)

</div>

---

## ✨ 特性

- 🎵 **无需自建服务器** — 酷狗 API 适配层直接直连官方，开箱即用，不依赖外部 API 地址
- 🏠 **首页推荐** — 每日推荐、精选歌单、排行榜
- 🧭 **发现页** — 分类歌单、新歌速递等内容探索
- 🔍 **搜索** — 快速检索歌曲、歌单、专辑、歌手、MV
- 📀 **歌单 / 专辑 / 排行榜** — 完整的详情页与曲目列表
- 🎧 **播放器** — 滚动歌词、播放队列、迷你播放条（MiniPlayer）、后台播放
- 🎚️ **音质检测** — 自动探测并选择最高音质（Hi-Res / 无损 FLAC / 沉浸声）
- 🔗 **分享码** — 单曲/多选生成「YM+hash」分享码，粘贴到搜索框即可直达播放
- 💧 **液态玻璃** — 底部导航栏与迷你播放条真模糊 + 折射色散 + 可拖拽回弹
- 🎛 **均衡器** — 4 种声音风格 + 实时频谱条形
- 🌈 **Material You** — 跟随系统壁纸/封面动态取色贯穿全界面
- 📱 **手机号登录** — 同步酷狗账号的收藏与歌单
- 🌗 **深色模式** — 跟随系统自动切换明暗主题

## 📝 功能清单

- [x] 首页每日推荐 / 精选歌单 / 排行榜
- [x] 发现页分类内容浏览
- [x] 搜索歌曲、歌单、专辑、歌手、MV
- [x] 歌单 / 专辑 / 排行榜详情页
- [x] 播放器：滚动歌词、播放队列、迷你播放条、后台播放
- [x] 音质检测与自动选择（Hi-Res / 无损 FLAC / 沉浸声）
- [x] 手机号 / 账号密码 / 扫码登录
- [x] 我喜欢 / 收藏同步、用户歌单管理
- [x] 通知栏 / 锁屏播放控制（切歌、暂停、封面、进度）
- [x] 桌面歌词（Android 悬浮窗）
- [x] 听歌识曲
- [x] 分享码体系（单曲 / 多选）
- [x] 本地音乐 + 最近播放
- [x] 均衡器 + 实时频谱
- [x] 液态玻璃导航栏
- [x] 平板与横屏适配
- [ ] 性能优化

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 22
- [Git](https://git-scm.com/)
- Android 真机或模拟器（项目当前聚焦 Android 平台）

### 开发运行

```bash
# 克隆仓库（包含 api submodule）
git clone --recurse-submodules https://github.com/xiaoyu123364/YuMusic.git
cd YuMusic

# 安装依赖
npm install
npm --prefix api install

# 生成移动端 API 入口（api/ 更新后需重新执行）
npm run generate:mobile-api

# 启动开发服务器
npx expo start
```

> 如果克隆时遗漏了 submodule，可执行 `git submodule update --init` 补齐。

### 打包构建

项目支持 [EAS Build](https://docs.expo.dev/build/introduction/)：

```bash
# 开发版（Development Client）
eas build --profile development --platform android

# 预览版（内部分发）
eas build --profile preview --platform android

# 生产版
eas build --profile production --platform android
```

## 🏗️ 项目结构

```
├── api/                    # KuGouMusicApi（git submodule）
├── scripts/
│   └── generate-mobile-api-entry.mjs   # 扫描 api/module 生成移动端入口
├── modules/                # 自研原生模块（expo-moekoe-native）
│   └── expo-moekoe-native/ # 均衡器/频谱/桌面歌词/播放服务/动态取色
├── src/
│   ├── app/                # expo-router 路由
│   │   ├── (tabs)/         # 首页、发现、我的
│   │   ├── player.tsx      # 全屏播放页
│   │   ├── search.tsx      # 搜索页
│   │   ├── login.tsx       # 登录页
│   │   └── playlist|album|rank/[id].tsx  # 详情页
│   ├── components/ui/      # 通用 UI 组件（歌词、队列、迷你播放条、液态玻璃等）
│   ├── features/           # 业务模块（player / discover / search / account ...）
│   ├── lib/kugou-api/      # 应用内 API 运行时适配层
│   ├── hooks/              # 通用 Hooks
│   └── constants/          # 主题与布局常量
├── app.json                # Expo 应用配置
└── eas.json                # EAS 构建配置
```

## 🔧 技术栈

| 类别 | 方案 |
| --- | --- |
| 框架 | [Expo SDK 57](https://expo.dev/) + [React Native 0.86](https://reactnative.dev/) + React 19 |
| 路由 | [expo-router](https://docs.expo.dev/router/introduction/)（文件路由 + Typed Routes） |
| UI | [Tamagui v2](https://tamagui.dev/) |
| 音频 | [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/)（支持后台播放） |
| 动画 | react-native-reanimated 4 |
| 玻璃模糊 | expo-blur（Dimezis BlurView，Android 真模糊） |
| 数据源 | [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)（应用内运行，无需部署） |

## 🤝 致谢

本项目基于 [MoeKoeMusic](https://github.com/iAJue/MoeKoeMusic)（桌面版）二次开发，感谢原作者 [iAJue](https://github.com/iAJue)；数据接口来自 [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)。

## 💬 贡献

欢迎任何形式的贡献！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feat/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送分支并发起 Pull Request

发现问题或有功能建议，请提交 [Issue](https://github.com/xiaoyu123364/YuMusic/issues)。

## ⚠️ 免责声明

1. 本项目仅供**学习与技术研究**使用，请勿用于任何商业用途或非法用途。
2. 本项目不存储、不分发任何音频资源，所有数据均来自酷狗音乐官方接口；分享码仅为歌曲标识（hash），不含任何音频内容。
3. 音乐版权归酷狗音乐及相应版权方所有，请支持正版音乐。
4. 使用本项目产生的一切后果（包括但不限于版权、法律、数据风险）由使用者自行承担，与开发者无关。
5. 本项目为第三方客户端，与酷狗音乐官方无关，如需完整功能请使用官方客户端。

## 📄 License

本项目基于 [GPL-2.0 License](LICENSE) 开源。
