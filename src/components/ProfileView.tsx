import {useEffect, useMemo, useRef, useState} from 'react';
import {
  BadgeCheck,
  Calendar,
  Check,
  Coins,
  Download,
  EyeOff,
  Frame,
  Gem,
  Gift,
  Globe,
  ImagePlus,
  Lock,
  MessageCircle,
  Palette,
  Pencil,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
  UserCheck,
  X,
} from 'lucide-react';
import {apiRequest, readAndCompressImage, readBannerOrBackgroundImage} from '../lib/api.ts';
import {GIFT_ITEMS, type GiftDefinition} from '../lib/gifts.ts';
import {formatJoinDate, getProfileTheme, PROFILE_THEME_LIST} from '../lib/profileThemes.ts';
import type {
  CustomFrameItem,
  LanguageCode,
  ProfilePrivacy,
  ProfileThemeId,
  UserProfile,
} from '../types.ts';
import {GENERATED_ASSETS} from '../types.ts';
import {FrameStoreModal} from './FrameStoreModal.tsx';
import {GiftArtwork} from './GiftArtwork.tsx';
import {AvatarWithFrame, SafeImage, VerificationBadge} from './TxlLogo.tsx';

const FRAMES = ['Pulso Neón', 'Aurora Violeta', 'Fuego Magenta', 'Sin marco'];
const PRESET_AVATARS = [
  GENERATED_ASSETS.defaultAvatar,
  GENERATED_ASSETS.cyberAnime,
  GENERATED_ASSETS.gaming,
  GENERATED_ASSETS.synthwave,
];

export function ProfileView({
  user,
  lang,
  onUserUpdated,
  onNavigateCircles,
  onOpenOwnerPanel,
}: {
  user: UserProfile;
  lang: LanguageCode;
  onUserUpdated: (user: UserProfile) => void;
  onNavigateCircles: () => void;
  onOpenOwnerPanel: () => void;
}) {
  const [profileTab, setProfileTab] = useState<'overview' | 'gifts' | 'frames'>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [frameStoreOpen, setFrameStoreOpen] = useState(false);

  // Collectible 3D Gifts tab state
  const [giftFilter, setGiftFilter] = useState<'collected' | 'all'>('collected');
  const [showcaseGift, setShowcaseGift] = useState<GiftDefinition | null>(null);
  const [showcaseRunId, setShowcaseRunId] = useState(0);
  const [showcaseAnimating, setShowcaseAnimating] = useState(true);

  // Frame Collector tab state
  const [storeFrames, setStoreFrames] = useState<CustomFrameItem[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [frameNotice, setFrameNotice] = useState<string | null>(null);

  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [region, setRegion] = useState(user.region || 'Global');
  const [frame, setFrame] = useState(user.frame);
  const [customFrameId, setCustomFrameId] = useState<string>('');
  const [previewFrameImg, setPreviewFrameImg] = useState<string | null>(user.frameImageUrl || null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(user.bannerUrl || null);
  const [profileTheme, setProfileTheme] = useState<ProfileThemeId>(user.profileTheme || 'neon-pink');
  const [profilePrivacy, setProfilePrivacy] = useState<ProfilePrivacy>(
    user.profilePrivacy === 'private' ? 'private' : 'public'
  );
  const [hideJoinDate, setHideJoinDate] = useState(Boolean(user.hideJoinDate));
  const [statusInput, setStatusInput] = useState(user.statusText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coinMsg, setCoinMsg] = useState<string | null>(null);
  const [requesterUsers, setRequesterUsers] = useState<UserProfile[]>([]);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);

  const isOwner = user.role === 'owner' || Boolean(user.infiniteCoins);
  const giftCollection = user.giftCollection || {};
  const activeTheme = getProfileTheme(user.profileTheme);
  const joinDateText = formatJoinDate(user.createdAt, lang);

  const totalCollectedGifts = useMemo(
    () =>
      Object.values(giftCollection).reduce(
        (sum, count) => sum + (typeof count === 'number' && count > 0 ? count : 0),
        0
      ),
    [giftCollection]
  );

  const uniqueUnlockedCount = useMemo(
    () => GIFT_ITEMS.filter((g) => (giftCollection[g.id] || 0) > 0).length,
    [giftCollection]
  );

  const displayedGifts = useMemo(() => {
    if (giftFilter === 'all') return GIFT_ITEMS;
    return GIFT_ITEMS.filter((g) => (giftCollection[g.id] || 0) > 0);
  }, [giftFilter, giftCollection]);

  const ownedCustomFrames = useMemo(() => {
    const ownedSet = new Set(user.ownedFrameIds || []);
    return storeFrames.filter((f) => ownedSet.has(f.id) || f.creatorId === user.id);
  }, [storeFrames, user.ownedFrameIds, user.id]);

  async function loadOwnedFrames() {
    setFramesLoading(true);
    try {
      const res = await apiRequest<{frames: CustomFrameItem[]}>('/api/frames');
      setStoreFrames(res.frames);
    } catch {
      // ignore load error softly
    } finally {
      setFramesLoading(false);
    }
  }

  useEffect(() => {
    void loadOwnedFrames();
  }, [user.ownedFrameIds?.length, frameStoreOpen]);

  useEffect(() => {
    if (!showcaseGift) return;
    setShowcaseAnimating(true);
    const timer = window.setTimeout(() => {
      setShowcaseAnimating(false);
    }, 2850);
    return () => window.clearTimeout(timer);
  }, [showcaseGift, showcaseRunId]);

  useEffect(() => {
    const reqIds = user.pendingFollowRequests || [];
    if (reqIds.length === 0) {
      setRequesterUsers([]);
      return;
    }
    apiRequest<{users: UserProfile[]}>('/api/users')
      .then((res) => {
        const set = new Set(reqIds);
        setRequesterUsers(res.users.filter((u) => set.has(u.id)));
      })
      .catch(() => undefined);
  }, [user.pendingFollowRequests?.join(',')]);

  function openEditModal() {
    setUsername(user.username);
    setBio(user.bio);
    setRegion(user.region || 'Global');
    setFrame(user.frame);
    setCustomFrameId('');
    setPreviewFrameImg(user.frameImageUrl || null);
    setAvatarUrl(user.avatarUrl);
    setBannerUrl(user.bannerUrl || null);
    setProfileTheme(user.profileTheme || 'neon-pink');
    setProfilePrivacy(user.profilePrivacy === 'private' ? 'private' : 'public');
    setHideJoinDate(Boolean(user.hideJoinDate));
    setError(null);
    setEditOpen(true);
  }

  function triggerGiftShowcase(gift: GiftDefinition) {
    setShowcaseGift(gift);
    setShowcaseAnimating(true);
    setShowcaseRunId((prev) => prev + 1);
  }

  function downloadPngFrame(dataUrl: string, name: string) {
    if (!dataUrl) return;
    const safe = (name || 'marco-txlsocial').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${safe}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleEquipCustomFrame(customFrame: CustomFrameItem) {
    setEquippingId(customFrame.id);
    setFrameNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/frames/${customFrame.id}/equip`, {
        method: 'POST',
      });
      onUserUpdated(res.user);
      setFrameNotice(`Equipaste "${customFrame.name}" en tu avatar.`);
    } catch (err) {
      setFrameNotice(err instanceof Error ? err.message : 'No se pudo equipar este marco');
    } finally {
      setEquippingId(null);
    }
  }

  async function handleEquipBuiltinFrame(builtinName: string) {
    setEquippingId(`css:${builtinName}`);
    setFrameNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>('/api/users/me', {
        method: 'PATCH',
        body: {frame: builtinName},
      });
      onUserUpdated(res.user);
      setFrameNotice(`Marco activo actualizado a "${builtinName}".`);
    } catch (err) {
      setFrameNotice(err instanceof Error ? err.message : 'No se pudo cambiar el marco');
    } finally {
      setEquippingId(null);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readAndCompressImage(file, 512);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el avatar');
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readBannerOrBackgroundImage(file, 1400, 600);
      setBannerUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la portada');
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        username: username.trim(),
        bio: bio.trim(),
        region: region.trim() || 'Global',
        avatarUrl,
        bannerUrl,
        profileTheme,
        profilePrivacy,
        hideJoinDate,
      };
      if (customFrameId) {
        payload.customFrameId = customFrameId;
      } else if (!previewFrameImg) {
        payload.frame = frame;
      }
      const res = await apiRequest<{user: UserProfile}>('/api/users/me', {
        method: 'PATCH',
        body: payload,
      });
      onUserUpdated(res.user);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetProfileDefaults() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{user: UserProfile}>('/api/users/me/reset-profile', {
        method: 'POST',
      });
      onUserUpdated(res.user);
      setBio(res.user.bio);
      setBannerUrl(null);
      setProfileTheme('neon-pink');
      setProfilePrivacy('public');
      setHideJoinDate(false);
      setFrame('Pulso Neón');
      setCustomFrameId('');
      setPreviewFrameImg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restaurar el perfil');
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowRequestDecision(requesterId: string, action: 'accept' | 'reject') {
    try {
      const res = await apiRequest<{user: UserProfile}>(
        `/api/users/me/follow-requests/${requesterId}`,
        {
          method: 'POST',
          body: {action},
        }
      );
      onUserUpdated(res.user);
    } catch {
      // ignore softly
    }
  }

  async function handleSaveStatus(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{user: UserProfile}>('/api/users/me', {
        method: 'PATCH',
        body: {statusText: statusInput.trim()},
      });
      onUserUpdated(res.user);
      setStatusOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    } finally {
      setSaving(false);
    }
  }

  async function handleClaimCoins(mode: 'timed' | 'chest') {
    setCoinMsg(null);
    try {
      const res = await apiRequest<{reward: number; user: UserProfile}>('/api/users/me/claim-coins', {
        method: 'POST',
        body: {mode},
      });
      onUserUpdated(res.user);
      setCoinMsg(
        mode === 'chest'
          ? `¡Abriste un cofrecito neón y ganaste +${res.reward} monedas!`
          : `¡Reclamaste +${res.reward} monedas gratis!`
      );
    } catch (err) {
      setCoinMsg(err instanceof Error ? err.message : 'Espera unos segundos para volver a reclamar.');
    }
  }

  const roleLabel =
    user.role === 'owner' ? 'Dueño' : user.role === 'moderator' ? 'Moderador' : 'Miembro';

  return (
    <div className="space-y-5 max-w-2xl mx-auto txl-profile-enter">
      {/* Banner Header (Custom Cover + Profile Theme) */}
      <div
        className={`relative rounded-3xl border ${activeTheme.borderClass} bg-gradient-to-r ${activeTheme.gradientClass} px-6 py-8 text-center overflow-hidden min-h-[132px] flex flex-col items-center justify-center`}
      >
        {user.bannerUrl ? (
          <>
            <SafeImage
              src={user.bannerUrl}
              alt="Portada de perfil"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-[#0B0516]/60 backdrop-blur-[1px]" />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'repeating-linear-gradient(108deg, transparent 0px, transparent 58px, rgba(255,77,157,0.45) 59px, transparent 60px)',
            }}
          />
        )}
        <div className="relative z-10">
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">TXLsocial</h1>
          <p className={`text-xs font-medium mt-1 ${activeTheme.accentTextClass}`}>
            {activeTheme.label} ·{' '}
            {user.profilePrivacy === 'private' ? 'Perfil Privado 🔒' : 'Perfil Público 🌐'}
          </p>
        </div>
      </div>

      {/* Sub-Tabs Navigation: Perfil | Regalos 3D | Marcos */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#140A29]/90 border border-purple-500/25 p-1.5">
        <button
          type="button"
          onClick={() => setProfileTab('overview')}
          className={`rounded-xl py-2.5 px-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            profileTab === 'overview'
              ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white shadow-md'
              : 'text-[#C4B5FD] hover:text-white hover:bg-white/5'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === 'es' ? 'Perfil' : 'Profile'}</span>
        </button>

        <button
          type="button"
          onClick={() => setProfileTab('gifts')}
          className={`rounded-xl py-2.5 px-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            profileTab === 'gifts'
              ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white shadow-md'
              : 'text-[#C4B5FD] hover:text-white hover:bg-white/5'
          }`}
        >
          <Gift className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === 'es' ? 'Regalos 3D' : '3D Gifts'}</span>
          {totalCollectedGifts > 0 && (
            <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded-full bg-black/30 text-amber-200">
              {totalCollectedGifts}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setProfileTab('frames');
            void loadOwnedFrames();
          }}
          className={`rounded-xl py-2.5 px-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            profileTab === 'frames'
              ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white shadow-md'
              : 'text-[#C4B5FD] hover:text-white hover:bg-white/5'
          }`}
        >
          <Frame className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === 'es' ? 'Marcos' : 'Frames'}</span>
          <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded-full bg-black/30 text-cyan-200">
            {FRAMES.length + ownedCustomFrames.length}
          </span>
        </button>
      </div>

      {/* ——— TAB 1: OVERVIEW ——— */}
      {profileTab === 'overview' && (
        <div className="txl-card rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <AvatarWithFrame
              src={user.avatarUrl}
              alt={user.username}
              frame={user.frame}
              frameImageUrl={user.frameImageUrl}
              sizeClass="w-28 h-28"
            />
            <button
              type="button"
              onClick={openEditModal}
              aria-label="Editar avatar y perfil"
              className="absolute -bottom-1 -right-1 z-20 w-10 h-10 rounded-full txl-btn-primary flex items-center justify-center border-2 border-[#160B2B] cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-display text-2xl font-bold text-white">{user.username}</h2>
              <VerificationBadge tier={user.badgeTier} verified={user.verified} size={20} />
            </div>

            <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#150A28] border border-purple-400/35 px-3.5 py-1 text-xs font-medium text-[#E9DFFF]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C084FC]" />
                <span>{roleLabel}</span>
              </div>

              <div
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${activeTheme.pillClass}`}
              >
                {user.profilePrivacy === 'private' ? (
                  <>
                    <Lock className="w-3 h-3" />
                    <span>Privado</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3" />
                    <span>Público</span>
                  </>
                )}
              </div>
            </div>

            {joinDateText && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#B8A9D9]">
                <Calendar className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>
                  Se unió el {joinDateText}
                  {user.hideJoinDate ? ' (oculto para otros)' : ''}
                </span>
              </div>
            )}

            <p className={`text-xs mt-1.5 ${activeTheme.accentTextClass}`}>
              {lang === 'es' ? `Marco activo: ${user.frame}` : `Active frame: ${user.frame}`}
            </p>
          </div>

          {/* Custom Status Trigger */}
          <button
            type="button"
            onClick={() => {
              setStatusInput(user.statusText);
              setStatusOpen(true);
            }}
            className="w-full max-w-md rounded-full bg-[#160B2B] border border-purple-400/30 hover:border-[#FF4D9D]/50 px-4 py-2.5 text-xs text-[#E5DBFF] flex items-center justify-center gap-2 min-h-[40px] cursor-pointer transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#FF4D9D] shrink-0" />
            <span className="truncate">
              {user.statusText ||
                (lang === 'es'
                  ? 'Toca para establecer un estado personalizado'
                  : 'Tap to set a custom status')}
            </span>
          </button>

          <p className="text-sm text-[#B8A9D9] max-w-md leading-relaxed">
            {user.bio ||
              (lang === 'es'
                ? 'Agrega una bio corta para presentarte en tus círculos.'
                : 'Add a short bio to introduce yourself in circles.')}
          </p>

          {/* 3 Metric Boxes */}
          <div className="grid grid-cols-3 gap-3 w-full pt-1">
            <div className="rounded-2xl bg-[#1A0D33]/90 border border-purple-400/20 py-3.5 px-2">
              <div className="font-mono-num text-xl font-bold text-white">{user.circlesCount}</div>
              <div className="text-xs text-[#B8A9D9] mt-0.5">
                {lang === 'es' ? 'comunidades' : 'circles'}
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-[#A855F7] to-[#FF4D9D] py-3.5 px-2 shadow-lg shadow-pink-900/30">
              <div className="font-mono-num text-xl font-bold text-white">
                {user.followersCount.toLocaleString()}
              </div>
              <div className="text-xs text-white/90 mt-0.5">
                {lang === 'es' ? 'seguidores' : 'followers'}
              </div>
            </div>

            <div className="rounded-2xl bg-[#1A0D33]/90 border border-purple-400/20 py-3.5 px-2">
              <div className="font-mono-num text-xl font-bold text-white">{user.postsCount}</div>
              <div className="text-xs text-[#B8A9D9] mt-0.5">
                {lang === 'es' ? 'publicaciones' : 'posts'}
              </div>
            </div>
          </div>

          {/* Coins Banner (∞ for Owner) */}
          <button
            type="button"
            onClick={() => {
              setCoinMsg(null);
              setCoinsOpen(true);
            }}
            className="w-full rounded-2xl bg-[#2B1F16]/85 border border-amber-400/35 hover:border-amber-400/60 px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-amber-200 font-mono-num">
                  {isOwner
                    ? '∞ Monedas (Dueño)'
                    : `${user.coins.toLocaleString()} ${lang === 'es' ? 'monedas' : 'coins'}`}
                </div>
                <div className="text-xs text-amber-100/75 truncate">
                  {isOwner
                    ? 'Monedas ilimitadas para enviar cualquier regalo 3D y regalar por usuario'
                    : lang === 'es'
                      ? 'Toca para reclamar por tiempo o abrir cofrecitos'
                      : 'Tap to claim timed rewards or open chests'}
                </div>
              </div>
            </div>
            <Gift className="w-5 h-5 text-amber-300 shrink-0" />
          </button>

          {/* Cristales & Custom PNG Frame Store Banner */}
          <button
            type="button"
            onClick={() => setFrameStoreOpen(true)}
            className="w-full rounded-2xl bg-[#102033]/85 border border-cyan-400/35 hover:border-cyan-300 px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-cyan-400/15 border border-cyan-400/50 flex items-center justify-center shrink-0">
                <Gem className="w-5 h-5 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-cyan-200 font-mono-num">
                  {user.role === 'owner' || user.infiniteCrystals
                    ? '∞ Cristales (Dueño)'
                    : `${user.crystals || 0} Cristales`}
                </div>
                <div className="text-xs text-cyan-100/75 truncate">
                  Tienda de Marcos PNG · Importa y vende tus propios marcos
                </div>
              </div>
            </div>
            <ShoppingBag className="w-5 h-5 text-cyan-300 shrink-0" />
          </button>

          {/* Primary Action Row */}
          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={openEditModal}
              className="rounded-full py-3 px-4 text-sm font-semibold border border-purple-400/40 bg-[#170A2B] text-white hover:bg-purple-500/15 min-h-[46px] cursor-pointer"
            >
              {lang === 'es' ? 'Editar perfil' : 'Edit profile'}
            </button>
            <button
              type="button"
              onClick={onNavigateCircles}
              className="txl-btn-primary rounded-full py-3 px-4 text-sm font-semibold min-h-[46px] cursor-pointer"
            >
              {lang === 'es' ? 'Ver círculos' : 'View circles'}
            </button>
          </div>

          {/* Pending Follow Requests (Private Profile Approval) */}
          {requesterUsers.length > 0 && (
            <div className="w-full rounded-2xl bg-[#150A29] border border-[#FF4D9D]/40 p-4 text-left space-y-2.5">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#FF4D9D]" />
                <span>Solicitudes para ver tu perfil privado ({requesterUsers.length})</span>
              </div>
              <div className="space-y-2">
                {requesterUsers.map((reqUser) => (
                  <div
                    key={reqUser.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#1E1038] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <SafeImage
                        src={reqUser.avatarUrl}
                        alt={reqUser.username}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <span className="text-xs font-semibold text-white truncate">
                        @{reqUser.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleFollowRequestDecision(reqUser.id, 'accept')}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 cursor-pointer"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFollowRequestDecision(reqUser.id, 'reject')}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/15 border border-rose-400/35 text-rose-200 cursor-pointer"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Owner Panel Button (only for Owner) */}
          {user.role === 'owner' && (
            <button
              type="button"
              onClick={onOpenOwnerPanel}
              className="w-full rounded-2xl bg-[#130824] border border-[#FF4D9D]/55 hover:border-[#FF4D9D] px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <BadgeCheck className="w-5 h-5 text-[#FF4D9D] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    Dar Monedas, Cristales, Verificables y Baneos
                  </div>
                  <div className="text-xs text-[#B8A9D9] truncate">
                    Monedas ∞ · Cristales ∞ · Asigna cantidad exacta por usuario · ⚫🔵🔴
                  </div>
                </div>
              </div>
              <ShieldCheck className="w-5 h-5 text-[#FF4D9D] shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* ——— TAB 2: REGALOS 3D COLECCIONABLES ——— */}
      {profileTab === 'gifts' && (
        <div className="txl-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#FF4D9D]" />
                <span>Coleccionables de Regalos 3D</span>
              </h2>
              <p className="text-xs text-[#B8A9D9] mt-0.5">
                Acumulados: <strong className="text-amber-300 font-mono-num">{totalCollectedGifts}</strong>{' '}
                · Desbloqueados:{' '}
                <strong className="text-white font-mono-num">
                  {uniqueUnlockedCount}/{GIFT_ITEMS.length}
                </strong>{' '}
                · Toca cualquiera para ver su animación 3D
              </p>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setGiftFilter('collected')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  giftFilter === 'collected'
                    ? 'bg-[#EC4899] text-white'
                    : 'bg-[#170A2B] border border-purple-400/30 text-[#C4B5FD]'
                }`}
              >
                Mis acumulados ({uniqueUnlockedCount})
              </button>
              <button
                type="button"
                onClick={() => setGiftFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  giftFilter === 'all'
                    ? 'bg-[#EC4899] text-white'
                    : 'bg-[#170A2B] border border-purple-400/30 text-[#C4B5FD]'
                }`}
              >
                Todos ({GIFT_ITEMS.length})
              </button>
            </div>
          </div>

          {displayedGifts.length === 0 ? (
            <div className="rounded-2xl bg-[#140A29]/80 border border-purple-500/20 p-8 text-center space-y-3">
              <Gift className="w-10 h-10 text-[#FF4D9D] mx-auto opacity-80" />
              <div className="text-sm font-semibold text-white">
                Aún no has acumulado regalos 3D
              </div>
              <p className="text-xs text-[#B8A9D9] max-w-sm mx-auto">
                Envía o recibe regalos 3D dentro de las salas de voz para guardarlos en tu álbum
                coleccionable.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setGiftFilter('all')}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-[#221242] border border-purple-400/40 text-white hover:border-[#FF4D9D] cursor-pointer"
                >
                  Explorar catálogo 3D y animaciones
                </button>
                <button
                  type="button"
                  onClick={onNavigateCircles}
                  className="txl-btn-primary px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                >
                  Ir a salas de voz
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {displayedGifts.map((g) => {
                const count = giftCollection[g.id] || 0;
                const unlocked = count > 0;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => triggerGiftShowcase(g)}
                    className={`rounded-2xl p-3.5 flex flex-col items-center text-center gap-2 border cursor-pointer transition-all hover:scale-[1.02] ${
                      unlocked
                        ? 'bg-[#180C30] border-[#EC4899]/45 hover:border-[#FF4D9D] shadow-lg shadow-purple-950/40'
                        : 'bg-[#120822]/70 border-purple-500/20 opacity-75 hover:opacity-100 hover:border-purple-400/45'
                    }`}
                  >
                    <div className="relative">
                      <GiftArtwork
                        giftId={g.id}
                        imageUrl={g.imageUrl}
                        spriteCrop={g.spriteCrop}
                        emoji={g.emoji}
                        name={g.name}
                        sizeClass="w-16 h-16"
                      />
                      <span
                        className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono-num border ${
                          unlocked
                            ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] border-white/40 text-white'
                            : 'bg-[#1C1033] border-purple-400/30 text-[#A998CC]'
                        }`}
                      >
                        x{count}
                      </span>
                    </div>

                    <div className="min-w-0 w-full">
                      <div className="text-xs font-bold text-white truncate">{g.name}</div>
                      <div className="text-[10px] text-[#C4B5FD] truncate">{g.category}</div>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[11px] font-mono-num font-semibold text-amber-300">
                      <Coins className="w-3 h-3" />
                      {g.coins.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ——— TAB 3: COLECCIONADOR DE MARCOS ——— */}
      {profileTab === 'frames' && (
        <div className="txl-card rounded-3xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Frame className="w-5 h-5 text-cyan-300" />
                <span>Coleccionador de Marcos</span>
              </h2>
              <p className="text-xs text-[#B8A9D9] mt-0.5">
                Todos tus marcos desbloqueados, creados y comprados listos para equipar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFrameStoreOpen(true)}
              className="txl-btn-primary px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Tienda de Marcos PNG</span>
            </button>
          </div>

          {frameNotice && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
              <span>{frameNotice}</span>
              <button
                type="button"
                onClick={() => setFrameNotice(null)}
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Custom PNG Frames Owned / Created */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-200">
                Mis Marcos PNG Personalizados ({ownedCustomFrames.length})
              </h3>
            </div>

            {framesLoading ? (
              <div className="py-6 text-center text-xs text-[#B8A9D9]">
                Cargando tus marcos PNG...
              </div>
            ) : ownedCustomFrames.length === 0 ? (
              <div className="rounded-2xl bg-[#130926]/80 border border-cyan-400/25 p-5 text-center space-y-2">
                <p className="text-xs text-[#C7B8E6]">
                  Todavía no tienes marcos PNG personalizados en tu colección.
                </p>
                <button
                  type="button"
                  onClick={() => setFrameStoreOpen(true)}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                >
                  Importar o comprar marco PNG
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ownedCustomFrames.map((cf) => {
                  const isEquipped = user.frameImageUrl === cf.imageUrl;
                  return (
                    <div
                      key={cf.id}
                      className={`rounded-2xl p-4 border flex items-center gap-3.5 ${
                        isEquipped
                          ? 'bg-[#1D1038] border-[#FF4D9D]/70 shadow-lg shadow-pink-950/30'
                          : 'bg-[#130926]/90 border-purple-500/25'
                      }`}
                    >
                      <AvatarWithFrame
                        src={user.avatarUrl}
                        alt={cf.name}
                        frame={cf.name}
                        frameImageUrl={cf.imageUrl}
                        sizeClass="w-16 h-16"
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div>
                          <div className="text-sm font-bold text-white truncate">{cf.name}</div>
                          <div className="text-[11px] text-[#A998CC] truncate">
                            {cf.category || 'Comunidad'} · Por @{cf.creatorName}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            disabled={isEquipped || equippingId === cf.id}
                            onClick={() => handleEquipCustomFrame(cf)}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                              isEquipped
                                ? 'bg-emerald-500/20 border border-emerald-400/45 text-emerald-200 cursor-default'
                                : 'txl-btn-primary'
                            }`}
                          >
                            {isEquipped ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Equipado</span>
                              </>
                            ) : (
                              <span>Equipar</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadPngFrame(cf.imageUrl, cf.name)}
                            aria-label={`Descargar ${cf.name}`}
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-[#1B1035] border border-purple-400/30 text-[#D8CCF4] hover:border-cyan-400/50 flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>PNG</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Built-in Neon CSS Frames */}
          <div className="space-y-2.5 pt-2 border-t border-purple-500/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#C4B5FD]">
              Marcos Neón Clásicos ({FRAMES.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FRAMES.map((builtin) => {
                const isEquipped = !user.frameImageUrl && user.frame === builtin;
                return (
                  <div
                    key={builtin}
                    className={`rounded-2xl p-4 border flex items-center gap-3.5 ${
                      isEquipped
                        ? 'bg-[#1D1038] border-[#FF4D9D]/70'
                        : 'bg-[#130926]/90 border-purple-500/25'
                    }`}
                  >
                    <AvatarWithFrame
                      src={user.avatarUrl}
                      alt={builtin}
                      frame={builtin}
                      frameImageUrl={null}
                      sizeClass="w-16 h-16"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div>
                        <div className="text-sm font-bold text-white truncate">{builtin}</div>
                        <div className="text-[11px] text-[#A998CC]">Incluido en tu perfil</div>
                      </div>
                      <button
                        type="button"
                        disabled={isEquipped || equippingId === `css:${builtin}`}
                        onClick={() => handleEquipBuiltinFrame(builtin)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                          isEquipped
                            ? 'bg-emerald-500/20 border border-emerald-400/45 text-emerald-200 cursor-default'
                            : 'bg-[#251544] border border-purple-400/45 text-white hover:bg-[#331E5C]'
                        }`}
                      >
                        {isEquipped ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Equipado</span>
                          </>
                        ) : (
                          <span>Equipar</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ——— 3D COLLECTIBLE GIFT SHOWCASE OVERLAY ——— */}
      {showcaseGift && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowcaseGift(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="txl-card w-full max-w-sm rounded-3xl p-6 text-center space-y-4 relative overflow-hidden border-2"
            style={{borderColor: `${showcaseGift.glowColor}88`}}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF88BE]">
                Animación 3D · {showcaseGift.category}
              </span>
              <button
                type="button"
                onClick={() => setShowcaseGift(null)}
                aria-label="Cerrar animación"
                className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative h-56 flex items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute w-44 h-44 rounded-full blur-3xl opacity-55"
                style={{backgroundColor: showcaseGift.glowColor}}
              />
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <span
                  key={`${showcaseRunId}-${idx}`}
                  aria-hidden="true"
                  className={`txl-particle-${idx} absolute text-xl select-none pointer-events-none`}
                >
                  {idx % 2 === 0 ? showcaseGift.particles[0] || '✨' : showcaseGift.particles[1] || '💫'}
                </span>
              ))}

              <div
                key={showcaseRunId}
                className={`${
                  showcaseAnimating ? `txl-anim-${showcaseGift.animationType}` : 'scale-105'
                } rounded-3xl bg-[#1A0D33]/95 border-2 p-4 transition-transform duration-300`}
                style={{
                  borderColor: `${showcaseGift.glowColor}AA`,
                  boxShadow: `0 0 42px ${showcaseGift.glowColor}75`,
                }}
              >
                <GiftArtwork
                  giftId={showcaseGift.id}
                  imageUrl={showcaseGift.imageUrl}
                  spriteCrop={showcaseGift.spriteCrop}
                  emoji={showcaseGift.emoji}
                  name={showcaseGift.name}
                  sizeClass="w-32 h-32"
                  isShowcase
                />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold text-white">{showcaseGift.name}</h3>
              <div className="flex items-center justify-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-mono-num text-amber-300 font-bold">
                  <Coins className="w-3.5 h-3.5" />
                  {showcaseGift.coins.toLocaleString()} monedas
                </span>
                <span className="text-[#C4B5FD] font-mono-num">
                  Acumulados: x{giftCollection[showcaseGift.id] || 0}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowcaseRunId((prev) => prev + 1)}
              className="txl-btn-primary w-full rounded-full py-3 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Repetir animación 3D</span>
            </button>
          </div>
        </div>
      )}

      {/* Edit & Customize Profile Modal with Real-Time Preview */}
      {editOpen && (() => {
        const previewTheme = getProfileTheme(profileTheme);
        return (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="txl-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-white">
                  Personalizar Perfil
                </h2>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  aria-label="Cerrar"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Real-time Preview Card */}
              <div
                className={`rounded-2xl border ${previewTheme.borderClass} bg-[#110822] overflow-hidden`}
              >
                <div
                  className={`relative h-20 bg-gradient-to-r ${previewTheme.gradientClass} overflow-hidden`}
                >
                  {bannerUrl && (
                    <SafeImage
                      src={bannerUrl}
                      alt="Vista previa de portada"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#110822] via-black/15 to-transparent" />
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 text-white">
                    Vista previa en vivo
                  </span>
                </div>
                <div className="px-4 pb-3.5 -mt-8 relative z-10 flex items-end gap-3">
                  <AvatarWithFrame
                    src={avatarUrl}
                    alt={username || user.username}
                    frame={frame}
                    frameImageUrl={previewFrameImg}
                    sizeClass="w-16 h-16"
                  />
                  <div className="min-w-0 pb-0.5">
                    <div className="flex items-center gap-1">
                      <span className="font-display text-sm font-bold text-white truncate">
                        {username || user.username}
                      </span>
                      <VerificationBadge tier={user.badgeTier} verified={user.verified} size={14} />
                    </div>
                    <p className="text-[11px] text-[#C4B5FD] truncate">
                      {bio || 'Tu biografía aparecerá aquí'}
                    </p>
                    <p className="text-[10px] text-[#9E8CC4]">
                      {profilePrivacy === 'private' ? '🔒 Privado' : '🌐 Público'}
                      {!hideJoinDate && joinDateText ? ` · Desde ${joinDateText}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Banner Cover Upload */}
                <div className="space-y-2">
                  <p className="text-xs text-[#C7B8E6] font-medium">Imagen de portada</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      ref={bannerFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleBannerUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bannerFileRef.current?.click()}
                      className="px-3.5 py-2 rounded-full text-xs font-medium border border-[#FF4D9D]/55 text-[#FF88BE] hover:bg-[#FF4D9D]/10 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>{bannerUrl ? 'Cambiar portada' : 'Subir portada'}</span>
                    </button>
                    {bannerUrl && (
                      <button
                        type="button"
                        onClick={() => setBannerUrl(null)}
                        className="px-3 py-2 rounded-full text-xs font-medium bg-rose-500/15 border border-rose-400/35 text-rose-200 cursor-pointer"
                      >
                        Quitar portada
                      </button>
                    )}
                  </div>
                </div>

                {/* Avatar Picker */}
                <div>
                  <p className="text-xs text-[#C7B8E6] font-medium mb-2">
                    Foto de perfil o avatar
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {PRESET_AVATARS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAvatarUrl(preset)}
                        className={`rounded-full p-0.5 cursor-pointer ${
                          avatarUrl === preset
                            ? 'ring-2 ring-[#FF4D9D]'
                            : 'opacity-75 hover:opacity-100'
                        }`}
                      >
                        <SafeImage
                          src={preset}
                          alt="Avatar predefinido"
                          className="w-11 h-11 rounded-full object-cover"
                        />
                      </button>
                    ))}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="px-3.5 py-2 rounded-full text-xs font-medium border border-purple-400/40 text-[#E5DBFF] hover:bg-purple-500/15 min-h-[38px] cursor-pointer"
                    >
                      Subir foto
                    </button>
                  </div>
                </div>

                {/* Username & Read-only Join Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#B8A9D9] mb-1">Nombre de usuario</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      maxLength={24}
                      className="txl-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[42px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#B8A9D9] mb-1">
                      Se unió (solo lectura)
                    </label>
                    <div className="rounded-xl bg-[#130926] border border-purple-500/20 px-3.5 py-2.5 text-sm text-[#A998CC] min-h-[42px] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                      <span className="truncate">{joinDateText || 'Registrado'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#B8A9D9] mb-1">
                    Biografía o descripción
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={180}
                    placeholder="Cuéntale a la comunidad sobre ti..."
                    className="txl-input w-full rounded-xl px-4 py-3 text-sm resize-none"
                  />
                </div>

                {/* Color / Theme selector */}
                <div className="space-y-2">
                  <p className="text-xs text-[#B8A9D9] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#FF4D9D]" />
                    <span>Color o tema del perfil</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROFILE_THEME_LIST.map((themeOpt) => (
                      <button
                        key={themeOpt.id}
                        type="button"
                        onClick={() => setProfileTheme(themeOpt.id)}
                        className={`py-2 px-3 rounded-xl text-xs font-medium flex items-center gap-2 border cursor-pointer ${
                          profileTheme === themeOpt.id
                            ? 'bg-[#2A154F] border-[#FF4D9D] text-white'
                            : 'bg-[#170A2B] border-purple-400/25 text-[#CBBCEB]'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{backgroundColor: themeOpt.swatchHex}}
                        />
                        <span className="truncate">{themeOpt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Decorative Frame Picker (CSS + Owned PNG Frames) */}
                <div className="space-y-2">
                  <p className="text-xs text-[#B8A9D9]">Marco decorativo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FRAMES.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setFrame(f);
                          setCustomFrameId('');
                          setPreviewFrameImg(null);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-medium min-h-[38px] cursor-pointer ${
                          !previewFrameImg && frame === f
                            ? 'bg-[#A855F7] text-white'
                            : 'bg-[#170A2B] border border-purple-400/25 text-[#CBBCEB]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  {ownedCustomFrames.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                      {ownedCustomFrames.map((cf) => (
                        <button
                          key={cf.id}
                          type="button"
                          onClick={() => {
                            setFrame(cf.name);
                            setCustomFrameId(cf.id);
                            setPreviewFrameImg(cf.imageUrl);
                          }}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium shrink-0 flex items-center gap-1.5 border cursor-pointer ${
                            previewFrameImg === cf.imageUrl
                              ? 'bg-cyan-500/25 border-cyan-400 text-white'
                              : 'bg-[#170A2B] border-purple-400/25 text-[#D8CCF4]'
                          }`}
                        >
                          <img src={cf.imageUrl} alt={cf.name} className="w-5 h-5 object-contain" />
                          <span>{cf.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Profile Privacy & Join Date Toggle */}
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-[#B8A9D9] font-medium">Privacidad del perfil</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setProfilePrivacy('public')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border cursor-pointer ${
                        profilePrivacy === 'public'
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                          : 'bg-[#170A2B] border-purple-400/25 text-[#CBBCEB]'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Público (todos)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfilePrivacy('private')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border cursor-pointer ${
                        profilePrivacy === 'private'
                          ? 'bg-[#EC4899]/20 border-[#EC4899] text-white'
                          : 'bg-[#170A2B] border-purple-400/25 text-[#CBBCEB]'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Privado (aprobados)</span>
                    </button>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-xl bg-[#150B29] border border-purple-400/20 px-3.5 py-2.5 text-xs text-white cursor-pointer">
                    <span className="flex items-center gap-2">
                      <EyeOff className="w-3.5 h-3.5 text-[#C084FC]" />
                      <span>Ocultar fecha en que me uní a otros</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={hideJoinDate}
                      onChange={(e) => setHideJoinDate(e.target.checked)}
                      className="w-4 h-4 accent-[#EC4899]"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs text-[#B8A9D9] mb-1">
                    País o región (opcional)
                  </label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    maxLength={32}
                    placeholder="Global, México, España, Argentina..."
                    className="txl-input w-full rounded-xl px-4 py-2.5 text-sm min-h-[42px]"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleResetProfileDefaults}
                    className="sm:flex-1 rounded-full py-3 px-4 text-xs font-semibold bg-[#1B1035] border border-purple-400/35 text-[#D8CCF4] hover:border-[#FF4D9D]/50 flex items-center justify-center gap-1.5 min-h-[46px] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar valores por defecto</span>
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="txl-btn-primary sm:flex-1 rounded-full py-3 px-4 text-sm font-semibold min-h-[46px] disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Custom Status Modal */}
      {statusOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Estado personalizado</h2>
              <button
                type="button"
                onClick={() => setStatusOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStatus} className="space-y-4">
              <input
                type="text"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                placeholder="Ej. Escuchando synthwave en sala..."
                maxLength={64}
                className="txl-input w-full rounded-xl px-4 py-3 text-sm min-h-[46px]"
              />
              <button
                type="submit"
                disabled={saving}
                className="txl-btn-primary w-full rounded-full py-3 text-sm font-semibold min-h-[46px] cursor-pointer"
              >
                Guardar estado
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Coins & Chests Modal */}
      {coinsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Recompensas Neón</h2>
              <button
                type="button"
                onClick={() => setCoinsOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2">
              <div className="font-mono-num text-3xl font-bold text-amber-300">
                {isOwner ? '∞' : user.coins.toLocaleString()}
              </div>
              <div className="text-xs text-[#B8A9D9]">
                {isOwner ? 'Monedas infinitas del Dueño' : 'Monedas acumuladas'}
              </div>
            </div>

            {coinMsg && (
              <div className="rounded-xl bg-amber-500/15 border border-amber-400/35 px-4 py-2.5 text-xs text-amber-100">
                {coinMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleClaimCoins('timed')}
                className="rounded-2xl bg-[#1C0E38] border border-purple-400/30 hover:border-amber-400/50 p-4 flex flex-col items-center gap-2 cursor-pointer"
              >
                <Coins className="w-6 h-6 text-amber-300" />
                <span className="text-xs font-semibold text-white">Reclamo rápido</span>
                <span className="text-[11px] text-amber-200">+25 monedas</span>
              </button>

              <button
                type="button"
                onClick={() => handleClaimCoins('chest')}
                className="rounded-2xl bg-gradient-to-br from-[#2C1450] to-[#4A1356] border border-[#FF4D9D]/45 hover:border-[#FF4D9D] p-4 flex flex-col items-center gap-2 cursor-pointer"
              >
                <Gift className="w-6 h-6 text-[#FF88BE]" />
                <span className="text-xs font-semibold text-white">Cofrecito Neón</span>
                <span className="text-[11px] text-[#FF88BE]">+15 a +100</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <FrameStoreModal
        open={frameStoreOpen}
        onClose={() => setFrameStoreOpen(false)}
        user={user}
        lang={lang}
        onUserUpdated={onUserUpdated}
      />
    </div>
  );
}
