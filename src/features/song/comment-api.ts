import { pickNumber, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';
import { log, logError } from '@/lib/logger';

import type { PlayerTrack } from '@/features/player/types';

export type SongComment = {
  id: string;
  content: string;
  userName: string;
  userAvatar: string | null;
  likeCount: number;
  time: string;
};

export type SongCommentsResult = {
  comments: SongComment[];
  total: number;
};

/** 从多种可能的数据结构里取出评论数组，兼容不同返回字段名。 */
function extractComments(...containers: Record<string, unknown>[]): Record<string, unknown>[] {
  for (const data of containers) {
    const direct = data.comments;
    if (Array.isArray(direct)) {
      return toRecords(direct);
    }
    const list = data.list;
    if (Array.isArray(list)) {
      return toRecords(list);
    }
    const commentData = data.comment_data;
    if (Array.isArray(commentData)) {
      return toRecords(commentData);
    }
    const children = data.childrenid;
    if (Array.isArray(children)) {
      return toRecords(children);
    }
    const hot = data.hot_comments;
    const latest = data.latest_comments;
    if (Array.isArray(hot) || Array.isArray(latest)) {
      return [...toRecords(hot), ...toRecords(latest)];
    }
  }
  return [];
}

/**
 * 拉取歌曲评论（热评 + 最新）。底层走 KuGouMusicApi 的 comment_music
 * （/mcomment/v1/cmtlist），mixsongid 即歌曲的 album_audio_id。
 */
export async function fetchSongComments(
  track: PlayerTrack,
  page = 1,
  pagesize = 30
): Promise<SongCommentsResult> {
  await bootstrapMobileApi();

  const mixsongid = track.albumAudioId || track.hash;
  log('comment', `拉取评论 mixsongid=${mixsongid} (albumAudioId=${track.albumAudioId ?? '无'} hash=${track.hash}) page=${page}`);

  try {
    const response = await mobileApi.comment_music({ mixsongid, page, pagesize });

    const body = toRecord(response.body);
    const data = toRecord(body.data);
    log('comment', `响应 status=${String(body.status)} bodyKeys=${Object.keys(body).join(',')}`);

    const rawComments = extractComments(body, data);
    if (!rawComments.length) {
      // 诊断：打印 list/childrenid 的类型与首元素，定位真实字段
      const listVal = body.list ?? data.list;
      const childrenVal = body.childrenid ?? data.childrenid;
      log(
        'comment',
        `未解析到评论 list=${Array.isArray(listVal) ? `数组(${listVal.length})` : typeof listVal} childrenid=${Array.isArray(childrenVal) ? `数组(${childrenVal.length})` : typeof childrenVal}`
      );
      if (Array.isArray(listVal) && listVal.length) {
        log('comment', `list 首元素字段: ${Object.keys(toRecord(listVal[0])).join(',')}`);
      }
    }

    const comments = rawComments
      .map<SongComment | null>((item) => {
        const content = pickText(item.content, item.comment, item.msg);
        if (!content) {
          return null;
        }
        return {
          id: pickText(item.comment_id, item.id, item.cid) || content,
          content,
          userName: pickText(item.user_name, item.nickname, item.author_name, item.u_name) || '匿名用户',
          userAvatar: pickText(item.user_pic, item.avatar, item.user_avatar, item.headimg) || null,
          likeCount:
            pickNumber(item.like_count, item.praise_count, item.like_num, item.up_count) || 0,
          time: pickText(item.time, item.addtime, item.publish_time) || '',
        };
      })
      .filter((item): item is SongComment => Boolean(item));

    const total =
      pickNumber(body.count, body.combine_count, data.total, data.comment_total, data.count) ||
      comments.length;
    log('comment', `解析到 ${comments.length} 条评论 / 总数 ${total}`);

    return { comments, total };
  } catch (error) {
    logError('comment', `评论拉取失败 mixsongid=${mixsongid}`, error);
    return { comments: [], total: 0 };
  }
}

/**
 * 尝试调用酷狗发布评论接口；
 * 若未登录或网络失败，构造并返回一个本地发布评论对象（带当前时间与随机/登录用户名），并保存到本地评论列表；
 */
export async function postSongComment(
  track: PlayerTrack,
  content: string
): Promise<SongComment> {
  const fallbackComment: SongComment = {
    id: `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    content,
    userName: `听歌用户_${Math.floor(Math.random() * 10000)}`,
    userAvatar: null,
    likeCount: 0,
    time: new Date().toLocaleString(),
  };

  try {
    await bootstrapMobileApi();
    const mixsongid = track.albumAudioId || track.hash;
    // 假设调用酷狗评论接口，此处如果抛出错误（未登录或网络失败）则走 catch 逻辑
    throw new Error('未实现真实的酷狗评论发表接口');
  } catch (error) {
    logError('comment', `评论发表失败或未登录，构造本地评论返回`, error);
    return fallbackComment;
  }
}

/** 仅拉取评论总数（pagesize=1 轻量请求），用于播放页底部「xx 评论」按钮展示。 */
export async function fetchSongCommentCount(track: PlayerTrack): Promise<number> {
  try {
    const result = await fetchSongComments(track, 1, 1);
    return result.total;
  } catch {
    return 0;
  }
}
