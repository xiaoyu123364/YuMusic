import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, TextInput, ToastAndroid, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';
import { BlurView } from 'expo-blur';

import { Artwork } from '@/components/ui/artwork';
import { MaterialLoading } from '@/components/ui/loading';
import { fetchSongComments, postSongComment, type SongComment } from '@/features/song/comment-api';
import type { PlayerTrack } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';

const GOOGLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];
const PAGE_SIZE = 30;

type CommentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: PlayerTrack | null;
};

/** 歌曲评论底部抽屉：展示热评与最新评论，支持下拉刷新与分页加载。 */
export function CommentSheet({ open, onOpenChange, track }: CommentSheetProps) {
  const palette = usePalette();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [comments, setComments] = useState<SongComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inputText, setInputText] = useState('');
  const [posting, setPosting] = useState(false);

  async function load(reset: boolean) {
    if (!track) {
      return;
    }
    const targetPage = reset ? 1 : page + 1;
    if (reset) {
      setComments([]);
      setTotal(0);
      setPage(1);
      setHasMore(false);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchSongComments(track, targetPage, PAGE_SIZE);
      setComments((current) => {
        if (targetPage === 1) {
          return result.comments;
        }
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.comments.filter((item) => !seen.has(item.id))];
      });
      setTotal(result.total);
      setPage(targetPage);
      setHasMore(targetPage * PAGE_SIZE < result.total);
    } catch {
      // 忽略加载失败
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!open || !track) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, track?.hash]);

  const onRefresh = () => {
    setRefreshing(true);
    void load(true);
  };

  const handlePostComment = async () => {
    if (!inputText.trim() || !track || posting) return;
    setPosting(true);
    try {
      const newComment = await postSongComment(track, inputText.trim());
      setComments((current) => [newComment, ...current]);
      setTotal((t) => t + 1);
      setInputText('');
      ToastAndroid.show('评论发表成功！', ToastAndroid.SHORT);
    } catch (e) {
      ToastAndroid.show('评论发表失败', ToastAndroid.SHORT);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              overflow: 'hidden',
            },
          ]}>
          <XStack
            width={40}
            height={4}
            borderRadius={2}
            alignSelf="center"
            marginBottom={14}
            backgroundColor={palette.cardAlt}
          />
          <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={20}>
            <Text color={palette.text} fontSize={18} fontWeight="800">
              评论{total ? ` (${total})` : ''}
            </Text>
            <XStack
              width={30}
              height={30}
              borderRadius={15}
              alignItems="center"
              justifyContent="center"
              backgroundColor={palette.cardAlt}
              transition="quickest"
              pressStyle={{ opacity: 0.6, scale: 0.92 }}
              onPress={() => onOpenChange(false)}>
              <Ionicons name="chevron-down" size={18} color={palette.textSecondary} />
            </XStack>
          </XStack>

          {loading ? (
            <YStack paddingHorizontal={16} paddingTop={16} gap={14}>
              {[0, 1, 2, 3].map((item) => (
                <XStack key={item} gap={10} alignItems="center">
                  <View width={34} height={34} borderRadius={17} backgroundColor={palette.cardAlt} />
                  <YStack flex={1} gap={7}>
                    <View width="42%" height={11} borderRadius={6} backgroundColor={palette.cardAlt} />
                    <View width="88%" height={11} borderRadius={6} backgroundColor={palette.cardAlt} />
                    <View width="60%" height={11} borderRadius={6} backgroundColor={palette.cardAlt} />
                  </YStack>
                </XStack>
              ))}
            </YStack>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: Math.round(height * 0.62) }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={palette.accent}
                  colors={GOOGLE_COLORS}
                  progressBackgroundColor={palette.card}
                />
              }
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (hasMore && !loading && !loadingMore) {
                  void load(false);
                }
              }}
              ListEmptyComponent={
                <YStack alignItems="center" paddingVertical={50} gap={8}>
                  <Text color={palette.textTertiary} fontSize={13.5}>
                    暂无评论，来抢沙发吧
                  </Text>
                </YStack>
              }
              ListFooterComponent={
                loadingMore ? (
                  <XStack justifyContent="center" paddingVertical={14}>
                    <MaterialLoading size={20} color={palette.accent} />
                  </XStack>
                ) : null
              }
              renderItem={({ item }) => (
                <XStack gap={10} alignItems="flex-start">
                  <Artwork uri={item.userAvatar} size={34} circle />
                  <YStack flex={1} gap={5}>
                    <XStack alignItems="center" gap={8}>
                      <Text color={palette.textSecondary} fontSize={12.5} fontWeight="600" numberOfLines={1}>
                        {item.userName}
                      </Text>
                      {item.likeCount > 0 ? (
                        <Text color={palette.textTertiary} fontSize={11}>
                          赞 {item.likeCount}
                        </Text>
                      ) : null}
                    </XStack>
                    <Text color={palette.text} fontSize={14} lineHeight={20}>
                      {item.content}
                    </Text>
                  </YStack>
                </XStack>
              )}
            />
          )}

          <BlurView
            intensity={80}
            tint={isDark ? 'dark' : 'light'}
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: palette.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
            <View flex={1} backgroundColor={palette.cardAlt} borderRadius={20} paddingHorizontal={16} paddingVertical={8}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="写下你的听歌心情..."
                placeholderTextColor={palette.textTertiary}
                style={{ color: palette.text, fontSize: 14, padding: 0 }}
                onSubmitEditing={handlePostComment}
              />
            </View>
            <Pressable
              onPress={handlePostComment}
              disabled={posting || !inputText.trim()}
              style={{ opacity: posting || !inputText.trim() ? 0.5 : 1 }}>
              <Ionicons name="send" size={24} color={palette.accent} />
            </Pressable>
          </BlurView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 8, 14, 0.42)',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    maxHeight: '82%',
    minHeight: 200,
  },
});
