import {useEffect, useRef, useState} from 'react';
import {
  AudioLines,
  ImagePlus,
  MessageSquare,
  Plus,
  Radio,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {apiRequest, readAndCompressImage} from '../lib/api.ts';
import type {CircleItem, LanguageCode, UserProfile} from '../types.ts';
import {GENERATED_ASSETS} from '../types.ts';
import {AvatarWithFrame, SafeImage, VerificationBadge} from './TxlLogo.tsx';
import {UserProfileModal} from './UserProfileModal.tsx';
import {VoiceRoomView} from './VoiceRoomView.tsx';

const QUICK_CATEGORIES = [
  'Hacer en vivos',
  'Charlas Nocturnas',
  'Gaming',
  'Música',
  'Anime & Manga',
  'Arte Digital',
];

const VISUAL_STYLES = [
  {id: 'cyber-anime' as const, label: 'Cyber Anime', img: GENERATED_ASSETS.cyberAnime},
  {id: 'gaming' as const, label: 'Gaming', img: GENERATED_ASSETS.gaming},
  {id: 'synthwave' as const, label: 'Synthwave', img: GENERATED_ASSETS.synthwave},
];

export function CirclesView({
  currentUser,
  lang,
  initialRoomId,
  onInitialRoomConsumed,
  onUserUpdated,
  onVoiceCountChange,
}: {
  currentUser: UserProfile;
  lang: LanguageCode;
  initialRoomId?: string | null;
  onInitialRoomConsumed?: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onVoiceCountChange: (count: number) => void;
}) {
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'live' | 'popular' | 'new'>('all');
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState<{id: string; mode: 'voice' | 'chat'} | null>(null);

  // Create community modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Charlas Nocturnas');
  const [newDescription, setNewDescription] = useState('');
  const [visualStyle, setVisualStyle] = useState<'cyber-anime' | 'gaming' | 'synthwave' | 'custom'>(
    'cyber-anime'
  );
  const [customCoverUrl, setCustomCoverUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadData() {
    try {
      const [circlesRes, usersRes] = await Promise.all([
        apiRequest<{circles: CircleItem[]; totalInVoice: number}>(
          `/api/circles?q=${encodeURIComponent(searchQuery)}&filter=${filter}`
        ),
        apiRequest<{users: UserProfile[]; totalRegistered: number}>(
          `/api/users?q=${encodeURIComponent(userQuery)}`
        ),
      ]);
      setCircles(circlesRes.circles);
      onVoiceCountChange(circlesRes.totalInVoice);
      setUsers(usersRes.users);
      setTotalRegistered(usersRes.totalRegistered);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [searchQuery, filter, userQuery]);

  useEffect(() => {
    if (!initialRoomId || loading) return;
    if (circles.some((c) => c.id === initialRoomId)) {
      setActiveRoom({id: initialRoomId, mode: 'voice'});
      onInitialRoomConsumed?.();
    }
  }, [initialRoomId, loading, circles]);

  async function refreshTotalVoiceCount() {
    const res = await apiRequest<{circles: CircleItem[]; totalInVoice: number}>('/api/circles');
    onVoiceCountChange(res.totalInVoice);
  }

  const activeCircle = activeRoom ? circles.find((c) => c.id === activeRoom.id) || null : null;

  if (activeCircle && activeRoom) {
    return (
      <VoiceRoomView
        initialCircle={activeCircle}
        initialMode={activeRoom.mode}
        currentUser={currentUser}
        lang={lang}
        onBack={() => {
          setActiveRoom(null);
          void loadData();
        }}
        onCircleUpdated={(updated) => {
          setCircles((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        }}
        onUserUpdated={onUserUpdated}
        onVoiceCountRefresh={() => void refreshTotalVoiceCount()}
      />
    );
  }

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await apiRequest<{circle: CircleItem}>('/api/circles', {
        method: 'POST',
        body: {
          name: newName,
          category: newCategory,
          description: newDescription,
          visualStyle,
          coverUrl: visualStyle === 'custom' ? customCoverUrl : undefined,
        },
      });
      setCircles((prev) => [res.circle, ...prev]);
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setCustomCoverUrl(null);
      setVisualStyle('cyber-anime');
      setActiveRoom({id: res.circle.id, mode: 'voice'});
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear comunidad');
    } finally {
      setCreating(false);
    }
  }

  async function handleCustomCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await readAndCompressImage(file, 900);
      setCustomCoverUrl(compressed);
      setVisualStyle('custom');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo leer la imagen');
    }
  }

  async function handleJoinToggle(circleId: string) {
    const res = await apiRequest<{circle: CircleItem}>(`/api/circles/${circleId}/join`, {
      method: 'POST',
    });
    setCircles((prev) => prev.map((c) => (c.id === circleId ? res.circle : c)));
  }

  async function handleDeleteCircle(circleId: string) {
    await apiRequest(`/api/circles/${circleId}`, {method: 'DELETE'});
    setCircles((prev) => prev.filter((c) => c.id !== circleId));
  }

  async function handleFollowToggle(targetId: string) {
    const res = await apiRequest<{following: boolean; me: UserProfile; target: UserProfile}>(
      `/api/users/${targetId}/follow`,
      {method: 'POST'}
    );
    onUserUpdated(res.me);
    setUsers((prev) => prev.map((u) => (u.id === targetId ? res.target : u)));
    if (inspectedUser?.id === targetId) {
      setInspectedUser(res.target);
    }
  }

  const otherUsers = users.filter((u) => u.id !== currentUser.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          {lang === 'es' ? 'Explorar Círculos' : 'Explore Circles'}
        </h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="hidden lg:inline-flex txl-btn-primary rounded-full px-5 py-2.5 text-sm font-semibold items-center gap-2 min-h-[44px] cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'es' ? 'Crear comunidad' : 'Create community'}</span>
        </button>
      </div>

      {/* Community Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#C084FC] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            lang === 'es' ? 'Buscar comunidades o temas...' : 'Search communities or topics...'
          }
          className="txl-input w-full rounded-full pl-11 pr-4 py-3 text-sm min-h-[46px]"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            {id: 'all', label: lang === 'es' ? 'Todas' : 'All'},
            {id: 'live', label: lang === 'es' ? 'Hacer en vivos' : 'Live rooms'},
            {id: 'popular', label: lang === 'es' ? 'Populares' : 'Popular'},
            {id: 'new', label: lang === 'es' ? 'Nuevas' : 'New'},
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-full text-xs font-medium min-h-[38px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              filter === tab.id
                ? 'bg-[#A855F7] text-white shadow-md shadow-purple-700/30'
                : 'bg-[#21103C] border border-purple-400/25 text-[#CBBCEB] hover:border-purple-400/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* People Search Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-white">
            {lang === 'es' ? 'Buscar personas' : 'Find people'}
          </h2>
          <span className="text-xs text-[#B8A9D9] font-mono-num">
            {totalRegistered} {lang === 'es' ? 'registrados' : 'registered'}
          </span>
        </div>

        <div className="relative">
          <UserPlus className="w-4 h-4 text-[#38BDF8] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder={
              lang === 'es'
                ? 'Buscar usuarios registrados por nombre...'
                : 'Search registered users by name...'
            }
            className="txl-input w-full rounded-2xl pl-11 pr-4 py-3 text-sm min-h-[46px]"
          />
        </div>

        {(userQuery.trim() !== '' || otherUsers.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {otherUsers.slice(0, 6).map((u) => {
              const isFollowing = currentUser.following.includes(u.id);
              return (
                <div
                  key={u.id}
                  className="txl-card rounded-2xl p-3 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setInspectedUser(u)}
                    className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                  >
                    <AvatarWithFrame
                      src={u.avatarUrl}
                      alt={u.username}
                      frame={u.frame}
                      frameImageUrl={u.frameImageUrl}
                      sizeClass="w-10 h-10"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold text-white truncate">
                          {u.username}
                        </span>
                        <VerificationBadge tier={u.badgeTier} verified={u.verified} size={15} />
                      </div>
                      <p className="text-xs text-[#9E8CC4] truncate">
                        {u.statusText || u.bio || `${u.followersCount} seguidores`}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFollowToggle(u.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[36px] flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isFollowing
                        ? 'bg-[#2B1554] text-[#D8CCF4] border border-purple-400/30'
                        : 'txl-btn-primary'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Siguiendo</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Seguir</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Communities Grid matching Screenshot_20261120-224707.png */}
      {loading ? (
        <div className="txl-card rounded-3xl p-10 text-center text-sm text-[#B8A9D9]">
          Cargando círculos...
        </div>
      ) : circles.length === 0 ? (
        <div className="txl-card rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-400/25 flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-[#C084FC]" />
          </div>
          <h2 className="font-display text-lg font-bold text-white">
            {lang === 'es' ? 'Aún no hay comunidades creadas' : 'No communities yet'}
          </h2>
          <p className="text-sm text-[#B8A9D9] mt-1.5 max-w-sm">
            {lang === 'es'
              ? 'Toca "+ Crear comunidad" abajo para abrir tu primera sala real como Admin.'
              : 'Tap "+ Create community" below to open your first room as Admin.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
          {circles.map((circle) => {
            const canDelete =
              circle.adminId === currentUser.id || currentUser.role === 'owner';
            const isRecent = Date.now() - circle.createdAt < 24 * 60 * 60 * 1000;

            return (
              <div
                key={circle.id}
                className="txl-card rounded-3xl p-3 flex flex-col gap-2.5 hover:border-[#FF4D9D]/50 transition-colors"
              >
                <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
                  <SafeImage
                    src={circle.coverUrl}
                    alt={circle.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#120824]/85 via-transparent to-black/25" />

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCircle(circle.id)}
                      aria-label="Eliminar comunidad"
                      className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/60 border border-rose-400/40 text-rose-300 hover:bg-rose-500/30 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isRecent && (
                    <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-[#38BDF8] text-[#07182E] text-[10px] font-bold">
                      nueva
                    </span>
                  )}

                  {circle.adminId === currentUser.id && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/55 px-2.5 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-sm">
                      <Shield className="w-2.5 h-2.5 text-amber-300" />
                      <span>Admin</span>
                    </span>
                  )}
                </div>

                <div className="min-w-0 px-0.5">
                  <h3 className="font-display text-base font-bold text-white truncate">
                    {circle.name}
                  </h3>
                  <p className="text-xs text-[#B8A9D9] truncate">
                    {circle.category} · <span className="font-mono-num">{circle.membersCount}</span>{' '}
                    {circle.membersCount === 1 ? 'miembro' : 'miembros'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveRoom({id: circle.id, mode: 'voice'})}
                    className="py-2 px-2 rounded-2xl bg-[#271449] border border-purple-400/25 hover:border-[#EC4899]/60 text-xs font-semibold text-white flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer"
                  >
                    <AudioLines className="w-3.5 h-3.5 text-[#FF4D9D]" />
                    <span>Voz</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRoom({id: circle.id, mode: 'chat'})}
                    className="py-2 px-2 rounded-2xl bg-[#271449] border border-purple-400/25 hover:border-[#38BDF8]/60 text-xs font-semibold text-white flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Chat</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleJoinToggle(circle.id)}
                  className={`w-full py-2 rounded-2xl text-xs font-medium min-h-[36px] cursor-pointer transition-colors ${
                    circle.isMember
                      ? 'bg-[#22113F] border border-purple-400/25 text-[#E9DFFF]'
                      : 'txl-btn-primary'
                  }`}
                >
                  {circle.isMember ? 'Miembro ✓' : 'Unirse'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile Bottom Primary CTA matching Screenshot 7 */}
      <div className="lg:hidden pt-1">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="txl-btn-primary w-full rounded-full py-3.5 px-6 text-sm font-semibold min-h-[48px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'es' ? 'Crear comunidad' : 'Create community'}</span>
        </button>
      </div>

      {/* Create Community Bottom Sheet / Modal (Screenshot 3) */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-6">
            <div className="w-10 h-1 bg-purple-400/35 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Crear nueva comunidad
                </h2>
                <p className="text-xs text-[#B8A9D9] mt-0.5">
                  Serás asignado automáticamente como Admin con control total.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-sm text-rose-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateCircle} className="space-y-4">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del círculo"
                required
                maxLength={48}
                className="txl-input w-full rounded-xl px-4 py-3 text-sm min-h-[46px]"
              />

              <div>
                <p className="text-xs font-medium text-[#C7B8E6] mb-2">Categoría rápida</p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {QUICK_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={`px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 min-h-[36px] flex items-center gap-1.5 cursor-pointer ${
                        newCategory === cat
                          ? 'bg-[#A855F7] text-white'
                          : 'bg-[#1A0D33] border border-purple-400/25 text-[#CBBCEB]'
                      }`}
                    >
                      {cat === 'Hacer en vivos' && <Radio className="w-3.5 h-3.5 text-[#FF4D9D]" />}
                      <span>{cat}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#A998CC] mb-1">Categoría</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  maxLength={36}
                  className="txl-input w-full rounded-xl px-4 py-3 text-sm min-h-[46px]"
                />
              </div>

              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descripción"
                rows={2}
                maxLength={240}
                className="txl-input w-full rounded-xl px-4 py-3 text-sm resize-none"
              />

              <div>
                <p className="text-xs font-medium text-[#C7B8E6] mb-2">
                  Estilo visual del círculo
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {VISUAL_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setVisualStyle(style.id)}
                      className={`rounded-2xl overflow-hidden border transition-all text-left cursor-pointer ${
                        visualStyle === style.id
                          ? 'border-[#FF4D9D] ring-2 ring-[#FF4D9D]/40'
                          : 'border-purple-400/25 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <SafeImage
                        src={style.img}
                        alt={style.label}
                        className="w-full h-16 object-cover"
                      />
                      <div className="bg-[#180C30] py-1.5 px-2 text-center text-[11px] font-medium text-white truncate">
                        {style.label}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCustomCoverPick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-full text-xs font-medium border border-[#FF4D9D]/60 text-[#FF88BE] hover:bg-[#FF4D9D]/10 flex items-center gap-2 min-h-[40px] cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>
                      {customCoverUrl ? 'Foto seleccionada ✓' : 'Elegir foto de fondo'}
                    </span>
                  </button>
                  {customCoverUrl && (
                    <img
                      src={customCoverUrl}
                      alt="Fondo personalizado"
                      className="w-10 h-10 rounded-xl object-cover border border-[#FF4D9D]/40"
                    />
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="txl-btn-primary w-full rounded-full py-3.5 px-6 text-sm font-semibold min-h-[48px] disabled:opacity-50 cursor-pointer"
              >
                {creating ? 'Creando comunidad...' : 'Crear comunidad'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* User Profile Inspection Modal */}
      <UserProfileModal
        userId={inspectedUser?.id || null}
        initialUser={inspectedUser}
        currentUser={currentUser}
        lang={lang}
        onClose={() => setInspectedUser(null)}
        onCurrentUserUpdated={onUserUpdated}
        onUserRefreshed={(refreshed) => {
          setUsers((prev) => prev.map((u) => (u.id === refreshed.id ? refreshed : u)));
        }}
        onBlockedUser={(blockedId) => {
          setUsers((prev) => prev.filter((u) => u.id !== blockedId));
        }}
      />
    </div>
  );
}
