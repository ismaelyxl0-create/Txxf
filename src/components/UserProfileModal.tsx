import {useEffect, useState} from 'react';
import {
  Ban,
  Calendar,
  Clock,
  Gem,
  Lock,
  ShieldAlert,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {apiRequest} from '../lib/api.ts';
import {formatJoinDate, getProfileTheme} from '../lib/profileThemes.ts';
import type {BadgeTier, LanguageCode, UserProfile} from '../types.ts';
import {AvatarWithFrame, SafeImage, VerificationBadge} from './TxlLogo.tsx';

export function UserProfileModal({
  userId,
  initialUser,
  currentUser,
  lang,
  onClose,
  onCurrentUserUpdated,
  onUserRefreshed,
  onBlockedUser,
}: {
  userId: string | null;
  initialUser?: UserProfile | null;
  currentUser: UserProfile;
  lang: LanguageCode;
  onClose: () => void;
  onCurrentUserUpdated: (user: UserProfile) => void;
  onUserRefreshed?: (user: UserProfile) => void;
  onBlockedUser?: (blockedUserId: string) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(initialUser || null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [badgeMenuOpen, setBadgeMenuOpen] = useState(false);
  const [crystalGrantInput, setCrystalGrantInput] = useState('25');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setProfile(initialUser || null);
    setConfirmBlock(false);
    setBadgeMenuOpen(false);
    setNotice(null);
    setError(null);
    setLoading(true);
    apiRequest<{user: UserProfile}>(`/api/users/${userId}/profile`)
      .then((res) => {
        setProfile(res.user);
        onUserRefreshed?.(res.user);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Perfil no disponible.');
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  const isSelf = profile?.id === currentUser.id;
  const isTargetOwner = profile?.role === 'owner';
  const canViewFull = profile?.canViewFullProfile ?? true;
  const isFollowing = profile ? currentUser.following.includes(profile.id) : false;
  const theme = getProfileTheme(profile?.profileTheme);
  const joinDateStr = profile?.createdAt ? formatJoinDate(profile.createdAt, lang) : '';

  async function handleFollowOrRequest() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{
        following: boolean;
        requested?: boolean;
        me: UserProfile;
        target: UserProfile;
      }>(`/api/users/${profile.id}/follow`, {method: 'POST'});
      onCurrentUserUpdated(res.me);
      setProfile(res.target);
      onUserRefreshed?.(res.target);
      if (res.target.profilePrivacy === 'private' && !res.following) {
        setNotice(
          res.requested
            ? 'Solicitud enviada para ver este perfil privado.'
            : 'Solicitud de seguimiento cancelada.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al seguir');
    } finally {
      setBusy(false);
    }
  }

  async function handleBlockUser() {
    if (!profile || isTargetOwner || isSelf) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/users/${profile.id}/block`, {
        method: 'POST',
      });
      onCurrentUserUpdated(res.user);
      onBlockedUser?.(profile.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo bloquear al usuario.');
      setBusy(false);
    }
  }

  async function handleOwnerAssignBadge(tier: BadgeTier) {
    if (!profile) return;
    setBusy(true);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${profile.id}/badge`, {
        method: 'POST',
        body: {tier},
      });
      setProfile(res.user);
      onUserRefreshed?.(res.user);
      setBadgeMenuOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleOwnerGrantCrystals() {
    if (!profile) return;
    const amount = Number(crystalGrantInput || 25);
    if (!Number.isFinite(amount) || amount < 1) return;
    setBusy(true);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${profile.id}/crystals`, {
        method: 'POST',
        body: {amount},
      });
      setProfile(res.user);
      onUserRefreshed?.(res.user);
      setNotice(`Asignaste +${amount} Cristales a @${res.user.username}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden border ${theme.borderClass}`}
      >
        {/* Banner Header */}
        <div
          className={`relative h-28 bg-gradient-to-r ${theme.gradientClass} overflow-hidden`}
        >
          {profile?.bannerUrl && canViewFull && (
            <SafeImage
              src={profile.bannerUrl}
              alt={`Portada de ${profile.username}`}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#120824] via-black/20 to-black/30" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 text-white hover:bg-black/80 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 -mt-10 relative z-10 text-center space-y-3.5">
          {loading && !profile ? (
            <div className="py-12 text-sm text-[#B8A9D9]">Cargando perfil...</div>
          ) : error && !profile ? (
            <div className="py-10 space-y-2">
              <p className="text-sm text-rose-200">{error}</p>
            </div>
          ) : profile ? (
            <>
              <div className="flex justify-center">
                <AvatarWithFrame
                  src={profile.avatarUrl}
                  alt={profile.username}
                  frame={profile.frame}
                  frameImageUrl={profile.frameImageUrl}
                  sizeClass="w-20 h-20"
                />
              </div>

              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <h3 className="font-display text-xl font-bold text-white">{profile.username}</h3>
                  <VerificationBadge
                    tier={profile.badgeTier}
                    verified={profile.verified}
                    size={18}
                  />
                </div>
                <p className={`text-xs mt-0.5 ${theme.accentTextClass}`}>
                  {profile.role === 'owner'
                    ? 'Dueño Global'
                    : profile.badgeTier === 'moderator'
                      ? 'Moderador'
                      : profile.badgeTier === 'influencer'
                        ? 'Influencer'
                        : 'Miembro'}{' '}
                  · {profile.followersCount} seguidores
                </p>

                {joinDateStr && (
                  <p className="inline-flex items-center gap-1 text-[11px] text-[#B8A9D9] mt-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>Se unió el {joinDateStr}</span>
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-3 py-2 text-xs text-rose-200">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-3 py-2 text-xs text-emerald-200">
                  {notice}
                </div>
              )}

              {!canViewFull ? (
                <div className="rounded-2xl bg-[#150A29] border border-purple-500/25 p-4 space-y-2">
                  <Lock className="w-5 h-5 text-[#FF88BE] mx-auto" />
                  <p className="text-xs font-semibold text-white">Este perfil es privado</p>
                  <p className="text-[11px] text-[#B8A9D9]">
                    Solo las personas aprobadas por @{profile.username} pueden ver su biografía,
                    portada y detalles.
                  </p>
                </div>
              ) : (
                <>
                  {profile.statusText && (
                    <div className="rounded-full bg-[#160B2B] border border-purple-400/25 px-3.5 py-1.5 text-xs text-[#E5DBFF] inline-block max-w-full truncate">
                      {profile.statusText}
                    </div>
                  )}
                  {profile.bio && (
                    <p className="text-xs text-[#D8CCF4] leading-relaxed">{profile.bio}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-xl bg-[#150A29] border border-purple-500/20 py-2">
                      <div className="font-mono-num text-sm font-bold text-white">
                        {profile.circlesCount}
                      </div>
                      <div className="text-[10px] text-[#A998CC]">Círculos</div>
                    </div>
                    <div className="rounded-xl bg-[#150A29] border border-purple-500/20 py-2">
                      <div className="font-mono-num text-sm font-bold text-white">
                        {profile.followersCount}
                      </div>
                      <div className="text-[10px] text-[#A998CC]">Seguidores</div>
                    </div>
                    <div className="rounded-xl bg-[#150A29] border border-purple-500/20 py-2">
                      <div className="font-mono-num text-sm font-bold text-white">
                        {profile.postsCount}
                      </div>
                      <div className="text-[10px] text-[#A998CC]">Posts</div>
                    </div>
                  </div>
                </>
              )}

              {!isSelf && (
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleFollowOrRequest}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      isFollowing
                        ? 'bg-[#2B1554] border border-purple-400/35 text-[#E5DBFF]'
                        : profile.followRequestedByMe
                          ? 'bg-amber-500/15 border border-amber-400/45 text-amber-200'
                          : 'txl-btn-primary'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Siguiendo</span>
                      </>
                    ) : profile.followRequestedByMe ? (
                      <>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Solicitud pendiente (toca para cancelar)</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>
                          {profile.profilePrivacy === 'private' ? 'Solicitar seguir' : 'Seguir'}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Block user button: NEVER shown on App Owner's profile */}
                  {!isTargetOwner && (
                    !confirmBlock ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmBlock(true)}
                        className="w-full py-2 px-4 rounded-full text-xs font-medium bg-rose-500/10 border border-rose-400/30 text-rose-200 hover:bg-rose-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Bloquear usuario</span>
                      </button>
                    ) : (
                      <div className="rounded-2xl bg-rose-950/50 border border-rose-400/45 p-3 space-y-2 text-left">
                        <p className="text-[11px] text-rose-100 leading-relaxed flex items-start gap-1.5">
                          <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                          <span>
                            Dejarás de ver sus publicaciones, comentarios y perfil. El usuario no
                            recibirá ninguna notificación.
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmBlock(false)}
                            className="py-2 rounded-xl text-xs font-medium bg-[#1C1033] text-[#D8CCF4] cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleBlockUser}
                            className="py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
                          >
                            Confirmar bloqueo
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Owner quick controls (only for global Owner, never on Owner itself) */}
              {currentUser.role === 'owner' && !isTargetOwner && (
                <div className="space-y-2.5 pt-3 border-t border-purple-500/20 text-left">
                  <button
                    type="button"
                    onClick={() => setBadgeMenuOpen((prev) => !prev)}
                    className="w-full py-2.5 px-4 rounded-full text-xs font-semibold bg-[#251544] border border-purple-400/40 text-white hover:bg-[#311C59] cursor-pointer text-center"
                  >
                    Asignar Insignia
                  </button>

                  {badgeMenuOpen && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          {id: 'none', label: 'Ninguna'},
                          {id: 'moderator', label: 'Azul · Mod'},
                          {id: 'influencer', label: 'Roja · Influencer'},
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={busy}
                          onClick={() => handleOwnerAssignBadge(opt.id)}
                          className={`py-2 px-2 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                            profile.badgeTier === opt.id
                              ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                              : 'bg-[#140A29] border-purple-400/25 text-[#D8CCF4]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-cyan-200 shrink-0">
                      <Gem className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Cristales:</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={crystalGrantInput}
                      onChange={(e) => setCrystalGrantInput(e.target.value)}
                      className="txl-input flex-1 rounded-xl px-2.5 py-1.5 text-xs font-mono-num min-h-[34px]"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleOwnerGrantCrystals}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 cursor-pointer"
                    >
                      Regalar
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
