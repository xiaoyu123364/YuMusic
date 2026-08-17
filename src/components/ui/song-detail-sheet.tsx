import { useEffect, useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { fetchSongDetail, type SongDetail } from '@/features/song/song-detail-api';
import { fetchSongComments, type SongComment } from '@/features/song/comment-api';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';
import { formatClock } from '@/lib/format';
import { MaterialLoading } from '@/components/ui/loading';

type SongDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: PlayerTrack | null;
};

function DetailRow({ label, value }: { label: string; value?: string }) {
  const palette = usePalette();
  if (!value) {
    return null;
  }

  return (
    <XStack alignItems="center" gap={12} paddingVertical={3}>
      <Text color={palette.textTertiary} fontSize={13} width={76}>
        {label}
      </Text>
      <Text flex={1} color={palette.text} fontSize={13.5} numberOfLines={2}>
        {value}
      </Text>
    </XStack>
  );
}

/** 歌曲详情浏览弹窗：展示专辑、流派、音质码率等元数据。 */
export function SongDetailSheet({ open, onOpenChange, track }: SongDetailSheetProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<SongComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    if (!open || !track) {
      return;
    }

    setLoading(true);
    setDetail(null);
    setComments([]);
    setCommentTotal(0);
    setCommentsLoading(true);
    fetchSongDetail(track)
      .then((result) => setDetail(result))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
    fetchSongComments(track)
      .then((result) => {
        setComments(result.comments);
        setCommentTotal(result.total);
      })
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [open, track?.hash]);

  const qualityText = detail?.qualityLabel && detail.bitRate
    ? `${detail.qualityLabel} · ${detail.bitRate} kbps`
    : detail?.qualityLabel || '—';

  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}>
      <Sheet
        modal={false}
        open={open}
        onOpenChange={onOpenChange}
        snapPointsMode="fit"
        dismissOnSnapToBottom
        transition="medium"
        zIndex={120000}>
        <Sheet.Overlay
          transition="quick"
          backgroundColor="rgba(8, 8, 14, 0.42)"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle backgroundColor={palette.cardAlt} width={40} alignSelf="center" />
        <Sheet.Frame
          backgroundColor={palette.card}
          borderTopLeftRadius={26}
          borderTopRightRadius={26}
          paddingTop="$3"
          paddingHorizontal="$4"
          paddingBottom={Math.max(insets.bottom, 16) + 8}>
          {track ? (
            <YStack gap={16}>
              <XStack alignItems="center" gap={12}>
                <Artwork uri={track.coverUrl} size={68} radius={16} />
                <YStack flex={1} gap={3}>
                  <Text color={palette.text} fontSize={17} fontWeight="800" numberOfLines={1}>
                    {detail?.title || track.title}
                  </Text>
                  <Text color={palette.textSecondary} fontSize={13.5} numberOfLines={1}>
                    {detail?.artist || track.artist || '未知歌手'}
                  </Text>
                  {(track.vip || detail?.vip) ? (
                    <XStack alignSelf="flex-start">
                      <Text
                        color={palette.vip}
                        backgroundColor={palette.vipSoft}
                        fontSize={10}
                        fontWeight="800"
                        paddingHorizontal={7}
                        paddingVertical={2}
                        borderRadius={6}
                        overflow="hidden">
                        VIP
                      </Text>
                    </XStack>
                  ) : null}
                </YStack>
              </XStack>

              {loading ? (
                <YStack alignItems="center" paddingVertical={26}>
                  <MaterialLoading size={20} color={palette.accent} />
                </YStack>
              ) : (
                <YStack
                  backgroundColor={palette.cardAlt}
                  borderRadius={16}
                  paddingHorizontal={16}
                  paddingVertical={12}
                  gap={6}>
                  <DetailRow label="专辑" value={detail?.album || '—'} />
                  <DetailRow label="流派" value={detail?.genre || '—'} />
                  <DetailRow label="语言" value={detail?.language || '—'} />
                  <DetailRow label="音质" value={qualityText} />
                  <DetailRow
                    label="时长"
                    value={formatClock(detail?.durationMs ?? track.durationMs ?? 0)}
                  />
                  <DetailRow label="发行" value={detail?.publishDate || '—'} />
                </YStack>
              )}

              {commentsLoading || comments.length ? (
                <YStack gap={10}>
                  <Text color={palette.text} fontSize={15} fontWeight="700">
                    评论{commentTotal ? ` (${commentTotal})` : ''}
                  </Text>
                  {commentsLoading ? (
                    <YStack alignItems="center" paddingVertical={18}>
                      <MaterialLoading size={20} color={palette.accent} />
                    </YStack>
                  ) : (
                    <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                      <YStack gap={10}>
                        {comments.map((comment) => (
                          <YStack
                            key={comment.id}
                            gap={6}
                            padding={12}
                            borderRadius={14}
                            backgroundColor={palette.cardAlt}>
                            <XStack alignItems="center" gap={8}>
                              <Artwork uri={comment.userAvatar} size={26} circle />
                              <Text
                                flex={1}
                                color={palette.textSecondary}
                                fontSize={12.5}
                                fontWeight="600"
                                numberOfLines={1}>
                                {comment.userName}
                              </Text>
                              {comment.likeCount > 0 ? (
                                <Text color={palette.textTertiary} fontSize={11}>
                                  赞 {comment.likeCount}
                                </Text>
                              ) : null}
                            </XStack>
                            <Text color={palette.text} fontSize={13.5} lineHeight={19}>
                              {comment.content}
                            </Text>
                          </YStack>
                        ))}
                      </YStack>
                    </ScrollView>
                  )}
                </YStack>
              ) : null}

              <XStack
                height={44}
                borderRadius={14}
                alignItems="center"
                justifyContent="center"
                backgroundColor={palette.cardAlt}
                transition="quickest"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => onOpenChange(false)}>
                <Text color={palette.textSecondary} fontSize={14.5} fontWeight="600">
                  关闭
                </Text>
              </XStack>
            </YStack>
          ) : null}
        </Sheet.Frame>
      </Sheet>
    </Modal>
  );
}
