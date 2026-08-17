import { useSyncExternalStore } from 'react';

import { fetchVipStatus, type VipStatus } from './vip-api';

export type VipStoreState = {
  status: VipStatus;
  /** 最近一次刷新时间戳，供 UI 判断是否需要重新拉取。 */
  updatedAt: number;
};

const INITIAL_STATE: VipStoreState = {
  status: { isVip: false, tier: null, label: '', productName: '', expireAt: '' },
  updatedAt: 0,
};

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const vipStore = createStore(INITIAL_STATE);

let refreshPromise: Promise<VipStatus> | null = null;

export const vipStoreActions = {
  /** 刷新 VIP 状态；并发调用合并为一次网络请求。 */
  refresh(): Promise<VipStatus> {
    if (!refreshPromise) {
      refreshPromise = fetchVipStatus()
        .then((status) => {
          vipStore.setState({ status, updatedAt: Date.now() });
          return status;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  },

  /** 直接写入最新状态（领取成功后由上层调用，避免再次请求）。 */
  setStatus(status: VipStatus) {
    vipStore.setState({ status, updatedAt: Date.now() });
  },

  reset() {
    vipStore.setState(INITIAL_STATE);
  },
};

export function getVipStatus(): VipStatus {
  return vipStore.getState().status;
}

export function useVipStatus(): VipStatus {
  return useSyncExternalStore(
    vipStore.subscribe,
    () => vipStore.getState().status,
    () => INITIAL_STATE.status
  );
}
