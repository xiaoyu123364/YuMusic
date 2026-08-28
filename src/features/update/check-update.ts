import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { isNativeAvailable, moekoeNative } from '@/features/android/native';

export type ReleaseInfo = {
  tagName: string;
  versionName: string;
  name: string;
  body: string;
  publishedAt: string;
  downloadUrl: string;
  hasUpdate: boolean;
};

const GITHUB_REPO = 'xiaoyu123364/YuMusic';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const clean2 = v2.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);

  const len = Math.max(clean1.length, clean2.length);
  for (let i = 0; i < len; i++) {
    const num1 = clean1[i] ?? 0;
    const num2 = clean2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'YuMusic-Mobile-App',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      published_at?: string;
      html_url?: string;
      assets?: Array<{ browser_download_url?: string; name?: string }>;
    };

    const tagName = data.tag_name || '';
    const currentVersion = Constants.expoConfig?.version || '1.8.0';
    const hasUpdate = compareVersions(tagName, currentVersion) > 0;

    const apkAsset = data.assets?.find((item) => item.name?.endsWith('.apk'));
    const downloadUrl = apkAsset?.browser_download_url || data.html_url || `https://github.com/${GITHUB_REPO}/releases`;

    return {
      tagName,
      versionName: tagName.replace(/^v/i, ''),
      name: data.name || tagName,
      body: data.body || '本次更新包含性能提升与体验优化。',
      publishedAt: data.published_at || '',
      downloadUrl,
      hasUpdate,
    };
  } catch {
    return null;
  }
}

export function openDownloadUrl(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

export async function downloadAndInstallApk(
  downloadUrl: string,
  versionName: string,
  onProgress?: (progress: number) => void
): Promise<boolean> {
  try {
    const fileName = `YuMusic-${versionName}.apk`;
    const targetFile = new File(Paths.cache, fileName);
    
    // 如果已存在且有效，先删除或复用
    if (targetFile.exists) {
      try {
        targetFile.delete();
      } catch {}
    }

    const task = File.createDownloadTask(downloadUrl, targetFile, {
      headers: {
        'User-Agent': 'Mozilla/5.0 YuMusic-App',
        Accept: 'application/octet-stream',
      },
    });

    // 轮询下载任务或者 downloadAsync
    const result = await task.downloadAsync();
    if (!result || !targetFile.exists) {
      return false;
    }

    onProgress?.(1.0);

    // Android: 自动调起系统安装器
    if (Platform.OS === 'android' && isNativeAvailable()) {
      return moekoeNative.installApk(targetFile.uri);
    }
    return true;
  } catch (error) {
    console.error('下载安装包失败', error);
    return false;
  }
}
