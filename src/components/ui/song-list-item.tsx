import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';
import { formatClock } from '@/lib/format';

type SongListItemProps = {
  track: PlayerTrack;
  active?: boolean;
  rank?: number;
  onPress: () => void;
  /** 打开歌曲操作面板(收藏/分享等);同时作为长按行为。 */
  onMore?: () => void;
  /** 多选模式下是否被选中；undefined 表示非多选模式。 */
  selected?: boolean;
};

export const SongListItem = memo(function SongListItem({
  track,
  active = false,
  rank,
  onPress,
  onMore,
  selected,
}: SongListItemProps) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingHorizontal="$3"
      paddingVertical={10}
      borderRadius={16}
      backgroundColor={active ? palette.accentSoft : 'transparent'}
      transition="quickest"
      pressStyle={{ opacity: 0.65, scale: 0.985 }}
      onPress={onPress}
      onLongPress={onMore}>
      {typeof rank === 'number' ? (
        <Text
          width={26}
          textAlign="center"
          color={rank <= 3 ? palette.accent : palette.textTertiary}
          fontSize={15}
          fontWeight="700">
          {String(rank).padStart(2, '0')}
        </Text>
      ) : null}

      <Artwork uri={track.coverUrl} size={48} radius={12} />

      <YStack flex={1} gap={3}>
        <Text
          flexShrink={1}
          color={active ? palette.accent : palette.text}
          fontSize={15}
          fontWeight="600"
          numberOfLines={1}>
          {track.title}
        </Text>
        <Text color={palette.textSecondary} fontSize={12.5} numberOfLines={1}>
          {track.artist || '未知歌手'}
          {track.album ? ` · ${track.album}` : ''}
        </Text>
      </YStack>

      {selected !== undefined ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={selected ? palette.accent : palette.textTertiary}
        />
      ) : active ? (
        <Ionicons name="pulse" size={18} color={palette.accent} />
      ) : track.durationMs ? (
        <Text color={palette.textTertiary} fontSize={12} fontVariant={['tabular-nums']}>
          {formatClock(track.durationMs)}
        </Text>
      ) : null}

      {onMore ? (
        <XStack
          width={30}
          height={34}
          marginLeft={-6}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.5, scale: 0.9 }}
          onPress={(event) => {
            event.stopPropagation();
            onMore();
          }}>
          <Ionicons name="ellipsis-vertical" size={16} color={palette.textTertiary} />
        </XStack>
      ) : null}
    </XStack>
  );
});
