'use strict';

/**
 * YuMusic PC 端批量添加歌曲到自定义名称的歌单
 *
 * 用法（在项目根目录执行）：
 *   node scripts/batch-playlist.cjs --playlist "我的歌单" --file songs.txt
 *
 * songs.txt 每行一首，支持三种写法（可混用）：
 *   1. 搜索关键词：周杰伦 晴天          （自动搜索取第一条结果）
 *   2. 歌曲 hash：A1B2C3...（32 位）
 *   3. 分享码：YM<32位hash>             （与 App 内分享码一致）
 *
 * 首次运行需要登录：默认手机号 + 短信验证码（终端交互输入）；
 * 也可加 --qr 改为扫码登录。登录态与设备 ID 缓存在 ~/.yumusic-cli.json。
 *
 * 可选参数：
 *   --download  写完歌单后把全部歌曲下载到本地（默认最高可用音质）
 *   --out 目录   指定下载保存目录（默认 downloads/<歌单名>）
 *   --dry-run   只解析并展示将添加的歌曲，不实际写入歌单
 *   --json      打印解析结果为 JSON（供其它工具消费）
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtime = require('../src/lib/kugou-api/runtime');
const useAxios = runtime.createRequest;

const VENDOR = (name) => require(`../src/lib/kugou-api/vendor/module/${name}.js`);

const STATE_PATH = path.join(os.homedir(), '.yumusic-cli.json');
const ADD_BATCH_SIZE = 30;

/* ---------- 工具 ---------- */

function pickText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function toRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else if (args[key]) {
        // 同一 flag 重复出现时收为数组（如多个 --file 合并进一个歌单）
        if (!Array.isArray(args[key])) args[key] = [args[key]];
        args[key].push(next);
        i += 1;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  console.log(`[state] 已保存到 ${STATE_PATH}`);
}

/* ---------- 会话 / 设备 ---------- */

const state = loadState();
if (!state.guid) state.guid = runtime.getGuid();
if (!state.session) state.session = {};

// 与 App 内 device.ts 相同的派生链路：guid -> mid -> webgl。
process.env.KUGOU_API_GUID = state.guid;
process.env.KUGOU_API_MID = runtime.calculateMid(state.guid);
if (!process.env.KUGOU_API_WEBGL) process.env.KUGOU_API_WEBGL = runtime.generateWebGLHash();

function absorbCookies(result) {
  const cookies = Array.isArray(result?.cookie) ? result.cookie : [];
  for (const entry of cookies) {
    const index = String(entry).indexOf('=');
    if (index <= 0) continue;
    const key = String(entry).slice(0, index).trim();
    const value = String(entry).slice(index + 1).trim();
    if (key && value && value !== 'deleted') state.session[key] = value;
  }
}

async function call(moduleName, params = {}) {
  const moduleFn = VENDOR(moduleName);
  const result = await moduleFn({ ...params, cookie: { ...state.session, ...(params.cookie ?? {}) } }, useAxios);
  absorbCookies(result);
  return result;
}

function ensureLoggedIn() {
  return Boolean(state.session.token && state.session.userid);
}

async function registerDevice() {
  console.log('[device] 注册设备…');
  // 风控接口偶发返回明文错误（不产生 dfid），重试几次；dfid 非登录必需，失败仅告警
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await call('register_dev', { uuid: state.guid, imei: state.guid });
      const body = toRecord(result.body);
      if (body.status === 1 && body.data?.dfid) {
        state.session.dfid = body.data.dfid;
        console.log(`[device] 注册成功 dfid=${body.data.dfid}`);
        return;
      }
      if (attempt < 3) {
        console.warn(`[device] 第 ${attempt} 次未拿到 dfid（${pickText(body.error_msg, `status=${body.status}`, '空响应')}），重试…`);
      }
    } catch (error) {
      if (attempt >= 3) break;
      console.warn(`[device] 第 ${attempt} 次失败：${error.message}，重试…`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  console.warn('[device] 设备注册未成功，继续尝试登录（不影响验证码登录）');
}

/** 手机号 + 短信验证码登录。 */
async function loginBySmsCode() {
  const rl = require('node:readline/promises').createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n========== 酷狗登录（验证码） ==========');
  let mobile = '';
  while (!/^1\d{10}$/.test(mobile)) {
    mobile = (await rl.question('请输入酷狗绑定的手机号（11 位）：')).trim();
    if (!/^1\d{10}$/.test(mobile)) console.log('手机号格式不对，应为 1 开头的 11 位数字。');
  }

  console.log('发送验证码…');
  const sentResult = await call('captcha_sent', { mobile });
  const sentBody = toRecord(sentResult.body);
  const sentStatus = Number(sentBody.status);
  if (sentBody.error_code !== undefined && Number(sentBody.error_code) !== 0) {
    throw new Error(`验证码发送失败: ${pickText(sentBody.error_msg, sentBody.hint, JSON.stringify(sentBody).slice(0, 120))}`);
  }
  if (sentStatus && sentStatus !== 1 && sentStatus !== 200) {
    throw new Error(`验证码发送失败: ${pickText(sentBody.error_msg, sentBody.hint, `status=${sentStatus}`)}`);
  }
  console.log(`验证码已发送到 ${mobile.slice(0, 3)}****${mobile.slice(7)}，请注意查收短信。\n`);

  let code = '';
  while (!/^\d{4,6}$/.test(code)) {
    code = (await rl.question('请输入收到的短信验证码：')).trim();
    if (!/^\d{4,6}$/.test(code)) console.log('验证码格式不对，应为 4-6 位数字。');
  }
  rl.close();

  console.log('登录中…');
  await call('login_cellphone', { mobile, code });
  // token/userid 已由 call() 内部的 absorbCookies 从 resp.cookie 写入会话
  if (!ensureLoggedIn()) {
    throw new Error('验证码登录未成功（token 未返回），请确认验证码正确后重试');
  }
  saveState(state);
  console.log(`登录成功 userid=${state.session.userid}\n`);
}

/** 终端渲染二维码 + 打印链接兜底（--qr 时使用）。 */
async function loginByQrCode() {
  const qrcode = require('qrcode');
  console.log('\n========== 酷狗登录 ==========');
  console.log('用「酷狗音乐」App 扫描下方二维码并确认登录：\n');

  const keyResult = await call('login_qr_key', {});
  const key = pickText(toRecord(toRecord(keyResult.body).data).qrcode);
  if (!key) throw new Error('获取登录二维码 key 失败');

  const loginUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${key}`;
  try {
    const text = await qrcode.toString(loginUrl, { type: 'terminal', small: true });
    console.log(text);
  } catch {
    // 渲染失败时仅打印链接
  }
  console.log(`若无法扫码，可在浏览器打开该链接后用 App 授权：\n${loginUrl}\n`);

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    let check;
    try {
      check = await call('login_qr_check', { key });
    } catch {
      continue;
    }

    const status = Number(toRecord(toRecord(check.body).data).status);
    if (status === 1) console.log('- 已扫码，等待手机上确认…');
    if (status === 4) {
      // token/userid 已由 call() 内部的 absorbCookies 从 resp.cookie 写入会话
      break;
    }
    if (status === 0) throw new Error('二维码已过期，请重新运行');
  }

  if (!ensureLoggedIn()) throw new Error('登录超时/未完成，请重试');
  saveState(state);
  console.log(`登录成功 userid=${state.session.userid}\n`);
}

/* ---------- 歌曲解析 ---------- */

function decodeShareCode(input) {
  const match = input.trim().match(/^YM[-#:·\s]?([0-9A-Fa-f]{32})$/i);
  return match ? match[1].toUpperCase() : null;
}

async function resolveTrack(line) {
  const text = line.trim();
  if (!text || text.startsWith('#')) return null;

  // 分享码 / 裸 hash：直接拉歌曲详情
  const hash = decodeShareCode(text) ?? (/^[0-9A-Fa-f]{32}$/.test(text.trim()) ? text.trim().toUpperCase() : null);
  if (hash) {
    const response = await call('audio', { hash });
    const body = toRecord(response.body);
    const data = toRecord(body.data);
    const record = Object.keys(data).length ? data : body;
    const albumId = pickText(record.album_id, toRecord(record.albums)?.id);
    return {
      name: `${pickText(record.singername, record.author_name, '未知歌手')} - ${pickText(record.songname, record.filename, hash)}`.replace(/[,|]/g, ' '),
      hash,
      album_id: /^\d+$/.test(albumId) ? albumId : '0',
      mixsongid: pickText(record.album_audio_id, record.mixsongid, '0') || '0',
      audio_id: pickText(record.album_audio_id, '0') || '0',
      source: text.startsWith('YM') || /^YM/i.test(text) ? '分享码' : 'hash',
      query: text,
    };
  }

  // 关键词搜索取第一条
  const response = await call('search', { keywords: text, page: 1, pagesize: 10, type: 'song' });
  const lists = toRecord(toRecord(response.body).data).lists;
  const first = Array.isArray(lists) ? lists[0] : null;
  if (!first) {
    return { error: `未搜到结果: ${text}` };
  }
  const fileHash = pickText(first.FileHash, first.Hash);
  if (!fileHash) {
    return { error: `搜索结果缺少 hash: ${text}` };
  }
  return {
    name: `${pickText(first.SingerName, '未知歌手')} - ${pickText(first.OriSongName, first.SongName, first.FileName)}`.replace(/[,|]/g, ' '),
    hash: fileHash.toUpperCase(),
    album_id: pickText(first.AlbumID) || '0',
    mixsongid: pickText(first.MixSongID, first.AlbumAudioID) || '0',
    audio_id: pickText(first.AlbumAudioID, first.MixSongID) || '0',
    source: '搜索',
    query: text,
  };
}

/* ---------- 歌单定位与写入 ---------- */

async function findPlaylistByName(name) {
  for (let page = 1; page <= 5; page += 1) {
    const response = await call('user_playlist', { page, pagesize: 100 });
    const info = toRecord(toRecord(response.body).data).info;
    const list = Array.isArray(info) ? info : [];
    const hit = list.find((item) => pickText(item.name) === name && !item.authors);
    if (hit) return { listid: pickText(hit.listid), gid: pickText(hit.list_create_gid), count: Number(hit.count ?? 0) };
    if (list.length < 100) break;
  }
  return null;
}

async function createPlaylist(name) {
  console.log(`[playlist] 「${name}」不存在，创建中…`);
  const response = await call('playlist_add', { name, list_create_userid: state.session.userid });
  const body = toRecord(response.body);
  if (Number(body.status) !== 1) {
    throw new Error(`创建歌单失败: ${pickText(body.error_msg, body.error, `HTTP ${response.status}`)}`);
  }
  const listid = pickText(toRecord(toRecord(body.data).info).listid);
  if (!listid) throw new Error('创建歌单成功但未返回 listid');
  return { listid };
}

async function addTracks(listid, tracks) {
  let ok = 0;
  for (let i = 0; i < tracks.length; i += ADD_BATCH_SIZE) {
    const batch = tracks.slice(i, i + ADD_BATCH_SIZE);
    const data = batch
      .map((track) => [track.name, track.hash, track.album_id, track.mixsongid].join('|'))
      .join(',');
    const response = await call('playlist_tracks_add', { listid, data });
    const body = toRecord(response.body);
    if (Number(body.status) === 1) {
      ok += batch.length;
      console.log(`[add] ${ok}/${tracks.length} 已写入`);
    } else {
      console.warn(`[add] 批次失败: ${pickText(body.error_msg, body.error, `HTTP ${response.status}`)}`);
    }
  }
  return ok;
}

/* ---------- 下载 ---------- */

const QUALITY_ORDER = ['super', 'viper_atmos', 'viper_tape', 'multitrack', 'flac', 'high', '320', '128'];

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** 取单首歌的最佳可用音质直链（实测结构：data[] 每项 info.tracker_url 为直链数组；album_audio_id 必须是字符串） */
async function resolveDownloadUrl(track) {
  const response = await call('song_url_new', {
    hash: track.hash,
    album_audio_id: String(track.audio_id || track.mixsongid || 0),
  });
  const body = toRecord(response.body);
  if (!Array.isArray(body.data) || !body.data.length) {
    throw new Error(pickText(body.error_msg, body.message, body.error, '取链失败'));
  }

  // 多条目时选可用链接里码率最高的
  let best = null;
  for (const item of body.data) {
    const info = toRecord(item.info);
    const urls = Array.isArray(info.tracker_url) ? info.tracker_url.filter(Boolean) : [];
    if (!urls.length) continue;
    const bitrate = Number(info.bitrate) || 0;
    if (!best || bitrate > best.bitrate) {
      best = { url: String(urls[0]), bitrate, quality: `${info.bitrate || '?'}kbps`, ext: pickText(info.extname, 'mp3') };
    }
  }
  if (best) return best;

  // 兜底：旧结构 url: { 音质: [...] }
  const info = toRecord(body.data[0]?.info);
  const urlMap = toRecord(info.url) || toRecord(body.data[0]?.url);
  for (const quality of QUALITY_ORDER) {
    const candidates = urlMap[quality];
    if (Array.isArray(candidates) && candidates[0]) {
      return { url: String(candidates[0]), bitrate: 0, quality, ext: quality === 'flac' || quality.startsWith('viper') ? 'flac' : 'mp3' };
    }
  }
  if (Array.isArray(info.tracker_url) && info.tracker_url[0]) {
    return { url: String(info.tracker_url[0]), bitrate: 0, quality: 'auto', ext: pickText(info.extname, 'mp3') };
  }
  throw new Error('响应中无可用下载链接');
}

async function downloadTrack(track, outDir) {
  const link = await resolveDownloadUrl(track);
  const dest = path.join(outDir, `${sanitizeName(track.name)} [${track.hash.slice(0, 8)}].${link.ext}`);
  if (fs.existsSync(dest)) {
    console.log(`[dl] ↷ 已存在: ${path.basename(dest)}`);
    return true;
  }

  const axios = require('axios');
  const tmpPath = `${dest}.part`;
  const writer = fs.createWriteStream(tmpPath);
  const resp = await axios.get(link.url, { responseType: 'stream', timeout: 30000, maxContentLength: Infinity });
  await new Promise((resolve, reject) => {
    resp.data.pipe(writer);
    resp.data.on('error', reject);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  // 校验文件头不是错误页（HTML）
  const head = Buffer.alloc(64);
  const fd = fs.openSync(tmpPath, 'r');
  fs.readSync(fd, head, 0, 64, 0);
  fs.closeSync(fd);
  const headText = head.toString('utf8');
  if (/^\s*<(!doctype|html)/i.test(headText)) {
    fs.unlinkSync(tmpPath);
    throw new Error('下载内容为 HTML（可能是试听受限）');
  }

  const sizeMb = (fs.statSync(tmpPath).size / 1024 / 1024).toFixed(1);
  fs.renameSync(tmpPath, dest);
  console.log(`[dl] ✓ ${track.name} (${link.quality}, ${sizeMb} MB)`);
  return true;
}

async function downloadAll(tracks, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\n[download] 开始下载 ${tracks.length} 首到 ${outDir}`);
  let done = 0;
  for (const track of tracks) {
    try {
      await downloadTrack(track, outDir);
      done += 1;
    } catch (error) {
      console.warn(`[dl] ✗ ${track.name}: ${error.message}`);
    }
  }
  console.log(`\n[download] 完成 ${done}/${tracks.length}，保存在 ${outDir}`);
  return done;
}

/* ---------- 主流程 ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const playlistName = args.playlist ?? args.p;
  const filePath = args.file ?? args.f;
  const dryRun = args['dry-run'] === true;
  const asJson = args.json === true;

  if (!playlistName || !filePath) {
    console.error('用法: node scripts/batch-playlist.cjs --playlist "歌单名" --file songs.txt [--file more.txt ...] [--download] [--out 目录] [--dry-run] [--json] [--qr]');
    process.exit(1);
  }
  const filePaths = Array.isArray(filePath) ? filePath : [filePath];
  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) {
      console.error(`找不到歌曲清单文件: ${fp}`);
      process.exit(1);
    }
  }

  await registerDevice();
  if (!ensureLoggedIn()) {
    // 默认走手机号+验证码；--qr 时退回扫码
    if (args.qr === true) {
      await loginByQrCode();
    } else {
      await loginBySmsCode();
    }
  } else {
    console.log(`[session] 复用已保存的登录态 userid=${state.session.userid}`);
  }

  const lines = filePaths.flatMap((fp) => fs.readFileSync(fp, 'utf8').split(/\r?\n/));
  console.log(`[parse] 共 ${filePaths.length} 个清单、${lines.filter(Boolean).length} 行，开始解析…`);
  const tracks = [];
  const seenHashes = new Set();
  for (const line of lines) {
    const resolved = await resolveTrack(line);
    if (!resolved) continue;
    if (resolved.error) {
      console.warn(`[parse] ${resolved.error}`);
      continue;
    }
    if (seenHashes.has(resolved.hash)) {
      console.log(`[parse] ↷ 跳过重复: ${resolved.name}`);
      continue;
    }
    seenHashes.add(resolved.hash);
    tracks.push(resolved);
    console.log(`[parse] ✓ (${resolved.source}) ${resolved.name}`);
  }

  if (asJson) {
    console.log(JSON.stringify(tracks, null, 2));
  }

  if (!tracks.length) {
    console.error('没有可添加的歌曲，退出。');
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\n[dry-run] 将把以上 ${tracks.length} 首歌加入「${playlistName}」，未实际写入。`);
    return;
  }

  let playlist = await findPlaylistByName(playlistName);
  if (!playlist) {
    playlist = await createPlaylist(playlistName);
  } else {
    console.log(`[playlist] 找到歌单「${playlistName}」（listid=${playlist.listid}，当前 ${playlist.count} 首）`);
  }

  const written = await addTracks(playlist.listid, tracks);
  console.log(`\n完成：成功写入 ${written}/${tracks.length} 首到「${playlistName}」。`);

  if (args.download === true) {
    const outDir = typeof args.out === 'string' && args.out ? args.out : path.join('downloads', playlistName);
    await downloadAll(tracks, outDir);
  }
  saveState(state);
}

main().catch((error) => {
  console.error('[fatal]', error instanceof Error ? error.message : error);
  saveState(state);
  process.exit(1);
});
