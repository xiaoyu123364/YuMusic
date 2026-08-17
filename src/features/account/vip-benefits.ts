import * as SecureStore from 'expo-secure-store';

import { showToast } from '@/components/ui/toast';
import { bootstrapMobileApi } from '@/lib/kugou-api';

import { isLoggedIn } from './user-api';
import { signInDailyVip, upgradeDailyVip, claimListenVip } from './vip-api';
import { vipStoreActions } from './vip-store';

const LAST_AUTO_CLAIM_KEY = 'moekoe.vip.last-auto-claim';

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

async function readLastClaimDay(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_AUTO_CLAIM_KEY);
  } catch {
    return null;
  }
}

async function writeLastClaimDay(day: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_AUTO_CLAIM_KEY, day);
  } catch {
    // 忽略存储失败，仅失去当日去重能力
  }
}

/** 本次会话是否已经触发过自动领取，避免同一前台生命周期内重复调用。 */
let sessionClaimed = false;
let inflight: Promise<void> | null = null;

/**
 * 静默/自动领取酷狗 VIP 权益与抽奖：
 * 1. 概念版每日签到（1 天畅听 VIP）；
 * 2. 升级为概念版 VIP（更高音质，一天仅一次）；
 * 3. 听歌时长领取；
 * 领取成功后自动刷新 VIP 状态，驱动音质特权解锁。
 *
 * 幂等：同一天内只真正执行一次；所有失败静默降级，不影响播放主流程。
 */
export function autoClaimVipBenefits(): Promise<void> {
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      if (sessionClaimed) {
        return;
      }

      const today = todayKey();
      if ((await readLastClaimDay()) === today) {
        sessionClaimed = true;
        return;
      }

      // 先初始化运行时并水合会话，再判断登录态，否则冷启动时会误判为未登录。
      await bootstrapMobileApi();

      if (!isLoggedIn()) {
        return;
      }

      // 签到：成功或“今天已签”都继续；风控等异常直接放弃本次静默领取。
      const signIn = await signInDailyVip();

      // 真正领取成功时给一个轻量提示，让用户感知到后台自动领取。
      if (!signIn.alreadyDone) {
        showToast('✨ 已自动领取今日 VIP 权益');
      }

      if (signIn.canUpgrade) {
        // 静默升级到概念版最高档权益，失败不阻断。
        await upgradeDailyVip().catch(() => undefined);
      }

      // 听歌时长领取，尽力而为。
      await claimListenVip().catch(() => undefined);

      sessionClaimed = true;
      await writeLastClaimDay(today);
    } catch {
      // 静默领取失败不打断任何流程
    } finally {
      // 无论是否领取成功，都尝试刷新一次 VIP 状态，使界面/音质权益保持最新。
      try {
        await vipStoreActions.refresh();
      } catch {
        // 忽略
      }
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
