import { pickNumber, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

export type VipSignInResult = {
  message: string;
  /** 是否是“今天已签到”这类非错误的提示（用于区分成功/中性/失败的展示）。 */
  alreadyDone: boolean;
  /** 签到态正常（成功或今天已签），可以继续询问升级概念版 VIP；风控等异常不给升级入口。 */
  canUpgrade?: boolean;
};

/** VIP 等级，从高到低排序（svip=豪华 VIP，vip=音乐 VIP，youth=概念版畅听 VIP）。 */
export type VipTier = 'svip' | 'vip' | 'youth';

export type VipStatus = {
  isVip: boolean;
  tier: VipTier | null;
  /** 展示用文案，如「豪华VIP」「概念版VIP」。 */
  label: string;
  productName: string;
  expireAt: string;
};

const TIER_RANK: Record<VipTier, number> = { svip: 3, vip: 2, youth: 1 };

function toTier(productType: string): VipTier | null {
  const normalized = productType.toLowerCase();
  if (normalized.includes('svip') || normalized.includes('豪华') || normalized.includes('premium')) {
    return 'svip';
  }
  if (normalized.includes('youth') || normalized.includes('概念') || normalized.includes('畅听')) {
    return 'youth';
  }
  if (normalized.includes('vip')) {
    return 'vip';
  }
  return null;
}

/** 从 busi_vip 记录中选出当前有效的最高等级 VIP。 */
export function pickHighestVipTier(records: Record<string, unknown>[]): VipStatus {
  let best: { tier: VipTier; productName: string; expireAt: string } | null = null;

  for (const item of records) {
    if (pickNumber(item.is_vip) !== 1) {
      continue;
    }
    const tier = toTier(pickText(item.product_type, item.product_name));
    if (!tier) {
      continue;
    }
    if (!best || TIER_RANK[tier] > TIER_RANK[best.tier]) {
      best = {
        tier,
        productName: pickText(item.product_name, item.product_type),
        expireAt: pickText(item.expire_time, item.end_time, item.valid_time),
      };
    }
  }

  if (!best) {
    return { isVip: false, tier: null, label: '', productName: '', expireAt: '' };
  }

  return {
    isVip: true,
    tier: best.tier,
    label: best.tier === 'svip' ? '豪华VIP' : best.tier === 'vip' ? 'VIP' : '概念版VIP',
    productName: best.productName,
    expireAt: best.expireAt,
  };
}

/** 拉取并解析当前账号 VIP 详情，返回最高档位权益。 */
export async function fetchVipStatus(): Promise<VipStatus> {
  await bootstrapMobileApi();
  const response = await mobileApi.user_vip_detail({});
  const data = toRecord(toRecord(response.body).data);
  const records = toRecords(data.busi_vip);
  return pickHighestVipTier(records);
}

/** 听歌时长领取（概念版「听歌领 VIP」），尽力而为，失败不阻断。 */
export async function claimListenVip(): Promise<boolean> {
  await bootstrapMobileApi();
  try {
    await mobileApi.youth_listen_song({});
    return true;
  } catch {
    return false;
  }
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

/** 提取酷狗返回体里的错误码，兼容 { error_code } 与包在 body 里的两种形态。 */
function pickErrorCode(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0;
  }
  const record = error as Record<string, unknown>;
  const bodyCode = pickNumber(toRecord(record.body).error_code);
  if (bodyCode) {
    return bodyCode;
  }
  const responseCode = pickNumber(toRecord(toRecord(record.response).data).error_code);
  if (responseCode) {
    return responseCode;
  }
  const direct = pickNumber(record.error_code, record.status);
  if (direct) {
    return direct;
  }
  return 0;
}

/**
 * 概念版每日签到：领取 1 天畅听 VIP。
 * 对应桌面端「个人中心 → 签到」调用的 /youth/day/vip。
 */
export async function signInDailyVip(): Promise<VipSignInResult> {
  await bootstrapMobileApi();

  try {
    const response = await mobileApi.youth_day_vip({ receive_day: todayKey() });
    const body = toRecord(response.body);
    if (pickNumber(body.status) === 1) {
      return { message: '签到成功，获得 1 天畅听 VIP', alreadyDone: false, canUpgrade: true };
    }
    const msg = pickText(body.error_msg);
    return { message: msg || '签到失败，请稍后重试', alreadyDone: false };
  } catch (error) {
    const code = pickErrorCode(error);
    if (code === 131001) {
      return { message: '你今天已经签到过了', alreadyDone: true, canUpgrade: true };
    }
    if (code === 20028) {
      return { message: '当前账号存在风控，请前往手机酷狗领取', alreadyDone: true };
    }
    const msg = pickText(toRecord((error as Record<string, unknown>)?.body).error_msg);
    throw new Error(msg || `签到失败${code ? `（${code}）` : ''}`);
  }
}

/**
 * 升级为概念版 VIP（更高音质），一天仅一次。
 * 对应桌面端 /youth/day/vip/upgrade。
 */
export async function upgradeDailyVip(): Promise<VipSignInResult> {
  await bootstrapMobileApi();

  try {
    const response = await mobileApi.youth_day_vip_upgrade({
      userid: getApiSession().userid,
    });
    const body = toRecord(response.body);
    if (pickNumber(body.status) === 1) {
      return { message: '升级成功，获得 1 天概念版 VIP', alreadyDone: false };
    }
    const msg = pickText(body.error_msg);
    return { message: msg || '升级失败，一天仅限一次', alreadyDone: true };
  } catch (error) {
    const code = pickErrorCode(error);
    if (code === 131001) {
      return { message: '你今天已经签到过了', alreadyDone: true };
    }
    if (code === 20028) {
      return { message: '当前账号风控,请前往手机端领取', alreadyDone: true };
    }
    const msg = pickText(toRecord((error as Record<string, unknown>)?.body).error_msg);
    throw new Error(msg || '升级 VIP 失败，一天仅限一次');
  }
}
