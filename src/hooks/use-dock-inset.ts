import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { DockGap, TabBarBottomInset, TabBarHeight } from '@/constants/layout';
import { useHasTrack } from '@/features/player/store';

/** Tab 页滚动内容需要预留的底部空间（悬浮 TabBar + MiniPlayer）。 */
export function useDockContentInset(): number {
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();

  return (
    insets.bottom +
    TabBarBottomInset +
    TabBarHeight +
    (hasTrack ? DockGap + MINI_PLAYER_HEIGHT : 0) +
    20
  );
}
