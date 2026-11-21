export type AppearanceMode = 'neon' | 'deep-purple' | 'midnight';
export type LanguageCode = 'es' | 'en';
export type AppTab = 'circles' | 'posts' | 'bottle' | 'alerts' | 'profile' | 'settings';
export type BadgeTier = 'owner' | 'moderator' | 'influencer' | 'none';
export type ProfileThemeId =
  | 'neon-pink'
  | 'cyber-blue'
  | 'violet-pulse'
  | 'emerald-glow'
  | 'amber-gold';
export type ProfilePrivacy = 'public' | 'private';

export interface UserSettings {
  webBrowser: boolean;
  privacyVisible: boolean;
  notificationsEnabled: boolean;
  appearance: AppearanceMode;
  language: LanguageCode;
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  role: 'owner' | 'moderator' | 'member';
  verified: boolean;
  badgeTier: BadgeTier;
  banned: boolean;
  frame: string;
  frameImageUrl?: string | null;
  ownedFrameIds?: string[];
  bannerUrl?: string | null;
  profileTheme?: ProfileThemeId;
  profilePrivacy?: ProfilePrivacy;
  hideJoinDate?: boolean;
  blockedUsers?: string[];
  pendingFollowRequests?: string[];
  followRequestedByMe?: boolean;
  canViewFullProfile?: boolean;
  statusText: string;
  bio: string;
  avatarUrl: string;
  region?: string;
  coins: number;
  infiniteCoins?: boolean;
  crystals: number;
  infiniteCrystals?: boolean;
  giftCollection?: Record<string, number>;
  lastCoinClaimAt: number;
  followersCount: number;
  followingCount: number;
  followers: string[];
  following: string[];
  circlesCount: number;
  postsCount: number;
  settings?: UserSettings;
  createdAt?: number;
}

export interface CustomFrameItem {
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

export interface VoiceParticipant {
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

export interface RoomEvent {
  id: string;
  kind: 'gift' | 'join' | 'leave' | 'create' | 'hand' | 'settings';
  text: string;
  createdAt: number;
}

export interface CustomStickerItem {
  id: string;
  name: string;
  kind: 'sticker' | 'emoji';
  imageUrl: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
}

export interface CircleMessage {
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

export interface CircleRoomSettings {
  maxSpeakers: number;
  allowAllRegions: boolean;
  handRaiseRequired: boolean;
}

export interface CircleItem {
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
  membersCount: number;
  isMember: boolean;
  inVoice: boolean;
  myRole: 'Admin' | 'Mod' | 'Miembro';
  voiceParticipants: VoiceParticipant[];
  events: RoomEvent[];
  messages: CircleMessage[];
  roomSettings: CircleRoomSettings;
  isLive: boolean;
  createdAt: number;
}

export interface PostComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorVerified: boolean;
  authorBadgeTier?: BadgeTier;
  content: string;
  createdAt: number;
}

export interface PostItem {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorFrame?: string;
  authorFrameImageUrl?: string | null;
  authorVerified: boolean;
  authorBadgeTier?: BadgeTier;
  authorRole: 'owner' | 'moderator' | 'member';
  circleId: string | null;
  circleName: string | null;
  content: string;
  imageUrl: string | null;
  likesCount: number;
  likedByMe: boolean;
  comments: PostComment[];
  createdAt: number;
}

export interface BottleReply {
  id: string;
  message: string;
  createdAt: number;
}

export interface BottleItem {
  id: string;
  mood: string;
  isMine: boolean;
  collected: boolean;
  message: string | null;
  replies: BottleReply[];
  repliesCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface AlertItem {
  id: string;
  userId: string;
  type: 'follow' | 'like' | 'comment' | 'circle' | 'bottle' | 'system';
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export {
  GIFT_BY_ID,
  GIFT_ITEMS,
  type GiftAnimationType,
  type GiftDefinition,
  type GiftSpriteCrop,
} from './lib/gifts.ts';

export const BUILTIN_GIFS = [
  {id: 'neon_heart', name: 'Corazón Neón', url: '/gifs/neon_heart.gif'},
  {id: 'fire_hype', name: 'Fuego Hype', url: '/gifs/fire_hype.gif'},
  {id: 'star_party', name: 'Estrella Party', url: '/gifs/star_party.gif'},
  {id: 'music_wave', name: 'Onda Musical', url: '/gifs/music_wave.gif'},
  {id: 'globe_live', name: 'En Vivo Global', url: '/gifs/globe_live.gif'},
  {id: 'clap_yay', name: 'Festejo Neón', url: '/gifs/clap_yay.gif'},
] as const;

export const CUSTOM_TXL_EMOJIS = [
  '❤️', '🔥', '😂', '😍', '👏', '🎉', '🙌', '🥳',
  '🤩', '😎', '🫶', '✨', '⚡', '💎', '👑', '🎤',
  '🎧', '🎶', '🌍', '🌎', '🌏', '🚀', '🐉', '🌟',
  '💯', '🤝', '💜', '🩷', '🩵', '🫡', '🥹', '🤯',
] as const;

export const GENERATED_ASSETS = {
  driftingBottleHero: '/src/assets/images/drifting_bottle_hero_1795239956558.jpg',
  cyberAnime: '/src/assets/images/circle_cyber_anime_1795239957772.jpg',
  gaming: '/src/assets/images/circle_gaming_1795239956712.jpg',
  synthwave: '/src/assets/images/circle_synthwave_1795239956499.jpg',
  defaultAvatar: '/src/assets/images/avatar_neon_default_1795239957122.jpg',
} as const;
