# YuMusic · iOS 云构建触发脚本（Windows 上运行，无需 Mac）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File apple/build-ipa.ps1
#   powershell -ExecutionPolicy Bypass -File apple/build-ipa.ps1 -Profile preview
#
# 说明：
#   iOS 无法在 Windows 本地编译，本脚本通过 EAS CLI 把构建任务提交到
#   Expo 云端，编译完成后回传 .ipa 下载链接。
#   首次使用请先 `eas login`（需 Expo 账号）。
param(
  [string]$Profile = "production"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $RootDir

Write-Host "==> 项目根: $RootDir"
Write-Host "==> 触发 EAS iOS 云构建 (profile=$Profile)"

# 提交云构建（--non-interactive 避免交互阻塞；如需模拟器用 -Profile preview）
eas build -p ios --profile $Profile --non-interactive

Write-Host "==> 构建已提交，前往 EAS 控制台查看进度并下载 .ipa"
Write-Host "    https://expo.dev/accounts/<your-account>/projects/yumusic/builds"
