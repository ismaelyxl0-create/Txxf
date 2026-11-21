import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type {NextFunction, Request, Response} from 'express';
import {WebSocket, WebSocketServer} from 'ws';
import {GIFT_BY_ID as GIFT_CATALOG} from './src/lib/gifts.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'txlsocial-db.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BOTTLE_TTL_MS = 24 * 60 * 60 * 1000;
const COIN_CLAIM_COOLDOWN_MS = 45 * 1000;
const FRAME_CREATION_CRYSTAL_COST = 10;

export type BadgeTier = 'owner' | 'moderator' | 'influencer' | 'none';

export interface UserSettings {
  webBrowser: boolean;
  privacyVisible: boolean;
  notificationsEnabled: boolean;
  appearance: 'neon' | 'deep-purple' | 'midnight';
  language: 'es' | 'en';
}

export type ProfileThemeId =
  | 'neon-pink'
  | 'cyber-blue'
  | 'violet-pulse'
  | 'emerald-glow'
  | 'amber-gold';
export type ProfilePrivacy = 'public' | 'private';

interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  sessionVersion: number;
  role: 'owner' | 'moderator' | 'member';
  verified: boolean;
  badgeTier: BadgeTier;
  banned: boolean;
  frame: string;
  frameImageUrl: string | null;
  ownedFrameIds: string[];
  bannerUrl?: string | null;
  profileTheme?: ProfileThemeId;
  profilePrivacy?: ProfilePrivacy;
  hideJoinDate?: boolean;
  blockedUsers?: string[];
  pendingFollowRequests?: string[];
  statusText: string;
  bio: string;
  avatarUrl: string;
  region: string;
  coins: number;
  crystals: number;
  giftCollection?: Record<string, number>;
  lastCoinClaimAt: number;
  followers: string[];
  following: string[];
  settings: UserSettings;
  createdAt: number;
}

interface StoredFrame {
  id: string;
  name: string;
  category?: string;
  description?: string;
  imageUrl: string;
  priceCrystals: number;
  creatorId: string;
  creatorName: string;
  creatorBadgeTier: BadgeTier;
  salesCount: number;
  createdAt: number;
}

interface VoiceParticipant {
  userId: string;
  username: string;
  avatarUrl: string;
  frame?: string;
  frameImageUrl?: string | null;
  role: 'Admin' | 'Mod' | 'Miembro';
  verified: boolean;
  badgeTier: BadgeTier;
  isAppOwner?: boolean;
  muted: boolean;
  speaking: boolean;
  handRaised: boolean;
  region: string;
  joinedAt: number;
}

interface RoomEvent {
  id: string;
  kind: 'gift' | 'join' | 'leave' | 'create' | 'hand' | 'settings';
  text: string;
  createdAt: number;
}

interface StoredSticker {
  id: string;
  name: string;
  kind: 'sticker' | 'emoji';
  imageUrl: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
}

interface CircleMessage {
  id: string;
  kind: 'text' | 'gift' | 'audio' | 'sticker' | 'gif';
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: 'Admin' | 'Mod' | 'Miembro';
  authorVerified: boolean;
  authorBadgeTier?: BadgeTier;
  content: string;
  mediaUrl?: string;
  reactions?: Record<string, string[]>;
  giftId?: string;
  giftName?: string;
  giftEmoji?: string;
  giftImageUrl?: string;
  giftCoins?: number;
  audioUrl?: string;
  audioDurationSec?: number;
  createdAt: number;
}

interface CircleRoomSettings {
  maxSpeakers: number;
  allowAllRegions: boolean;
  handRaiseRequired: boolean;
}

interface StoredCircle {
  id: string;
  name: string;
  category: string;
  description: string;
  visualStyle: 'cyber-anime' | 'gaming' | 'synthwave' | 'custom';
  coverUrl: string;
  roomBackgroundUrl?: string | null;
  adminId: string;
  adminName: string;
  members: string[];
  moderators: string[];
  voiceParticipants: VoiceParticipant[];
  events: RoomEvent[];
  messages: CircleMessage[];
  roomSettings: CircleRoomSettings;
  isLive: boolean;
  createdAt: number;
}

interface PostComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorVerified: boolean;
  authorBadgeTier?: BadgeTier;
  content: string;
  createdAt: number;
}

interface StoredPost {
  id: string;
  authorId: string;
  circleId: string | null;
  circleName: string | null;
  content: string;
  imageUrl: string | null;
  likes: string[];
  comments: PostComment[];
  createdAt: number;
}

interface BottleReply {
  id: string;
  message: string;
  createdAt: number;
}

interface StoredBottle {
  id: string;
  senderId: string;
  message: string;
  mood: string;
  collectedBy: string[];
  replies: BottleReply[];
  createdAt: number;
  expiresAt: number;
}

interface StoredAlert {
  id: string;
  userId: string;
  type: 'follow' | 'like' | 'comment' | 'circle' | 'bottle' | 'system';
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

interface DatabaseState {
  users: StoredUser[];
  circles: StoredCircle[];
  posts: StoredPost[];
  bottles: StoredBottle[];
  alerts: StoredAlert[];
  frames: StoredFrame[];
  stickers: StoredSticker[];
}

const DEFAULT_AVATAR = '/src/assets/images/avatar_neon_default_1795239957122.jpg';

const STYLE_COVERS: Record<string, string> = {
  'cyber-anime': '/src/assets/images/circle_cyber_anime_1795239957772.jpg',
  gaming: '/src/assets/images/circle_gaming_1795239956712.jpg',
  synthwave: '/src/assets/images/circle_synthwave_1795239956499.jpg',
};

const EMPTY_DB: DatabaseState = {
  users: [],
  circles: [],
  posts: [],
  bottles: [],
  alerts: [],
  frames: [],
  stickers: [],
};

let dbState: DatabaseState = structuredClone(EMPTY_DB);
let writeQueue: Promise<void> = Promise.resolve();

function normalizeCircle(c: Partial<StoredCircle> & {id: string; name: string}): StoredCircle {
  return {
    id: c.id,
    name: c.name,
    category: c.category || 'Charlas Nocturnas',
    description: c.description || '',
    visualStyle: c.visualStyle || 'cyber-anime',
    coverUrl: c.coverUrl || STYLE_COVERS['cyber-anime'],
    roomBackgroundUrl: typeof c.roomBackgroundUrl === 'string' ? c.roomBackgroundUrl : null,
    adminId: c.adminId || '',
    adminName: c.adminName || 'Admin',
    members: Array.isArray(c.members) ? c.members : [],
    moderators: Array.isArray(c.moderators) ? c.moderators : [],
    voiceParticipants: Array.isArray(c.voiceParticipants) ? c.voiceParticipants : [],
    events: Array.isArray(c.events) ? c.events : [],
    messages: Array.isArray(c.messages) ? c.messages : [],
    roomSettings: {
      maxSpeakers: Math.max(30, Math.min(250, c.roomSettings?.maxSpeakers || 120)),
      allowAllRegions: true,
      handRaiseRequired: Boolean(c.roomSettings?.handRaiseRequired),
    },
    isLive: Boolean(c.isLive),
    createdAt: c.createdAt || Date.now(),
  };
}

function resolveUserBadgeTier(u: Partial<StoredUser>): BadgeTier {
  if (u.role === 'owner') return 'owner';
  if (
    u.badgeTier === 'owner' ||
    u.badgeTier === 'moderator' ||
    u.badgeTier === 'influencer' ||
    u.badgeTier === 'none'
  ) {
    return u.badgeTier;
  }
  if (u.role === 'moderator') return 'moderator';
  if (u.verified) return 'influencer';
  return 'none';
}

async function ensureDbLoaded(): Promise<void> {
  await fsp.mkdir(DATA_DIR, {recursive: true});
  try {
    const raw = await fsp.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    dbState = {
      users: Array.isArray(parsed.users)
        ? parsed.users.map((u) => {
            const badgeTier = resolveUserBadgeTier(u);
            return {
              ...u,
              sessionVersion: typeof u.sessionVersion === 'number' ? u.sessionVersion : 1,
              region: u.region || 'Global',
              badgeTier,
              verified: badgeTier !== 'none',
              crystals: typeof u.crystals === 'number' ? u.crystals : 0,
              frameImageUrl: typeof u.frameImageUrl === 'string' ? u.frameImageUrl : null,
              ownedFrameIds: Array.isArray(u.ownedFrameIds) ? u.ownedFrameIds : [],
              bannerUrl: typeof u.bannerUrl === 'string' ? u.bannerUrl : null,
              profileTheme: u.profileTheme || 'neon-pink',
              profilePrivacy: u.profilePrivacy === 'private' ? 'private' : 'public',
              hideJoinDate: Boolean(u.hideJoinDate),
              blockedUsers: Array.isArray(u.blockedUsers) ? u.blockedUsers : [],
              pendingFollowRequests: Array.isArray(u.pendingFollowRequests)
                ? u.pendingFollowRequests
                : [],
              giftCollection:
                u.giftCollection && typeof u.giftCollection === 'object' ? u.giftCollection : {},
            };
          })
        : [],
      circles: Array.isArray(parsed.circles) ? parsed.circles.map(normalizeCircle) : [],
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      bottles: Array.isArray(parsed.bottles) ? parsed.bottles : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      frames: Array.isArray(parsed.frames) ? parsed.frames : [],
      stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
    };
  } catch {
    dbState = structuredClone(EMPTY_DB);
    await persistDb();
  }
}

function persistDb(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fsp.mkdir(DATA_DIR, {recursive: true});
    const snapshot = JSON.stringify(dbState, null, 2);
    const tmpFile = `${DB_FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fsp.writeFile(tmpFile, snapshot, 'utf8');
    await fsp.rename(tmpFile, DB_FILE);
  });
  return writeQueue;
}

function pruneExpiredBottles(): boolean {
  const now = Date.now();
  const before = dbState.bottles.length;
  dbState.bottles = dbState.bottles.filter((b) => b.expiresAt > now);
  return dbState.bottles.length !== before;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function signSessionToken(uid: string, sv = 1): string {
  const payload = Buffer.from(
    JSON.stringify({uid, sv, exp: Date.now() + SESSION_TTL_MS}),
    'utf8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): {uid: string; sv: number} | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      sv?: number;
      exp?: number;
    };
    if (!decoded.uid || typeof decoded.exp !== 'number' || decoded.exp < Date.now()) {
      return null;
    }
    return {uid: decoded.uid, sv: typeof decoded.sv === 'number' ? decoded.sv : 1};
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [`txl_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', `Max-Age=${maxAgeSec}`];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = ['txl_session=', 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function isSafeMediaUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if ((url.startsWith('/src/assets/images/') || url.startsWith('/gifs/')) && !url.includes('..')) {
    return true;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url)) {
    return url.length <= 2_800_000;
  }
  return false;
}

function isSafeRoomBackgroundUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) {
    return url.length <= 3_400_000;
  }
  return false;
}

function isSafePngUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)) {
    return url.length <= 2_800_000;
  }
  return false;
}

function isSafeAudioUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (/^data:audio\/(webm|ogg|mp4|mpeg|wav|aac)(;codecs=[a-zA-Z0-9._-]+)?;base64,[A-Za-z0-9+/=]+$/.test(url)) {
    return url.length <= 1_800_000;
  }
  return false;
}

const BLOCKED_CONTENT_TERMS = [
  'puta',
  'puto',
  'pendejo',
  'pendeja',
  'cabron',
  'cabrón',
  'mierda',
  'verga',
  'chingar',
  'chingada',
  'maricon',
  'maricón',
  'joto',
  'zorra',
  'perra',
  'nazi',
  'hitler',
  'porno',
  'pornografia',
  'xxx',
  'fuck',
  'bitch',
  'whore',
  'slut',
  'nigger',
  'faggot',
];

function containsInappropriateText(val: string): boolean {
  if (!val) return false;
  const normalized = val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return BLOCKED_CONTENT_TERMS.some((term) => {
    const cleanTerm = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const regex = new RegExp(`(^|[^a-z0-9])${cleanTerm}($|[^a-z0-9])`, 'i');
    return regex.test(normalized);
  });
}

function isBlockedBetween(a?: StoredUser | null, b?: StoredUser | null): boolean {
  if (!a || !b || a.id === b.id) return false;
  return Boolean(a.blockedUsers?.includes(b.id) || b.blockedUsers?.includes(a.id));
}

function sanitizeText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function getCircleRole(circle: StoredCircle, userId: string): 'Admin' | 'Mod' | 'Miembro' {
  if (circle.adminId === userId) return 'Admin';
  if (circle.moderators.includes(userId)) return 'Mod';
  return 'Miembro';
}

function pushRoomEvent(circle: StoredCircle, kind: RoomEvent['kind'], text: string): void {
  circle.events.unshift({
    id: crypto.randomUUID(),
    kind,
    text,
    createdAt: Date.now(),
  });
  if (circle.events.length > 40) {
    circle.events = circle.events.slice(0, 40);
  }
}

function hydrateCircle(circle: StoredCircle, viewerId: string) {
  const userMap = new Map(dbState.users.map((u) => [u.id, u]));
  const viewer = userMap.get(viewerId);
  const voiceParticipants = circle.voiceParticipants.map((vp) => {
    const u = userMap.get(vp.userId);
    const badgeTier = u ? resolveUserBadgeTier(u) : vp.badgeTier || (vp.verified ? 'influencer' : 'none');
    return {
      ...vp,
      avatarUrl: u?.avatarUrl || vp.avatarUrl,
      frame: u?.frame || vp.frame || 'Pulso Neón',
      frameImageUrl: u?.frameImageUrl ?? vp.frameImageUrl ?? null,
      badgeTier,
      verified: badgeTier !== 'none',
      isAppOwner: u?.role === 'owner',
    };
  });
  const messages = circle.messages
    .filter((m) => {
      const author = userMap.get(m.authorId);
      return !isBlockedBetween(viewer, author);
    })
    .map((m) => {
      const u = userMap.get(m.authorId);
      const badgeTier = u
        ? resolveUserBadgeTier(u)
        : m.authorBadgeTier || (m.authorVerified ? 'influencer' : 'none');
      return {
        ...m,
        authorAvatar: u?.avatarUrl || m.authorAvatar,
        authorBadgeTier: badgeTier,
        authorVerified: badgeTier !== 'none',
      };
    });
  return {
    ...circle,
    roomBackgroundUrl: circle.roomBackgroundUrl || null,
    voiceParticipants,
    messages,
    membersCount: circle.members.length,
    isMember: circle.members.includes(viewerId),
    inVoice: circle.voiceParticipants.some((vp) => vp.userId === viewerId),
    myRole: getCircleRole(circle, viewerId),
  };
}

function toPublicUser(u: StoredUser, viewerOrSelf?: StoredUser | boolean) {
  const viewer = typeof viewerOrSelf === 'object' ? viewerOrSelf : undefined;
  const isSelf = typeof viewerOrSelf === 'boolean' ? viewerOrSelf : Boolean(viewer && u.id === viewer.id);
  const circlesCount = dbState.circles.filter((c) => c.members.includes(u.id)).length;
  const postsCount = dbState.posts.filter((p) => p.authorId === u.id).length;
  const badgeTier = resolveUserBadgeTier(u);
  const isOwner = u.role === 'owner';
  const privacy: ProfilePrivacy = u.profilePrivacy === 'private' ? 'private' : 'public';
  const isApprovedFollower = Boolean(viewer && u.followers.includes(viewer.id));
  const canViewFullProfile = isSelf || privacy === 'public' || isApprovedFollower;
  const showJoinDate = isSelf || (canViewFullProfile && !u.hideJoinDate);

  return {
    id: u.id,
    username: u.username,
    email: isSelf ? u.email : undefined,
    role: u.role,
    verified: badgeTier !== 'none',
    badgeTier,
    banned: u.banned,
    frame: u.frame,
    frameImageUrl: u.frameImageUrl || null,
    ownedFrameIds: isSelf ? u.ownedFrameIds || [] : undefined,
    bannerUrl: canViewFullProfile ? u.bannerUrl || null : null,
    profileTheme: u.profileTheme || 'neon-pink',
    profilePrivacy: privacy,
    hideJoinDate: Boolean(u.hideJoinDate),
    blockedUsers: isSelf ? u.blockedUsers || [] : undefined,
    pendingFollowRequests: isSelf ? u.pendingFollowRequests || [] : undefined,
    followRequestedByMe: Boolean(viewer && u.pendingFollowRequests?.includes(viewer.id)),
    canViewFullProfile,
    statusText: canViewFullProfile ? u.statusText : '',
    bio: canViewFullProfile ? u.bio : '',
    avatarUrl: u.avatarUrl,
    region: canViewFullProfile ? u.region || 'Global' : 'Privado',
    coins: isOwner ? 999999999 : u.coins,
    infiniteCoins: isOwner,
    crystals: isOwner ? 999999999 : u.crystals || 0,
    infiniteCrystals: isOwner,
    giftCollection: isSelf ? u.giftCollection || {} : undefined,
    lastCoinClaimAt: u.lastCoinClaimAt,
    followersCount: u.followers.length,
    followingCount: u.following.length,
    followers: canViewFullProfile ? u.followers : [],
    following: canViewFullProfile ? u.following : [],
    circlesCount,
    postsCount,
    settings: isSelf ? u.settings : undefined,
    createdAt: showJoinDate ? u.createdAt : undefined,
  };
}

function addAlert(
  userId: string,
  type: StoredAlert['type'],
  title: string,
  body: string
): void {
  dbState.alerts.unshift({
    id: crypto.randomUUID(),
    userId,
    type,
    title,
    body,
    read: false,
    createdAt: Date.now(),
  });
  const userAlerts = dbState.alerts.filter((a) => a.userId === userId);
  if (userAlerts.length > 60) {
    const keepIds = new Set(userAlerts.slice(0, 60).map((a) => a.id));
    dbState.alerts = dbState.alerts.filter((a) => a.userId !== userId || keepIds.has(a.id));
  }
}

interface AuthedRequest extends Request {
  currentUser?: StoredUser;
}

function resolveUserFromRequest(req: Request): StoredUser | undefined {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.txl_session;
  }
  if (!token) return undefined;
  const session = verifySessionToken(token);
  if (!session) return undefined;
  const user = dbState.users.find((u) => u.id === session.uid);
  if (!user) return undefined;
  if ((user.sessionVersion || 1) !== session.sv) return undefined;
  return user;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = resolveUserFromRequest(req);
  if (!user) {
    res.status(401).json({error: 'Sesión requerida. Inicia sesión para continuar.'});
    return;
  }
  if (user.banned) {
    res.status(403).json({error: 'Esta cuenta se encuentra suspendida por el Dueño.'});
    return;
  }
  req.currentUser = user;
  next();
}

function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.headers['x-requested-with'] !== 'TXLsocial') {
      res.status(403).json({error: 'Solicitud rechazada por verificación de seguridad.'});
      return;
    }
  }
  next();
}

// ——— REAL-TIME ROOM WEBSOCKET HUB (30+ CONCURRENT GLOBAL SPEAKERS) ———
interface VoiceClientSocket {
  ws: WebSocket;
  userId: string | null;
  circleId: string | null;
}

const roomSockets = new Map<string, Set<VoiceClientSocket>>();

function broadcastToRoom(
  circleId: string,
  payload: unknown,
  excludeUserId?: string,
  isRealtimeAudio = false
): void {
  const clients = roomSockets.get(circleId);
  if (!clients || clients.size === 0) return;
  const encoded = JSON.stringify(payload);
  for (const client of clients) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      // Backpressure protection: drop realtime audio frames for congested connections so global multi-speaker audio never stalls for other listeners
      if (isRealtimeAudio && client.ws.bufferedAmount > 196 * 1024) continue;
      client.ws.send(encoded);
    }
  }
}

function broadcastRoomSync(circle: StoredCircle): void {
  const clients = roomSockets.get(circle.id);
  if (!clients || clients.size === 0) return;
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN && client.userId) {
      client.ws.send(
        JSON.stringify({
          type: 'room:sync',
          circle: hydrateCircle(circle, client.userId),
        })
      );
    }
  }
}

async function startServer() {
  await ensureDbLoaded();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({limit: '6mb'}));

  app.use('/api', requireCsrfHeader);

  // ——— AUTH ROUTES ———
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const username = sanitizeText(req.body?.username, 24);
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const region = sanitizeText(req.body?.region, 32) || 'Global';

    if (!/^[a-zA-Z0-9_.\-]{3,24}$/.test(username)) {
      res.status(400).json({
        error: 'El nombre de usuario debe tener entre 3 y 24 caracteres (letras, números, _ . -).',
      });
      return;
    }
    if (containsInappropriateText(username)) {
      res.status(400).json({error: 'Ese nombre de usuario contiene palabras no permitidas.'});
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({error: 'Ingresa un correo electrónico válido.'});
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({error: 'La contraseña debe tener al menos 6 caracteres.'});
      return;
    }

    if (dbState.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({error: 'Ese correo ya está registrado.'});
      return;
    }
    if (dbState.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({error: 'Ese nombre de usuario ya está en uso.'});
      return;
    }

    const isFirstUser = dbState.users.length === 0;
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      salt,
      sessionVersion: 1,
      role: isFirstUser ? 'owner' : 'member',
      verified: isFirstUser,
      badgeTier: isFirstUser ? 'owner' : 'none',
      banned: false,
      frame: 'Pulso Neón',
      frameImageUrl: null,
      ownedFrameIds: [],
      bannerUrl: null,
      profileTheme: 'neon-pink',
      profilePrivacy: 'public',
      hideJoinDate: false,
      blockedUsers: [],
      pendingFollowRequests: [],
      statusText: '',
      bio: '',
      avatarUrl: DEFAULT_AVATAR,
      region,
      coins: 450,
      crystals: 0,
      giftCollection: {},
      lastCoinClaimAt: 0,
      followers: [],
      following: [],
      settings: {
        webBrowser: false,
        privacyVisible: true,
        notificationsEnabled: true,
        appearance: 'neon',
        language: 'es',
      },
      createdAt: Date.now(),
    };

    dbState.users.push(newUser);
    addAlert(
      newUser.id,
      'system',
      'Bienvenido a TXLsocial',
      isFirstUser
        ? 'Tu cuenta fue asignada como Dueño inicial con acceso al panel de verificados y baneos.'
        : 'Explora círculos globales, salas de voz de 30+ personas, publicaciones y botellas al mar.'
    );
    await persistDb();

    const token = signSessionToken(newUser.id, newUser.sessionVersion);
    setSessionCookie(req, res, token);
    res.status(201).json({token, user: toPublicUser(newUser, newUser)});
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const identifier = sanitizeText(req.body?.identifier, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({error: 'Completa usuario/correo y contraseña.'});
      return;
    }

    const user = dbState.users.find(
      (u) => u.email.toLowerCase() === identifier || u.username.toLowerCase() === identifier
    );
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      res.status(401).json({error: 'Credenciales incorrectas.'});
      return;
    }
    if (user.banned) {
      res.status(403).json({error: 'Esta cuenta fue suspendida por el administrador.'});
      return;
    }

    const token = signSessionToken(user.id, user.sessionVersion || 1);
    setSessionCookie(req, res, token);
    res.json({token, user: toPublicUser(user, user)});
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ok: true});
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || !verifyPassword(currentPassword, user.salt, user.passwordHash)) {
      res.status(401).json({error: 'La contraseña actual no es correcta.'});
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({error: 'La nueva contraseña debe tener entre 6 y 128 caracteres.'});
      return;
    }

    const nextSalt = crypto.randomBytes(16).toString('hex');
    user.salt = nextSalt;
    user.passwordHash = hashPassword(newPassword, nextSalt);
    // Increment sessionVersion so every other device's session token is immediately invalidated
    user.sessionVersion = (user.sessionVersion || 1) + 1;

    addAlert(
      user.id,
      'system',
      'Contraseña actualizada',
      'Se cambió tu contraseña y se cerraron automáticamente todas tus sesiones abiertas en otros dispositivos.'
    );
    await persistDb();

    const nextToken = signSessionToken(user.id, user.sessionVersion);
    setSessionCookie(req, res, nextToken);
    res.json({token: nextToken, user: toPublicUser(user, user)});
  });

  app.post('/api/auth/revoke-other-sessions', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    await persistDb();
    const nextToken = signSessionToken(user.id, user.sessionVersion);
    setSessionCookie(req, res, nextToken);
    res.json({token: nextToken, user: toPublicUser(user, user)});
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = resolveUserFromRequest(req);
    if (!user || user.banned) {
      res.status(401).json({error: 'No autenticado'});
      return;
    }
    res.json({user: toPublicUser(user, user)});
  });

  // ——— USERS & PROFILE ROUTES ———
  app.get('/api/users', requireAuth, (req: AuthedRequest, res: Response) => {
    const q = sanitizeText(req.query.q, 60).toLowerCase();
    const viewer = req.currentUser!;
    const list = dbState.users
      .filter((u) => {
        if (isBlockedBetween(viewer, u)) return false;
        if (!q) return true;
        const canSearchBio =
          u.id === viewer.id ||
          u.profilePrivacy !== 'private' ||
          u.followers.includes(viewer.id);
        return (
          u.username.toLowerCase().includes(q) ||
          (canSearchBio &&
            (u.bio.toLowerCase().includes(q) || u.statusText.toLowerCase().includes(q)))
        );
      })
      .map((u) => toPublicUser(u, viewer));

    res.json({users: list, totalRegistered: dbState.users.length});
  });

  app.get('/api/users/me/blocked', requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.currentUser!;
    const blockedIds = me.blockedUsers || [];
    const users = blockedIds
      .map((id) => dbState.users.find((u) => u.id === id))
      .filter((u): u is StoredUser => Boolean(u))
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        badgeTier: resolveUserBadgeTier(u),
        verified: resolveUserBadgeTier(u) !== 'none',
      }));
    res.json({blocked: users});
  });

  app.get('/api/users/:id/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.currentUser!;
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target || target.banned || isBlockedBetween(viewer, target)) {
      res.status(404).json({error: 'Perfil no disponible.'});
      return;
    }
    res.json({user: toPublicUser(target, viewer)});
  });

  app.patch('/api/users/me', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const body = req.body || {};

    if (body.username !== undefined) {
      const nextName = sanitizeText(body.username, 24);
      if (!/^[a-zA-Z0-9_.\-]{3,24}$/.test(nextName)) {
        res.status(400).json({error: 'Nombre de usuario inválido (3-24 caracteres).'});
        return;
      }
      if (containsInappropriateText(nextName)) {
        res.status(400).json({error: 'El nombre de usuario contiene palabras inapropiadas.'});
        return;
      }
      const clash = dbState.users.some(
        (u) => u.id !== user.id && u.username.toLowerCase() === nextName.toLowerCase()
      );
      if (clash) {
        res.status(409).json({error: 'Ese nombre de usuario ya está ocupado.'});
        return;
      }
      user.username = nextName;
    }

    if (body.bio !== undefined) {
      const nextBio = sanitizeText(body.bio, 180);
      if (containsInappropriateText(nextBio)) {
        res.status(400).json({error: 'La biografía contiene palabras inapropiadas.'});
        return;
      }
      user.bio = nextBio;
    }
    if (body.statusText !== undefined) {
      const nextStatus = sanitizeText(body.statusText, 64);
      if (containsInappropriateText(nextStatus)) {
        res.status(400).json({error: 'El estado contiene palabras inapropiadas.'});
        return;
      }
      user.statusText = nextStatus;
    }
    if (body.region !== undefined) user.region = sanitizeText(body.region, 32) || 'Global';
    if (body.profileTheme !== undefined) {
      const validThemes: ProfileThemeId[] = [
        'neon-pink',
        'cyber-blue',
        'violet-pulse',
        'emerald-glow',
        'amber-gold',
      ];
      if (validThemes.includes(body.profileTheme)) {
        user.profileTheme = body.profileTheme;
      }
    }
    if (body.profilePrivacy !== undefined) {
      user.profilePrivacy = body.profilePrivacy === 'private' ? 'private' : 'public';
    }
    if (typeof body.hideJoinDate === 'boolean') {
      user.hideJoinDate = body.hideJoinDate;
    }
    if (body.bannerUrl !== undefined) {
      if (body.bannerUrl === null || body.bannerUrl === '') {
        user.bannerUrl = null;
      } else if (!isSafeRoomBackgroundUrl(body.bannerUrl)) {
        res.status(400).json({
          error: 'Formato de portada inválido o demasiado pesado (usa JPG, PNG o WEBP).',
        });
        return;
      } else {
        user.bannerUrl = body.bannerUrl;
      }
    }
    if (body.frame !== undefined) {
      const allowedFrames = ['Pulso Neón', 'Aurora Violeta', 'Fuego Magenta', 'Sin marco'];
      if (allowedFrames.includes(body.frame)) {
        user.frame = body.frame;
        user.frameImageUrl = null;
      }
    }
    if (typeof body.customFrameId === 'string' && body.customFrameId) {
      const cf = dbState.frames.find((f) => f.id === body.customFrameId);
      if (cf && (user.ownedFrameIds.includes(cf.id) || cf.creatorId === user.id)) {
        user.frame = cf.name;
        user.frameImageUrl = cf.imageUrl;
      }
    }
    if (body.avatarUrl !== undefined) {
      if (!isSafeMediaUrl(body.avatarUrl)) {
        res.status(400).json({error: 'Formato de avatar no permitido o demasiado grande.'});
        return;
      }
      user.avatarUrl = body.avatarUrl;
    }
    if (body.settings && typeof body.settings === 'object') {
      const s = body.settings;
      if (typeof s.webBrowser === 'boolean') user.settings.webBrowser = s.webBrowser;
      if (typeof s.privacyVisible === 'boolean') user.settings.privacyVisible = s.privacyVisible;
      if (typeof s.notificationsEnabled === 'boolean') {
        user.settings.notificationsEnabled = s.notificationsEnabled;
      }
      if (s.appearance === 'neon' || s.appearance === 'deep-purple' || s.appearance === 'midnight') {
        user.settings.appearance = s.appearance;
      }
      if (s.language === 'es' || s.language === 'en') {
        user.settings.language = s.language;
      }
    }

    await persistDb();
    res.json({user: toPublicUser(user, user)});
  });

  app.post('/api/users/me/reset-profile', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    user.bio = '';
    user.statusText = '';
    user.bannerUrl = null;
    user.profileTheme = 'neon-pink';
    user.profilePrivacy = 'public';
    user.hideJoinDate = false;
    user.frame = 'Pulso Neón';
    user.frameImageUrl = null;
    await persistDb();
    res.json({user: toPublicUser(user, user)});
  });

  app.post('/api/users/:id/follow', requireAuth, async (req: AuthedRequest, res: Response) => {
    const me = req.currentUser!;
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target || target.banned || isBlockedBetween(me, target)) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    if (target.id === me.id) {
      res.status(400).json({error: 'No puedes seguirte a ti mismo.'});
      return;
    }

    const already = me.following.includes(target.id);
    let requested = false;
    if (already) {
      me.following = me.following.filter((id) => id !== target.id);
      target.followers = target.followers.filter((id) => id !== me.id);
    } else if (target.profilePrivacy === 'private') {
      target.pendingFollowRequests = target.pendingFollowRequests || [];
      if (target.pendingFollowRequests.includes(me.id)) {
        target.pendingFollowRequests = target.pendingFollowRequests.filter((id) => id !== me.id);
        requested = false;
      } else {
        target.pendingFollowRequests.push(me.id);
        requested = true;
        if (target.settings.notificationsEnabled) {
          addAlert(
            target.id,
            'follow',
            'Solicitud de acceso al perfil',
            `@${me.username} solicitó permiso para ver y seguir tu perfil privado.`
          );
        }
      }
    } else {
      me.following.push(target.id);
      target.followers.push(me.id);
      if (target.settings.notificationsEnabled) {
        addAlert(target.id, 'follow', 'Nuevo seguidor', `@${me.username} comenzó a seguirte.`);
      }
    }

    await persistDb();
    res.json({
      following: !already && target.profilePrivacy !== 'private',
      requested,
      me: toPublicUser(me, me),
      target: toPublicUser(target, me),
    });
  });

  app.post(
    '/api/users/me/follow-requests/:requesterId',
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const me = req.currentUser!;
      const requesterId = req.params.requesterId;
      const action = req.body?.action === 'accept' ? 'accept' : 'reject';
      me.pendingFollowRequests = (me.pendingFollowRequests || []).filter((id) => id !== requesterId);
      const requester = dbState.users.find((u) => u.id === requesterId);

      if (action === 'accept' && requester && !requester.banned && !isBlockedBetween(me, requester)) {
        if (!me.followers.includes(requester.id)) me.followers.push(requester.id);
        if (!requester.following.includes(me.id)) requester.following.push(me.id);
        addAlert(
          requester.id,
          'follow',
          'Solicitud aprobada',
          `@${me.username} aprobó tu solicitud para ver su perfil privado.`
        );
      }
      await persistDb();
      res.json({user: toPublicUser(me, me)});
    }
  );

  app.post('/api/users/:id/block', requireAuth, async (req: AuthedRequest, res: Response) => {
    const me = req.currentUser!;
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    if (target.id === me.id) {
      res.status(400).json({error: 'No puedes bloquearte a ti mismo.'});
      return;
    }
    if (target.role === 'owner') {
      res.status(400).json({error: 'No es posible bloquear al Dueño de la aplicación.'});
      return;
    }

    me.blockedUsers = me.blockedUsers || [];
    if (!me.blockedUsers.includes(target.id)) {
      me.blockedUsers.push(target.id);
    }
    // Silently sever mutual follows and pending requests without notifying the blocked user
    me.following = me.following.filter((id) => id !== target.id);
    me.followers = me.followers.filter((id) => id !== target.id);
    me.pendingFollowRequests = (me.pendingFollowRequests || []).filter((id) => id !== target.id);

    target.following = target.following.filter((id) => id !== me.id);
    target.followers = target.followers.filter((id) => id !== me.id);
    target.pendingFollowRequests = (target.pendingFollowRequests || []).filter((id) => id !== me.id);

    await persistDb();
    res.json({user: toPublicUser(me, me)});
  });

  app.delete('/api/users/:id/block', requireAuth, async (req: AuthedRequest, res: Response) => {
    const me = req.currentUser!;
    const targetId = req.params.id;
    me.blockedUsers = (me.blockedUsers || []).filter((id) => id !== targetId);
    await persistDb();
    res.json({user: toPublicUser(me, me)});
  });

  app.post('/api/users/me/claim-coins', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const mode = req.body?.mode === 'chest' ? 'chest' : 'timed';
    const now = Date.now();
    const elapsed = now - user.lastCoinClaimAt;

    if (elapsed < COIN_CLAIM_COOLDOWN_MS) {
      const remainingSec = Math.ceil((COIN_CLAIM_COOLDOWN_MS - elapsed) / 1000);
      res.status(429).json({
        error: `Espera ${remainingSec}s para reclamar nuevamente.`,
        remainingSec,
      });
      return;
    }

    const reward = mode === 'chest' ? 15 + crypto.randomInt(0, 86) : 25;
    user.coins += reward;
    user.lastCoinClaimAt = now;
    await persistDb();

    res.json({reward, user: toPublicUser(user, true)});
  });

  // ——— CIRCLES / COMMUNITIES ROUTES ———
  app.get('/api/circles', requireAuth, (req: AuthedRequest, res: Response) => {
    const q = sanitizeText(req.query.q, 60).toLowerCase();
    const filter = sanitizeText(req.query.filter, 20);

    let items = dbState.circles.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });

    if (filter === 'live') {
      items = items.filter((c) => c.isLive || c.voiceParticipants.length > 0);
    } else if (filter === 'popular') {
      items = [...items].sort(
        (a, b) =>
          b.members.length +
          b.voiceParticipants.length -
          (a.members.length + a.voiceParticipants.length)
      );
    } else {
      items = [...items].sort((a, b) => b.createdAt - a.createdAt);
    }

    const totalInVoice = dbState.circles.reduce((sum, c) => sum + c.voiceParticipants.length, 0);

    res.json({
      circles: items.map((c) => hydrateCircle(c, req.currentUser!.id)),
      totalInVoice,
    });
  });

  app.get('/api/circles/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }
    res.json({circle: hydrateCircle(circle, req.currentUser!.id)});
  });

  app.post('/api/circles', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const name = sanitizeText(req.body?.name, 48);
    const category = sanitizeText(req.body?.category, 36) || 'Charlas Nocturnas';
    const description = sanitizeText(req.body?.description, 240);
    const visualStyleRaw = req.body?.visualStyle;
    const visualStyle: StoredCircle['visualStyle'] =
      visualStyleRaw === 'gaming' ||
      visualStyleRaw === 'synthwave' ||
      visualStyleRaw === 'custom'
        ? visualStyleRaw
        : 'cyber-anime';

    if (name.length < 2) {
      res.status(400).json({error: 'El nombre del círculo debe tener al menos 2 caracteres.'});
      return;
    }

    let coverUrl = STYLE_COVERS[visualStyle] || STYLE_COVERS['cyber-anime'];
    if (visualStyle === 'custom' && req.body?.coverUrl) {
      if (!isSafeMediaUrl(req.body.coverUrl)) {
        res.status(400).json({error: 'Imagen de fondo no válida o demasiado pesada.'});
        return;
      }
      coverUrl = req.body.coverUrl;
    }

    const newCircle: StoredCircle = {
      id: crypto.randomUUID(),
      name,
      category,
      description,
      visualStyle,
      coverUrl,
      adminId: user.id,
      adminName: user.username,
      members: [user.id],
      moderators: [],
      voiceParticipants: [],
      events: [
        {
          id: crypto.randomUUID(),
          kind: 'create',
          text: `${user.username} creó la comunidad como Admin`,
          createdAt: Date.now(),
        },
      ],
      messages: [],
      roomSettings: {
        maxSpeakers: 120,
        allowAllRegions: true,
        handRaiseRequired: false,
      },
      isLive: category.toLowerCase().includes('vivo'),
      createdAt: Date.now(),
    };

    dbState.circles.unshift(newCircle);
    await persistDb();

    res.status(201).json({
      circle: hydrateCircle(newCircle, user.id),
    });
  });

  app.post('/api/circles/:id/join', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }

    const already = circle.members.includes(user.id);
    if (already) {
      circle.members = circle.members.filter((id) => id !== user.id);
      circle.voiceParticipants = circle.voiceParticipants.filter((vp) => vp.userId !== user.id);
    } else {
      circle.members.push(user.id);
      if (circle.adminId !== user.id) {
        addAlert(
          circle.adminId,
          'circle',
          'Nuevo miembro en tu círculo',
          `@${user.username} se unió a "${circle.name}".`
        );
      }
    }

    await persistDb();
    broadcastRoomSync(circle);
    res.json({circle: hydrateCircle(circle, user.id)});
  });

  app.post('/api/circles/:id/voice', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }

    const action = req.body?.action as string | undefined;
    const existingIdx = circle.voiceParticipants.findIndex((vp) => vp.userId === user.id);

    if (action === 'toggle-mute' && existingIdx !== -1) {
      circle.voiceParticipants[existingIdx].muted = !circle.voiceParticipants[existingIdx].muted;
      if (circle.voiceParticipants[existingIdx].muted) {
        circle.voiceParticipants[existingIdx].speaking = false;
      }
    } else if (action === 'set-muted' && existingIdx !== -1) {
      const nextMuted = Boolean(req.body?.muted);
      circle.voiceParticipants[existingIdx].muted = nextMuted;
      if (nextMuted) circle.voiceParticipants[existingIdx].speaking = false;
    } else if (action === 'toggle-hand' && existingIdx !== -1) {
      const nextHand = !circle.voiceParticipants[existingIdx].handRaised;
      circle.voiceParticipants[existingIdx].handRaised = nextHand;
      if (nextHand) {
        pushRoomEvent(circle, 'hand', `${user.username} pidió turno para hablar`);
      }
    } else if (action === 'leave' || (action !== 'join' && existingIdx !== -1)) {
      if (existingIdx !== -1) {
        circle.voiceParticipants.splice(existingIdx, 1);
        circle.isLive =
          circle.voiceParticipants.length > 0 || circle.category.toLowerCase().includes('vivo');
        pushRoomEvent(circle, 'leave', `${user.username} salió de la sala de voz`);
      }
    } else {
      // Join voice stage (supports up to 250 concurrent international speakers with zero regional limits!)
      const maxCap = Math.max(30, Math.min(250, circle.roomSettings.maxSpeakers || 120));
      if (circle.voiceParticipants.length >= maxCap && existingIdx === -1) {
        res.status(409).json({
          error: `La sala alcanzó el límite configurado de ${maxCap} participantes en voz.`,
        });
        return;
      }

      for (const c of dbState.circles) {
        if (c.id !== circle.id) {
          const had = c.voiceParticipants.some((vp) => vp.userId === user.id);
          if (had) {
            c.voiceParticipants = c.voiceParticipants.filter((vp) => vp.userId !== user.id);
            pushRoomEvent(c, 'leave', `${user.username} salió de la sala de voz`);
            broadcastRoomSync(c);
          }
        }
      }
      if (!circle.members.includes(user.id)) {
        circle.members.push(user.id);
      }
      if (existingIdx === -1) {
        circle.voiceParticipants.push({
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          frame: user.frame,
          frameImageUrl: user.frameImageUrl,
          role: getCircleRole(circle, user.id),
          verified: resolveUserBadgeTier(user) !== 'none',
          badgeTier: resolveUserBadgeTier(user),
          muted: typeof req.body?.muted === 'boolean' ? req.body.muted : true,
          speaking: false,
          handRaised: false,
          region: user.region || 'Global',
          joinedAt: Date.now(),
        });
        pushRoomEvent(circle, 'join', `${user.username} entró a la sala de voz`);
      }
      circle.isLive = true;
    }

    await persistDb();
    broadcastRoomSync(circle);
    const totalInVoice = dbState.circles.reduce((sum, c) => sum + c.voiceParticipants.length, 0);
    res.json({circle: hydrateCircle(circle, user.id), totalInVoice});
  });

  app.post('/api/circles/:id/moderate', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }
    const myRole = getCircleRole(circle, user.id);
    if (myRole !== 'Admin' && myRole !== 'Mod' && user.role !== 'owner') {
      res.status(403).json({error: 'Solo Admin o Moderador puede gestionar participantes.'});
      return;
    }
    const targetId = sanitizeText(req.body?.targetUserId, 64);
    const op = sanitizeText(req.body?.operation, 24);
    const targetVp = circle.voiceParticipants.find((vp) => vp.userId === targetId);

    if (op === 'mute' && targetVp) {
      targetVp.muted = true;
      targetVp.speaking = false;
      pushRoomEvent(circle, 'settings', `${user.username} apagó el micrófono de ${targetVp.username}`);
    } else if (op === 'toggle-mute' && targetVp) {
      targetVp.muted = !targetVp.muted;
      if (targetVp.muted) targetVp.speaking = false;
      pushRoomEvent(
        circle,
        'settings',
        `${user.username} ${targetVp.muted ? 'apagó' : 'prendió'} el micrófono de ${targetVp.username}`
      );
    } else if (op === 'kick' && targetVp && targetId !== circle.adminId) {
      circle.voiceParticipants = circle.voiceParticipants.filter((vp) => vp.userId !== targetId);
      pushRoomEvent(circle, 'leave', `${targetVp.username} fue retirado del escenario`);
    } else if (op === 'toggle-mod' && (myRole === 'Admin' || user.role === 'owner')) {
      if (targetId !== circle.adminId) {
        if (circle.moderators.includes(targetId)) {
          circle.moderators = circle.moderators.filter((id) => id !== targetId);
        } else {
          circle.moderators.push(targetId);
        }
        if (targetVp) {
          targetVp.role = getCircleRole(circle, targetId);
        }
      }
    } else if (op === 'lower-hand' && targetVp) {
      targetVp.handRaised = false;
    }

    await persistDb();
    broadcastRoomSync(circle);
    res.json({circle: hydrateCircle(circle, user.id)});
  });

  app.patch('/api/circles/:id/settings', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }
    if (circle.adminId !== user.id && user.role !== 'owner') {
      res.status(403).json({error: 'Solo el Admin puede cambiar la configuración de la sala.'});
      return;
    }
    const body = req.body || {};
    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      circle.name = sanitizeText(body.name, 48);
    }
    if (typeof body.description === 'string') {
      circle.description = sanitizeText(body.description, 240);
    }
    if (typeof body.maxSpeakers === 'number') {
      circle.roomSettings.maxSpeakers = Math.max(30, Math.min(250, Math.round(body.maxSpeakers)));
    }
    circle.roomSettings.allowAllRegions = true;
    if (typeof body.handRaiseRequired === 'boolean') {
      circle.roomSettings.handRaiseRequired = body.handRaiseRequired;
    }
    let bgEventText: string | null = null;
    if (body.roomBackgroundUrl !== undefined) {
      if (body.roomBackgroundUrl === null || body.roomBackgroundUrl === '') {
        circle.roomBackgroundUrl = null;
        bgEventText = `${user.username} restauró el fondo predeterminado de la sala`;
      } else if (!isSafeRoomBackgroundUrl(body.roomBackgroundUrl)) {
        res.status(400).json({
          error: 'Imagen de fondo no válida o demasiado pesada (usa JPG, PNG o WEBP).',
        });
        return;
      } else {
        circle.roomBackgroundUrl = body.roomBackgroundUrl;
        bgEventText = `${user.username} cambió el fondo personalizado de la sala`;
      }
    }

    pushRoomEvent(
      circle,
      'settings',
      bgEventText || `${user.username} actualizó la configuración de la sala`
    );
    await persistDb();
    broadcastRoomSync(circle);
    res.json({circle: hydrateCircle(circle, user.id)});
  });

  app.post('/api/circles/:id/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }

    const rawKind = req.body?.kind;
    const kind: CircleMessage['kind'] =
      rawKind === 'audio' || rawKind === 'sticker' || rawKind === 'gif' ? rawKind : 'text';
    const content = sanitizeText(req.body?.content, 500);
    let audioUrl: string | undefined;
    let audioDurationSec: number | undefined;
    let mediaUrl: string | undefined;

    if (kind === 'audio') {
      if (!isSafeAudioUrl(req.body?.audioUrl)) {
        res.status(400).json({error: 'Audio no válido o demasiado extenso.'});
        return;
      }
      audioUrl = req.body.audioUrl;
      audioDurationSec = Math.max(1, Math.min(120, Number(req.body?.audioDurationSec || 3)));
    } else if (kind === 'sticker' || kind === 'gif') {
      if (!isSafeMediaUrl(req.body?.mediaUrl)) {
        res.status(400).json({error: 'Sticker o GIF no válido o demasiado pesado.'});
        return;
      }
      mediaUrl = req.body.mediaUrl;
    } else if (!content) {
      res.status(400).json({error: 'Escribe un mensaje.'});
      return;
    }

    if (!circle.members.includes(user.id)) {
      circle.members.push(user.id);
    }

    const msg: CircleMessage = {
      id: crypto.randomUUID(),
      kind,
      authorId: user.id,
      authorName: user.username,
      authorAvatar: user.avatarUrl,
      authorRole: getCircleRole(circle, user.id),
      authorVerified: resolveUserBadgeTier(user) !== 'none',
      authorBadgeTier: resolveUserBadgeTier(user),
      content:
        kind === 'audio'
          ? content || 'Nota de voz'
          : kind === 'sticker'
            ? content || 'Sticker'
            : kind === 'gif'
              ? content || 'GIF'
              : content,
      mediaUrl,
      reactions: {},
      audioUrl,
      audioDurationSec,
      createdAt: Date.now(),
    };
    circle.messages.push(msg);
    if (circle.messages.length > 140) {
      circle.messages = circle.messages.slice(-140);
    }

    await persistDb();
    broadcastRoomSync(circle);
    res.status(201).json({message: msg, circle: hydrateCircle(circle, user.id)});
  });

  app.post(
    '/api/circles/:id/messages/:msgId/react',
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const user = req.currentUser!;
      const circle = dbState.circles.find((c) => c.id === req.params.id);
      if (!circle) {
        res.status(404).json({error: 'Círculo no encontrado.'});
        return;
      }
      const msg = circle.messages.find((m) => m.id === req.params.msgId);
      if (!msg) {
        res.status(404).json({error: 'Mensaje no encontrado.'});
        return;
      }
      const emoji = sanitizeText(req.body?.emoji, 16);
      if (!emoji) {
        res.status(400).json({error: 'Reacción inválida.'});
        return;
      }
      if (!msg.reactions) msg.reactions = {};
      const current = Array.isArray(msg.reactions[emoji]) ? msg.reactions[emoji] : [];
      if (current.includes(user.id)) {
        const next = current.filter((id) => id !== user.id);
        if (next.length === 0) delete msg.reactions[emoji];
        else msg.reactions[emoji] = next;
      } else {
        msg.reactions[emoji] = [...current, user.id];
      }
      await persistDb();
      broadcastRoomSync(circle);
      res.json({circle: hydrateCircle(circle, user.id)});
    }
  );

  app.delete(
    '/api/circles/:id/messages/:msgId',
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const user = req.currentUser!;
      const circle = dbState.circles.find((c) => c.id === req.params.id);
      if (!circle) {
        res.status(404).json({error: 'Círculo no encontrado.'});
        return;
      }
      const msgIdx = circle.messages.findIndex((m) => m.id === req.params.msgId);
      if (msgIdx === -1) {
        res.status(404).json({error: 'Mensaje no encontrado.'});
        return;
      }
      const msg = circle.messages[msgIdx];
      const myRole = getCircleRole(circle, user.id);
      if (msg.authorId !== user.id && myRole !== 'Admin' && myRole !== 'Mod' && user.role !== 'owner') {
        res.status(403).json({error: 'No tienes permiso para eliminar este mensaje.'});
        return;
      }
      circle.messages.splice(msgIdx, 1);
      await persistDb();
      broadcastRoomSync(circle);
      res.json({circle: hydrateCircle(circle, user.id)});
    }
  );

  app.post('/api/circles/:id/gifts', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const circle = dbState.circles.find((c) => c.id === req.params.id);
    if (!circle) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }

    const giftId = sanitizeText(req.body?.giftId, 32);
    const gift = GIFT_CATALOG[giftId];
    if (!gift) {
      res.status(400).json({error: 'Regalo no válido.'});
      return;
    }

    if (user.role !== 'owner' && user.coins < gift.coins) {
      res.status(400).json({
        error: `Necesitas ${gift.coins} monedas para enviar ${gift.name} (tienes ${user.coins}).`,
      });
      return;
    }

    if (user.role !== 'owner') {
      user.coins -= gift.coins;
    }
    user.giftCollection = user.giftCollection || {};
    user.giftCollection[giftId] = (user.giftCollection[giftId] || 0) + 1;

    const hostUser = dbState.users.find((u) => u.id === circle.adminId);
    if (hostUser && hostUser.id !== user.id) {
      if (hostUser.role !== 'owner') {
        hostUser.coins += Math.floor(gift.coins * 0.5);
      }
      hostUser.giftCollection = hostUser.giftCollection || {};
      hostUser.giftCollection[giftId] = (hostUser.giftCollection[giftId] || 0) + 1;
    }

    pushRoomEvent(
      circle,
      'gift',
      `${user.username} envió ${gift.name} (${gift.coins} monedas) en la sala`
    );

    const giftMsg: CircleMessage = {
      id: crypto.randomUUID(),
      kind: 'gift',
      authorId: user.id,
      authorName: user.username,
      authorAvatar: user.avatarUrl,
      authorRole: getCircleRole(circle, user.id),
      authorVerified: resolveUserBadgeTier(user) !== 'none',
      authorBadgeTier: resolveUserBadgeTier(user),
      content: `Regaló ${gift.name} (${gift.coins.toLocaleString()} monedas) en el en vivo`,
      giftId,
      giftName: gift.name,
      giftEmoji: gift.emoji,
      giftImageUrl: gift.imageUrl,
      giftCoins: gift.coins,
      createdAt: Date.now(),
    };
    circle.messages.push(giftMsg);
    if (circle.messages.length > 120) {
      circle.messages = circle.messages.slice(-120);
    }

    await persistDb();
    broadcastRoomSync(circle);
    const giftEvent = {
      id: crypto.randomUUID(),
      giftId,
      name: gift.name,
      emoji: gift.emoji,
      imageUrl: gift.imageUrl,
      coins: gift.coins,
      category: gift.category,
      animationType: gift.animationType,
      senderName: user.username,
      senderAvatar: user.avatarUrl,
      createdAt: Date.now(),
    };
    broadcastToRoom(circle.id, {type: 'room:gift', giftEvent});
    res.status(201).json({
      circle: hydrateCircle(circle, user.id),
      user: toPublicUser(user, true),
      giftEvent,
    });
  });

  app.delete('/api/circles/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const idx = dbState.circles.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Círculo no encontrado.'});
      return;
    }
    const circle = dbState.circles[idx];
    if (circle.adminId !== user.id && user.role !== 'owner') {
      res.status(403).json({error: 'Solo el creador o Dueño puede eliminar este círculo.'});
      return;
    }
    dbState.circles.splice(idx, 1);
    await persistDb();
    res.json({ok: true});
  });

  // ——— POSTS / PUBLICACIONES ROUTES ———
  app.get('/api/posts', requireAuth, (req: AuthedRequest, res: Response) => {
    const filter = sanitizeText(req.query.filter, 20);
    const fromDate = typeof req.query.from === 'string' && req.query.from ? Date.parse(req.query.from) : NaN;
    const toDate =
      typeof req.query.to === 'string' && req.query.to
        ? Date.parse(req.query.to) + 24 * 60 * 60 * 1000 - 1
        : NaN;

    const userMap = new Map(dbState.users.map((u) => [u.id, u]));
    const viewer = req.currentUser!;

    let list = [...dbState.posts]
      .filter((p) => {
        const author = userMap.get(p.authorId);
        return !isBlockedBetween(viewer, author);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    if (filter === 'with_photo') {
      list = list.filter((p) => Boolean(p.imageUrl));
    } else if (filter === 'mine') {
      list = list.filter((p) => p.authorId === viewer.id);
    }
    if (!Number.isNaN(fromDate)) {
      list = list.filter((p) => p.createdAt >= fromDate);
    }
    if (!Number.isNaN(toDate)) {
      list = list.filter((p) => p.createdAt <= toDate);
    }

    const hydrated = list.map((p) => {
      const author = userMap.get(p.authorId);
      const authorBadgeTier = author ? resolveUserBadgeTier(author) : 'none';
      return {
        ...p,
        authorName: author?.username || 'Usuario',
        authorAvatar: author?.avatarUrl || DEFAULT_AVATAR,
        authorFrame: author?.frame || 'Pulso Neón',
        authorFrameImageUrl: author?.frameImageUrl || null,
        authorVerified: authorBadgeTier !== 'none',
        authorBadgeTier,
        authorRole: author?.role || 'member',
        comments: p.comments
          .filter((c) => !isBlockedBetween(viewer, userMap.get(c.authorId)))
          .map((c) => {
            const cu = userMap.get(c.authorId);
            const cTier = cu ? resolveUserBadgeTier(cu) : c.authorBadgeTier || 'none';
            return {
              ...c,
              authorAvatar: cu?.avatarUrl || c.authorAvatar,
              authorBadgeTier: cTier,
              authorVerified: cTier !== 'none',
            };
          }),
        likesCount: p.likes.length,
        likedByMe: p.likes.includes(viewer.id),
      };
    });

    res.json({posts: hydrated, totalCount: hydrated.length});
  });

  app.post('/api/posts', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const content = sanitizeText(req.body?.content, 1000);
    const imageUrl = req.body?.imageUrl ?? null;
    const circleId = typeof req.body?.circleId === 'string' && req.body.circleId ? req.body.circleId : null;

    if (!content && !imageUrl) {
      res.status(400).json({error: 'Escribe un texto o agrega una foto para publicar.'});
      return;
    }

    if (imageUrl !== null && !isSafeMediaUrl(imageUrl)) {
      res.status(400).json({error: 'Imagen no válida o excede el tamaño permitido.'});
      return;
    }

    let circleName: string | null = null;
    if (circleId) {
      const foundCircle = dbState.circles.find((c) => c.id === circleId);
      if (!foundCircle) {
        res.status(404).json({error: 'Círculo seleccionado no encontrado.'});
        return;
      }
      circleName = foundCircle.name;
    }

    const post: StoredPost = {
      id: crypto.randomUUID(),
      authorId: user.id,
      circleId,
      circleName,
      content,
      imageUrl,
      likes: [],
      comments: [],
      createdAt: Date.now(),
    };

    dbState.posts.unshift(post);
    await persistDb();

    res.status(201).json({
      post: {
        ...post,
        authorName: user.username,
        authorAvatar: user.avatarUrl,
        authorFrame: user.frame,
        authorFrameImageUrl: user.frameImageUrl || null,
        authorVerified: resolveUserBadgeTier(user) !== 'none',
        authorBadgeTier: resolveUserBadgeTier(user),
        authorRole: user.role,
        likesCount: 0,
        likedByMe: false,
      },
    });
  });

  app.post('/api/posts/:id/like', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const post = dbState.posts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({error: 'Publicación no encontrada.'});
      return;
    }
    const already = post.likes.includes(user.id);
    if (already) {
      post.likes = post.likes.filter((id) => id !== user.id);
    } else {
      post.likes.push(user.id);
      if (post.authorId !== user.id) {
        addAlert(
          post.authorId,
          'like',
          'Nuevo me gusta',
          `A @${user.username} le gustó tu publicación.`
        );
      }
    }
    await persistDb();
    res.json({likesCount: post.likes.length, likedByMe: !already});
  });

  app.post('/api/posts/:id/comments', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const post = dbState.posts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({error: 'Publicación no encontrada.'});
      return;
    }
    const postAuthor = dbState.users.find((u) => u.id === post.authorId);
    if (isBlockedBetween(user, postAuthor)) {
      res.status(403).json({error: 'No puedes comentar esta publicación.'});
      return;
    }
    const content = sanitizeText(req.body?.content, 300);
    if (!content) {
      res.status(400).json({error: 'Escribe un comentario.'});
      return;
    }

    const comment: PostComment = {
      id: crypto.randomUUID(),
      authorId: user.id,
      authorName: user.username,
      authorAvatar: user.avatarUrl,
      authorVerified: resolveUserBadgeTier(user) !== 'none',
      authorBadgeTier: resolveUserBadgeTier(user),
      content,
      createdAt: Date.now(),
    };
    post.comments.push(comment);
    if (post.authorId !== user.id) {
      addAlert(
        post.authorId,
        'comment',
        'Nuevo comentario',
        `@${user.username} comentó: "${content.slice(0, 60)}"`
      );
    }
    await persistDb();
    res.status(201).json({comment});
  });

  app.delete('/api/posts/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const idx = dbState.posts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Publicación no encontrada.'});
      return;
    }
    const post = dbState.posts[idx];
    if (post.authorId !== user.id && user.role !== 'owner') {
      res.status(403).json({error: 'No tienes permiso para eliminar esta publicación.'});
      return;
    }
    dbState.posts.splice(idx, 1);
    await persistDb();
    res.json({ok: true});
  });

  // ——— DRIFTING BOTTLE / BOTELLA AL MAR ROUTES ———
  app.get('/api/bottles', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (pruneExpiredBottles()) {
      await persistDb();
    }
    const user = req.currentUser!;
    const activeBottles = dbState.bottles.map((b) => ({
      id: b.id,
      mood: b.mood,
      isMine: b.senderId === user.id,
      collected: b.collectedBy.includes(user.id),
      message: b.senderId === user.id || b.collectedBy.includes(user.id) ? b.message : null,
      replies: b.senderId === user.id || b.collectedBy.includes(user.id) ? b.replies : [],
      repliesCount: b.replies.length,
      createdAt: b.createdAt,
      expiresAt: b.expiresAt,
    }));

    res.json({
      activeCount: dbState.bottles.length,
      bottles: activeBottles.sort((a, b) => b.createdAt - a.createdAt),
    });
  });

  app.post('/api/bottles', requireAuth, async (req: AuthedRequest, res: Response) => {
    pruneExpiredBottles();
    const user = req.currentUser!;
    const message = sanitizeText(req.body?.message, 400);
    const mood = sanitizeText(req.body?.mood, 24) || 'Nocturno';
    if (message.length < 3) {
      res.status(400).json({error: 'Escribe un mensaje de al menos 3 caracteres.'});
      return;
    }

    const now = Date.now();
    const bottle: StoredBottle = {
      id: crypto.randomUUID(),
      senderId: user.id,
      message,
      mood,
      collectedBy: [],
      replies: [],
      createdAt: now,
      expiresAt: now + BOTTLE_TTL_MS,
    };

    dbState.bottles.unshift(bottle);
    await persistDb();

    res.status(201).json({
      bottle: {
        id: bottle.id,
        mood: bottle.mood,
        isMine: true,
        collected: false,
        message: bottle.message,
        replies: [],
        repliesCount: 0,
        createdAt: bottle.createdAt,
        expiresAt: bottle.expiresAt,
      },
      activeCount: dbState.bottles.length,
    });
  });

  app.post('/api/bottles/collect', requireAuth, async (req: AuthedRequest, res: Response) => {
    pruneExpiredBottles();
    const user = req.currentUser!;
    if (dbState.bottles.length === 0) {
      res.status(404).json({error: 'El océano neón está vacío. ¡Lanza la primera botella!'});
      return;
    }

    const otherUncollected = dbState.bottles.filter(
      (b) => b.senderId !== user.id && !b.collectedBy.includes(user.id)
    );
    const anyOther = dbState.bottles.filter((b) => b.senderId !== user.id);
    const pool =
      otherUncollected.length > 0
        ? otherUncollected
        : anyOther.length > 0
          ? anyOther
          : dbState.bottles;

    const chosen = pool[crypto.randomInt(0, pool.length)];
    if (!chosen.collectedBy.includes(user.id)) {
      chosen.collectedBy.push(user.id);
      await persistDb();
    }

    res.json({
      bottle: {
        id: chosen.id,
        mood: chosen.mood,
        isMine: chosen.senderId === user.id,
        collected: true,
        message: chosen.message,
        replies: chosen.replies,
        repliesCount: chosen.replies.length,
        createdAt: chosen.createdAt,
        expiresAt: chosen.expiresAt,
      },
    });
  });

  app.post('/api/bottles/:id/reply', requireAuth, async (req: AuthedRequest, res: Response) => {
    pruneExpiredBottles();
    const user = req.currentUser!;
    const bottle = dbState.bottles.find((b) => b.id === req.params.id);
    if (!bottle) {
      res.status(404).json({error: 'Esta botella ya expiró o fue eliminada.'});
      return;
    }
    if (bottle.senderId !== user.id && !bottle.collectedBy.includes(user.id)) {
      res.status(403).json({error: 'Primero debes recoger esta botella del océano.'});
      return;
    }
    const message = sanitizeText(req.body?.message, 280);
    if (!message) {
      res.status(400).json({error: 'Escribe una respuesta.'});
      return;
    }

    const reply: BottleReply = {
      id: crypto.randomUUID(),
      message,
      createdAt: Date.now(),
    };
    bottle.replies.push(reply);
    if (bottle.senderId !== user.id) {
      addAlert(
        bottle.senderId,
        'bottle',
        'Respuesta en tu botella al mar',
        `Alguien respondió anónimamente: "${message.slice(0, 60)}"`
      );
    }

    await persistDb();
    res.status(201).json({reply});
  });

  // ——— ALERTS / NOTIFICATIONS ROUTES ———
  app.get('/api/alerts', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const alerts = dbState.alerts.filter((a) => a.userId === user.id);
    const unreadCount = alerts.filter((a) => !a.read).length;
    res.json({alerts, unreadCount});
  });

  app.post('/api/alerts/read', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const alertId = typeof req.body?.id === 'string' ? req.body.id : null;
    for (const alert of dbState.alerts) {
      if (alert.userId === user.id && (!alertId || alert.id === alertId)) {
        alert.read = true;
      }
    }
    await persistDb();
    res.json({ok: true});
  });

  // ——— CUSTOM PNG FRAMES STORE & CRYSTALS ROUTES ———
  app.get('/api/frames', requireAuth, (_req: AuthedRequest, res: Response) => {
    const frames = [...dbState.frames].sort((a, b) => b.createdAt - a.createdAt);
    res.json({
      frames,
      creationCost: FRAME_CREATION_CRYSTAL_COST,
    });
  });

  app.post('/api/frames', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const name = sanitizeText(req.body?.name, 36);
    const category = sanitizeText(req.body?.category, 24) || 'Comunidad';
    const description = sanitizeText(req.body?.description, 140);
    const priceCrystals = Math.round(Number(req.body?.priceCrystals || 0));
    const imageUrl = req.body?.imageUrl;

    if (name.length < 2) {
      res.status(400).json({error: 'Escribe un nombre válido para el marco (mín. 2 caracteres).'});
      return;
    }
    if (!Number.isFinite(priceCrystals) || priceCrystals < 1 || priceCrystals > 50000) {
      res.status(400).json({error: 'El precio en Cristales debe estar entre 1 y 50,000.'});
      return;
    }
    if (!isSafePngUrl(imageUrl)) {
      res.status(400).json({
        error: 'Solo se permiten archivos de marco en formato PNG válido (.png).',
      });
      return;
    }

    if (user.role !== 'owner' && user.crystals < FRAME_CREATION_CRYSTAL_COST) {
      res.status(400).json({
        error: `Necesitas ${FRAME_CREATION_CRYSTAL_COST} Cristales para crear y vender tu marco PNG. Solo el Dueño puede regalarte Cristales.`,
      });
      return;
    }

    if (user.role !== 'owner') {
      user.crystals -= FRAME_CREATION_CRYSTAL_COST;
    }

    const newFrame: StoredFrame = {
      id: crypto.randomUUID(),
      name,
      category,
      description,
      imageUrl,
      priceCrystals,
      creatorId: user.id,
      creatorName: user.username,
      creatorBadgeTier: resolveUserBadgeTier(user),
      salesCount: 0,
      createdAt: Date.now(),
    };

    dbState.frames.unshift(newFrame);
    if (!user.ownedFrameIds.includes(newFrame.id)) {
      user.ownedFrameIds.push(newFrame.id);
    }
    user.frame = newFrame.name;
    user.frameImageUrl = newFrame.imageUrl;
    await persistDb();

    res.status(201).json({frame: newFrame, user: toPublicUser(user, true)});
  });

  app.post('/api/frames/:id/buy', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const frame = dbState.frames.find((f) => f.id === req.params.id);
    if (!frame) {
      res.status(404).json({error: 'Marco no encontrado en la tienda.'});
      return;
    }
    if (user.ownedFrameIds.includes(frame.id) || frame.creatorId === user.id) {
      res.status(400).json({error: 'Ya posees este marco en tu colección.'});
      return;
    }
    if (user.role !== 'owner' && user.crystals < frame.priceCrystals) {
      res.status(400).json({
        error: `Necesitas ${frame.priceCrystals} Cristales para comprar "${frame.name}". Solo el Dueño puede regalar Cristales.`,
      });
      return;
    }

    if (user.role !== 'owner') {
      user.crystals -= frame.priceCrystals;
    }

    const creator = dbState.users.find((u) => u.id === frame.creatorId);
    if (creator && creator.id !== user.id) {
      if (creator.role !== 'owner') {
        creator.crystals += frame.priceCrystals;
      }
      addAlert(
        creator.id,
        'system',
        '¡Vendiste un marco PNG!',
        `@${user.username} compró tu marco "${frame.name}" por ${frame.priceCrystals} Cristales.`
      );
    }

    frame.salesCount += 1;
    user.ownedFrameIds.push(frame.id);
    user.frame = frame.name;
    user.frameImageUrl = frame.imageUrl;
    await persistDb();

    res.json({frame, user: toPublicUser(user, true)});
  });

  app.post('/api/frames/:id/equip', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const frame = dbState.frames.find((f) => f.id === req.params.id);
    if (!frame) {
      res.status(404).json({error: 'Marco no encontrado.'});
      return;
    }
    if (!user.ownedFrameIds.includes(frame.id) && frame.creatorId !== user.id) {
      res.status(403).json({error: 'Debes comprar este marco antes de equiparlo.'});
      return;
    }
    user.frame = frame.name;
    user.frameImageUrl = frame.imageUrl;
    await persistDb();
    res.json({user: toPublicUser(user, true)});
  });

  app.post('/api/frames/unequip', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    user.frame = 'Pulso Neón';
    user.frameImageUrl = null;
    await persistDb();
    res.json({user: toPublicUser(user, true)});
  });

  app.delete('/api/frames/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const idx = dbState.frames.findIndex((f) => f.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Marco no encontrado.'});
      return;
    }
    const frame = dbState.frames[idx];
    if (frame.creatorId !== user.id && user.role !== 'owner') {
      res.status(403).json({error: 'Solo el creador o el Dueño puede retirar este marco.'});
      return;
    }
    dbState.frames.splice(idx, 1);
    for (const u of dbState.users) {
      if (u.frameImageUrl === frame.imageUrl) {
        u.frameImageUrl = null;
        u.frame = 'Pulso Neón';
      }
    }
    await persistDb();
    res.json({ok: true, user: toPublicUser(user, true)});
  });

  // ——— CUSTOM STICKERS & CUSTOM EMOJIS ROUTES ———
  app.get('/api/stickers', requireAuth, (_req: AuthedRequest, res: Response) => {
    const stickers = [...dbState.stickers].sort((a, b) => b.createdAt - a.createdAt);
    res.json({stickers});
  });

  app.post('/api/stickers', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const name = sanitizeText(req.body?.name, 28) || 'Mi Sticker';
    const kind = req.body?.kind === 'emoji' ? 'emoji' : 'sticker';
    const imageUrl = req.body?.imageUrl;

    if (!isSafeMediaUrl(imageUrl)) {
      res.status(400).json({error: 'Sticker o emoji no válido (usa PNG, GIF o WebP).'});
      return;
    }

    const sticker: StoredSticker = {
      id: crypto.randomUUID(),
      name,
      kind,
      imageUrl,
      creatorId: user.id,
      creatorName: user.username,
      createdAt: Date.now(),
    };
    dbState.stickers.unshift(sticker);
    if (dbState.stickers.length > 300) {
      dbState.stickers = dbState.stickers.slice(0, 300);
    }
    await persistDb();
    res.status(201).json({sticker});
  });

  app.delete('/api/stickers/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const idx = dbState.stickers.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Sticker no encontrado.'});
      return;
    }
    if (dbState.stickers[idx].creatorId !== user.id && user.role !== 'owner') {
      res.status(403).json({error: 'No puedes eliminar stickers de otro usuario.'});
      return;
    }
    dbState.stickers.splice(idx, 1);
    await persistDb();
    res.json({ok: true});
  });

  // ——— OWNER MODERATION PANEL ROUTES ———
  app.post('/api/admin/users/:id/badge', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.currentUser!.role !== 'owner') {
      res.status(403).json({error: 'Solo el Dueño puede asignar o quitar insignias.'});
      return;
    }
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    if (target.role === 'owner') {
      res.status(400).json({error: 'La insignia del Dueño es fija y no se puede modificar.'});
      return;
    }

    const tierRaw = sanitizeText(req.body?.tier, 24);
    const tier: BadgeTier =
      tierRaw === 'owner' || tierRaw === 'moderator' || tierRaw === 'influencer'
        ? tierRaw
        : 'none';

    target.badgeTier = tier;
    target.verified = tier !== 'none';
    if (tier === 'moderator') {
      target.role = 'moderator';
    } else if (target.role === 'moderator') {
      target.role = 'member';
    }

    addAlert(
      target.id,
      'system',
      tier === 'none' ? 'Verificable actualizado' : 'Nuevo verificable asignado',
      tier === 'owner'
        ? 'El Dueño te otorgó la insignia NEGRA de Dueño de comunidad.'
        : tier === 'moderator'
          ? 'El Dueño te otorgó la insignia AZUL de Moderador.'
          : tier === 'influencer'
            ? 'El Dueño te otorgó la insignia ROJA de Influencer.'
            : 'Tu insignia verificable fue retirada por el Dueño.'
    );
    await persistDb();
    res.json({user: toPublicUser(target, true)});
  });

  app.post('/api/admin/users/:id/crystals', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.currentUser!.role !== 'owner') {
      res.status(403).json({error: 'Solo el Dueño puede asignar o regalar Cristales.'});
      return;
    }
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    const mode = req.body?.mode === 'set' ? 'set' : 'add';
    const amount = Math.round(Number(req.body?.amount ?? -1));
    if (mode === 'set') {
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
        res.status(400).json({error: 'Ingresa un saldo válido entre 0 y 1,000,000 Cristales.'});
        return;
      }
      if (target.role !== 'owner') {
        target.crystals = amount;
        addAlert(
          target.id,
          'system',
          'Saldo de Cristales actualizado',
          `El Dueño asignó tu saldo en ${amount} Cristales para la Tienda de Marcos PNG.`
        );
      }
    } else {
      if (!Number.isFinite(amount) || amount < 1 || amount > 100_000) {
        res.status(400).json({error: 'Ingresa una cantidad válida entre 1 y 100,000 Cristales.'});
        return;
      }
      if (target.role !== 'owner') {
        target.crystals = (target.crystals || 0) + amount;
        addAlert(
          target.id,
          'system',
          '¡Recibiste Cristales del Dueño!',
          `El Dueño te asignó +${amount} Cristales para importar, crear o comprar Marcos PNG.`
        );
      }
    }
    await persistDb();
    res.json({user: toPublicUser(target, true)});
  });

  app.post('/api/admin/users/:id/coins', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.currentUser!.role !== 'owner') {
      res.status(403).json({error: 'Solo el Dueño puede asignar o regalar Monedas.'});
      return;
    }
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    const mode = req.body?.mode === 'set' ? 'set' : 'add';
    const amount = Math.round(Number(req.body?.amount ?? -1));
    if (mode === 'set') {
      if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
        res.status(400).json({error: 'Ingresa un saldo válido entre 0 y 10,000,000 Monedas.'});
        return;
      }
      if (target.role !== 'owner') {
        target.coins = amount;
        addAlert(
          target.id,
          'system',
          'Saldo de Monedas actualizado',
          `El Dueño fijó tu saldo en ${amount.toLocaleString()} Monedas.`
        );
      }
    } else {
      if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000) {
        res.status(400).json({error: 'Ingresa una cantidad válida entre 1 y 10,000,000 Monedas.'});
        return;
      }
      if (target.role !== 'owner') {
        target.coins = (target.coins || 0) + amount;
        addAlert(
          target.id,
          'system',
          '¡Recibiste Monedas del Dueño!',
          `El Dueño te regaló +${amount.toLocaleString()} Monedas para regalos 3D en salas.`
        );
      }
    }
    await persistDb();
    res.json({user: toPublicUser(target, true)});
  });

  app.post('/api/admin/users/:id/verify', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.currentUser!.role !== 'owner') {
      res.status(403).json({error: 'Solo el Dueño puede otorgar insignias de verificación.'});
      return;
    }
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    if (target.role === 'owner') {
      res.status(400).json({error: 'La insignia del Dueño es fija.'});
      return;
    }
    const nextTier: BadgeTier = target.badgeTier === 'none' ? 'influencer' : 'none';
    target.badgeTier = nextTier;
    target.verified = nextTier !== 'none';
    addAlert(
      target.id,
      'system',
      target.verified ? 'Cuenta verificada' : 'Verificación actualizada',
      target.verified
        ? 'El Dueño te otorgó la insignia ROJA de Influencer en TXLsocial.'
        : 'Tu insignia de verificación fue actualizada.'
    );
    await persistDb();
    res.json({user: toPublicUser(target, true)});
  });

  app.post('/api/admin/users/:id/ban', requireAuth, async (req: AuthedRequest, res: Response) => {
    const actor = req.currentUser!;
    if (actor.role !== 'owner' && actor.role !== 'moderator') {
      res.status(403).json({error: 'Solo el Dueño o Moderadores pueden gestionar baneos.'});
      return;
    }
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({error: 'Usuario no encontrado.'});
      return;
    }
    if (target.id === actor.id || target.role === 'owner') {
      res.status(400).json({error: 'No puedes banear la cuenta del Dueño.'});
      return;
    }
    if (actor.role === 'moderator' && target.role === 'moderator') {
      res.status(403).json({error: 'Solo el Dueño puede suspender a otro Moderador.'});
      return;
    }
    target.banned = !target.banned;
    await persistDb();
    res.json({user: toPublicUser(target, actor)});
  });

  app.post('/api/admin/users/:id/role', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.currentUser!.role !== 'owner') {
      res.status(403).json({error: 'Solo el Dueño puede cambiar roles.'});
      return;
    }
    const target = dbState.users.find((u) => u.id === req.params.id);
    if (!target || target.role === 'owner') {
      res.status(400).json({error: 'Usuario no válido para cambio de rol.'});
      return;
    }
    const nextRole = req.body?.role === 'moderator' ? 'moderator' : 'member';
    target.role = nextRole;
    if (nextRole === 'moderator') {
      target.badgeTier = 'moderator';
      target.verified = true;
    } else if (target.badgeTier === 'moderator') {
      target.badgeTier = 'none';
      target.verified = false;
    }
    await persistDb();
    res.json({user: toPublicUser(target, true)});
  });

  // ——— VITE OR STATIC SERVING ———
  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // ——— HTTP + WEBSOCKET SERVER ———
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({noServer: true});

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/ws/voice') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const cookies = parseCookies(req.headers.cookie);
    const cookieSession = cookies.txl_session ? verifySessionToken(cookies.txl_session) : null;
    const cookieUser = cookieSession
      ? dbState.users.find(
          (u) => u.id === cookieSession.uid && !u.banned && (u.sessionVersion || 1) === cookieSession.sv
        )
      : undefined;
    const clientState: VoiceClientSocket = {
      ws,
      userId: cookieUser ? cookieUser.id : null,
      circleId: null,
    };

    const detachFromRoom = () => {
      if (!clientState.circleId) return;
      const roomId = clientState.circleId;
      const set = roomSockets.get(roomId);
      if (set) {
        set.delete(clientState);
        if (set.size === 0) roomSockets.delete(roomId);
      }
      if (clientState.userId) {
        const c = dbState.circles.find((item) => item.id === roomId);
        const vp = c?.voiceParticipants.find((p) => p.userId === clientState.userId);
        if (vp && vp.speaking) {
          vp.speaking = false;
          broadcastToRoom(roomId, {
            type: 'voice:speaking',
            userId: clientState.userId,
            speaking: false,
          });
        }
      }
      clientState.circleId = null;
    };

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === 'room:join') {
        if (typeof msg.token === 'string') {
          const verified = verifySessionToken(msg.token);
          if (verified) {
            const matched = dbState.users.find(
              (u) => u.id === verified.uid && !u.banned && (u.sessionVersion || 1) === verified.sv
            );
            if (matched) clientState.userId = matched.id;
          }
        }
        if (!clientState.userId || typeof msg.circleId !== 'string') return;
        const user = dbState.users.find((u) => u.id === clientState.userId && !u.banned);
        const circle = dbState.circles.find((c) => c.id === msg.circleId);
        if (!user || !circle) return;

        detachFromRoom();
        clientState.circleId = circle.id;
        let set = roomSockets.get(circle.id);
        if (!set) {
          set = new Set();
          roomSockets.set(circle.id, set);
        }
        set.add(clientState);
        ws.send(JSON.stringify({type: 'room:sync', circle: hydrateCircle(circle, user.id)}));
        return;
      }

      if (msg.type === 'ws:ping') {
        ws.send(JSON.stringify({type: 'ws:pong', ts: msg.ts}));
        return;
      }

      if (!clientState.userId || !clientState.circleId) return;
      const circle = dbState.circles.find((c) => c.id === clientState.circleId);
      if (!circle) return;

      if (msg.type === 'voice:speaking') {
        const speaking = Boolean(msg.speaking);
        const vp = circle.voiceParticipants.find((p) => p.userId === clientState.userId);
        if (vp && vp.speaking !== speaking) {
          vp.speaking = vp.muted ? false : speaking;
          broadcastToRoom(circle.id, {
            type: 'voice:speaking',
            userId: clientState.userId,
            speaking: vp.speaking,
          });
        }
        return;
      }

      if (msg.type === 'voice:audio' && typeof msg.pcm === 'string') {
        // Relay compact base64 Int16 PCM frame to all other listeners in the room (up to 250 concurrent speakers globally!)
        if (msg.pcm.length > 20480) return;
        const vp = circle.voiceParticipants.find((p) => p.userId === clientState.userId);
        if (!vp || vp.muted) return;
        broadcastToRoom(
          circle.id,
          {
            type: 'voice:audio',
            userId: clientState.userId,
            sampleRate: typeof msg.sampleRate === 'number' ? msg.sampleRate : 16000,
            pcm: msg.pcm,
          },
          clientState.userId,
          true
        );
      }
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25_000);

    ws.on('close', () => {
      clearInterval(heartbeat);
      detachFromRoom();
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TXLsocial server + WS listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TXLsocial server:', err);
  process.exit(1);
});
