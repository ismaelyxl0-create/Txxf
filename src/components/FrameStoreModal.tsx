import {useEffect, useMemo, useRef, useState} from 'react';
import {
  BadgeCheck,
  Check,
  Download,
  Gem,
  Heart,
  ImagePlus,
  Paintbrush,
  Search,
  Sparkles,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {apiRequest, readPngFrameImage} from '../lib/api.ts';
import {type FrameStudioStyle, renderFrameToPngDataUrl} from '../lib/frameStudio.ts';
import type {BadgeTier, CustomFrameItem, LanguageCode, UserProfile} from '../types.ts';
import {AvatarWithFrame, VerificationBadge} from './TxlLogo.tsx';

const STORE_CATEGORIES = [
  'Todos',
  'Anime',
  'Gaming',
  'Neón',
  'Fantasía',
  'Comunidad',
  'Mis Marcos',
] as const;

const STUDIO_STYLES: {id: FrameStudioStyle; label: string}[] = [
  {id: 'dragon-gold', label: 'Nube Dragón'},
  {id: 'neon-ring', label: 'Anillo Neón'},
  {id: 'cyber-hex', label: 'Cyber HUD'},
  {id: 'galaxy-aura', label: 'Aura Galáctica'},
  {id: 'anime-flame', label: 'Llama Anime'},
];

const COLOR_PRESETS = [
  {name: 'Dragón Oro', primary: '#F59E0B', secondary: '#EF4444'},
  {name: 'Neón Rosa', primary: '#EC4899', secondary: '#8B5CF6'},
  {name: 'Cyber Azul', primary: '#38BDF8', secondary: '#6366F1'},
  {name: 'Esmeralda', primary: '#10B981', secondary: '#22D3EE'},
  {name: 'Fuego Carmesí', primary: '#F43F5E', secondary: '#FB923C'},
];

const EMBLEMS = ['', '🐉', '⚡', '🔥', '👑', '💎', '⭐'];

export function FrameStoreModal({
  open,
  onClose,
  user,
  lang,
  onUserUpdated,
}: {
  open: boolean;
  onClose: () => void;
  user: UserProfile;
  lang: LanguageCode;
  onUserUpdated: (user: UserProfile) => void;
}) {
  const [tab, setTab] = useState<'store' | 'create' | 'crystals'>('store');
  const [createMode, setCreateMode] = useState<'studio' | 'upload'>('upload');
  const [frames, setFrames] = useState<CustomFrameItem[]>([]);
  const [creationCost, setCreationCost] = useState(10);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Owner Crystal & Verificables management inside FrameStoreModal
  const [storeUsers, setStoreUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [crystalDrafts, setCrystalDrafts] = useState<Record<string, string>>({});

  // Store filters & favorites
  const [categoryFilter, setCategoryFilter] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  // Studio Designer state
  const [studioStyle, setStudioStyle] = useState<FrameStudioStyle>('dragon-gold');
  const [primaryColor, setPrimaryColor] = useState('#F59E0B');
  const [secondaryColor, setSecondaryColor] = useState('#EF4444');
  const [thickness, setThickness] = useState(32);
  const [glow, setGlow] = useState(18);
  const [emblem, setEmblem] = useState('🐉');
  const [labelTop, setLabelTop] = useState('');

  // Upload PNG & Publish metadata state
  const [uploadedPngUrl, setUploadedPngUrl] = useState<string | null>(null);
  const [frameName, setFrameName] = useState('');
  const [frameCategory, setFrameCategory] = useState('Anime');
  const [frameDesc, setFrameDesc] = useState('');
  const [priceCrystals, setPriceCrystals] = useState('25');
  const [creating, setCreating] = useState(false);
  const pngInputRef = useRef<HTMLInputElement | null>(null);

  const isOwner = user.role === 'owner' || Boolean(user.infiniteCrystals);
  const ownedIds = user.ownedFrameIds || [];

  const studioPreviewUrl = useMemo(() => {
    if (!open || tab !== 'create' || createMode !== 'studio') return '';
    return renderFrameToPngDataUrl({
      style: studioStyle,
      primaryColor,
      secondaryColor,
      thickness,
      glow,
      emblem,
      labelTop,
    });
  }, [open, tab, createMode, studioStyle, primaryColor, secondaryColor, thickness, glow, emblem, labelTop]);

  const activeDraftPngUrl = createMode === 'studio' ? studioPreviewUrl : uploadedPngUrl || '';

  async function loadStore() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{frames: CustomFrameItem[]; creationCost: number}>('/api/frames');
      setFrames(res.frames);
      setCreationCost(res.creationCost || 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la tienda de marcos');
    } finally {
      setLoading(false);
    }
  }

  async function loadStoreUsers() {
    if (!isOwner) return;
    setUsersLoading(true);
    try {
      const res = await apiRequest<{users: UserProfile[]}>('/api/users');
      setStoreUsers(res.users);
    } catch {
      // ignore if unauthorized
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadStore();
      if (isOwner) {
        void loadStoreUsers();
      }
      setNotice(null);
      setError(null);
    }
  }, [open, isOwner]);

  if (!open) return null;

  function toggleFavorite(id: string) {
    setFavoriteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function downloadPngDataUrl(dataUrl: string, name: string) {
    if (!dataUrl) return;
    const safeName = (name || 'marco-txlsocial').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handlePickPng(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readPngFrameImage(file, 512);
      setUploadedPngUrl(dataUrl);
      if (!frameName.trim()) {
        const cleanBase = file.name.replace(/\.png$/i, '').slice(0, 28);
        if (cleanBase) setFrameName(cleanBase);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Solo se admiten marcos en formato .png');
    }
  }

  async function handlePublishFrame(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDraftPngUrl) {
      setError('Diseña un marco en el estudio o importa un archivo .png transparente.');
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{frame: CustomFrameItem; user: UserProfile}>('/api/frames', {
        method: 'POST',
        body: {
          name: frameName.trim(),
          category: frameCategory,
          description: frameDesc.trim(),
          priceCrystals: Number(priceCrystals),
          imageUrl: activeDraftPngUrl,
        },
      });
      setFrames((prev) => [res.frame, ...prev]);
      onUserUpdated(res.user);
      setFrameName('');
      setFrameDesc('');
      setUploadedPngUrl(null);
      setTab('store');
      setNotice(`Marco PNG "${res.frame.name}" publicado en la Tienda y equipado en tu perfil.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el marco PNG');
    } finally {
      setCreating(false);
    }
  }

  async function handleBuyFrame(frame: CustomFrameItem) {
    setBusyId(frame.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{frame: CustomFrameItem; user: UserProfile}>(
        `/api/frames/${frame.id}/buy`,
        {method: 'POST'}
      );
      setFrames((prev) => prev.map((f) => (f.id === frame.id ? res.frame : f)));
      onUserUpdated(res.user);
      setNotice(`Compraste y equipaste "${frame.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la compra');
    } finally {
      setBusyId(null);
    }
  }

  async function handleEquipFrame(frame: CustomFrameItem) {
    setBusyId(frame.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/frames/${frame.id}/equip`, {
        method: 'POST',
      });
      onUserUpdated(res.user);
      setNotice(`Equipaste "${frame.name}" en tu avatar.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo equipar el marco');
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnequipFrame() {
    setBusyId('unequip');
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>('/api/frames/unequip', {method: 'POST'});
      onUserUpdated(res.user);
      setNotice('Quitaste el marco PNG activo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el marco');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteFrame(frame: CustomFrameItem) {
    setBusyId(frame.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ok: boolean; user: UserProfile}>(`/api/frames/${frame.id}`, {
        method: 'DELETE',
      });
      setFrames((prev) => prev.filter((f) => f.id !== frame.id));
      onUserUpdated(res.user);
      setNotice(`Marco "${frame.name}" retirado de la tienda.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el marco');
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssignCrystals(
    target: UserProfile,
    mode: 'add' | 'set',
    amountOverride?: number
  ) {
    const raw =
      amountOverride !== undefined ? amountOverride : Number(crystalDrafts[target.id] ?? 25);
    if (!Number.isFinite(raw) || (mode === 'add' ? raw < 1 : raw < 0)) {
      setError(
        mode === 'set'
          ? 'Ingresa un saldo válido (0 o mayor).'
          : 'Ingresa una cantidad válida de Cristales (mín. 1).'
      );
      return;
    }
    setBusyId(target.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${target.id}/crystals`, {
        method: 'POST',
        body: {amount: raw, mode},
      });
      setStoreUsers((prev) => prev.map((item) => (item.id === target.id ? res.user : item)));
      setNotice(
        mode === 'set'
          ? `Saldo de @${target.username} fijado manualmente en ${res.user.crystals} Cristales.`
          : `Asignaste +${raw} Cristales a @${target.username}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron asignar los Cristales');
    } finally {
      setBusyId(null);
    }
  }

  async function handleQuickBadge(target: UserProfile, tier: BadgeTier) {
    setBusyId(target.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${target.id}/badge`, {
        method: 'POST',
        body: {tier},
      });
      setStoreUsers((prev) => prev.map((item) => (item.id === target.id ? res.user : item)));
      if (target.id === user.id) onUserUpdated(res.user);
      setNotice(`Verificable actualizado para @${target.username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar verificable');
    } finally {
      setBusyId(null);
    }
  }

  const filteredFrames = frames.filter((f) => {
    if (favoritesOnly && !favoriteIds.includes(f.id)) return false;
    if (categoryFilter === 'Mis Marcos') {
      const isMine = ownedIds.includes(f.id) || f.creatorId === user.id;
      if (!isMine) return false;
    } else if (categoryFilter !== 'Todos') {
      if ((f.category || 'Comunidad') !== categoryFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !f.name.toLowerCase().includes(q) &&
        !f.creatorName.toLowerCase().includes(q) &&
        !(f.category || '').toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const featuredFrame = frames[0] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="txl-card w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl max-h-[93vh] flex flex-col overflow-hidden border border-purple-400/35">
        {/* Discord-inspired Shop Top Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-purple-500/20 bg-[#130826]/95">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar tienda"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#B8A9D9] hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Store className="w-5 h-5 text-[#FF4D9D] shrink-0" />
              <h2 className="font-display text-lg font-bold text-white truncate">
                {lang === 'es' ? 'Tienda de Marcos PNG' : 'PNG Frame Shop'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              title="Solo el Dueño puede regalar Cristales"
              className="px-3 py-1.5 rounded-full bg-[#10243A] border border-cyan-400/50 text-xs font-bold text-cyan-200 flex items-center gap-1.5 font-mono-num"
            >
              <Gem className="w-3.5 h-3.5 text-cyan-300" />
              <span>{isOwner ? '∞' : user.crystals || 0}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setTab('store');
                setFavoritesOnly((prev) => !prev);
              }}
              aria-label="Filtrar favoritos"
              className={`min-w-[36px] h-9 px-2.5 rounded-full border flex items-center justify-center gap-1 text-xs cursor-pointer transition-colors ${
                favoritesOnly
                  ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                  : 'bg-[#1D1238] border-purple-400/30 text-[#D8CCF4]'
              }`}
            >
              <Heart className={`w-4 h-4 ${favoritesOnly ? 'fill-[#FF4D9D] text-[#FF4D9D]' : ''}`} />
              {favoriteIds.length > 0 && (
                <span className="font-mono-num text-[11px]">{favoriteIds.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Main Segmented Switch: Explorar Tienda / Subir & Vender PNG / Cristales Dueño */}
        <div className="px-5 pt-3.5 pb-2 flex items-center gap-2 bg-[#160B2B]/80 flex-wrap">
          <button
            type="button"
            onClick={() => setTab('store')}
            className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-2xl text-xs font-semibold min-h-[42px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              tab === 'store'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white shadow-lg shadow-pink-900/30'
                : 'bg-[#1E113A] border border-purple-400/25 text-[#CBBCEB]'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Tienda ({frames.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('create')}
            className={`flex-1 min-w-[150px] py-2.5 px-3 rounded-2xl text-xs font-semibold min-h-[42px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              tab === 'create'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white shadow-lg shadow-pink-900/30'
                : 'bg-[#1E113A] border border-purple-400/25 text-[#CBBCEB]'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Subir / Crear PNG</span>
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setTab('crystals');
                void loadStoreUsers();
              }}
              className={`flex-1 min-w-[150px] py-2.5 px-3 rounded-2xl text-xs font-semibold min-h-[42px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                tab === 'crystals'
                  ? 'bg-gradient-to-r from-cyan-500 to-[#8B5CF6] text-white shadow-lg shadow-cyan-900/30'
                  : 'bg-[#10243A] border border-cyan-400/40 text-cyan-200'
              }`}
            >
              <Gem className="w-4 h-4" />
              <span>Cristales (Dueño)</span>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-2.5 text-xs text-emerald-200">
              {notice}
            </div>
          )}

          {tab === 'store' ? (
            <>
              {/* Discord-inspired Hero Banner */}
              <div className="relative rounded-3xl overflow-hidden border border-purple-400/35 bg-gradient-to-r from-[#1A0D38] via-[#3B1261] to-[#122645] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-2 text-center sm:text-left">
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 border border-cyan-400/45 px-2.5 py-0.5 text-[10px] font-bold text-cyan-200 uppercase tracking-wider">
                    <Sparkles className="w-3 h-3" />
                    <span>Mercado de Creadores PNG</span>
                  </span>
                  <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                    {featuredFrame
                      ? `Destacado: ${featuredFrame.name}`
                      : 'Sube o diseña tus marcos PNG y véndelos por Cristales'}
                  </h3>
                  <p className="text-xs text-[#D8CCF4] max-w-md">
                    {isOwner
                      ? 'Como Dueño tienes Cristales ∞ para publicar marcos y asignar saldos manualmente a cualquier usuario.'
                      : 'Sube tus propios archivos .PNG y ponlos a la venta por Cristales (asignados por el Dueño de la app).'}
                  </p>
                  <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode('upload');
                        setTab('create');
                      }}
                      className="txl-btn-primary rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir mi PNG y vender</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode('studio');
                        setTab('create');
                      }}
                      className="rounded-full px-3.5 py-2 text-xs font-medium bg-[#170A2B]/80 border border-purple-400/35 text-[#E5DBFF] hover:border-cyan-400/60 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Paintbrush className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Diseñar aquí</span>
                    </button>
                    {user.frameImageUrl && (
                      <button
                        type="button"
                        disabled={busyId === 'unequip'}
                        onClick={handleUnequipFrame}
                        className="rounded-full px-3.5 py-2 text-xs font-medium bg-[#170A2B]/80 border border-purple-400/35 text-[#E5DBFF] hover:border-rose-400/50 cursor-pointer"
                      >
                        Quitar marco actual
                      </button>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <AvatarWithFrame
                    src={user.avatarUrl}
                    alt="Vista previa destacada"
                    frameImageUrl={featuredFrame ? featuredFrame.imageUrl : user.frameImageUrl}
                    sizeClass="w-24 h-24"
                  />
                  <span className="text-[11px] font-mono-num text-cyan-200">
                    {featuredFrame ? `◈ ${featuredFrame.priceCrystals} Cristales` : 'Formato .PNG'}
                  </span>
                </div>
              </div>

              {/* Search + Category Pills */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#A998CC] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar marcos PNG por nombre o creador..."
                    className="txl-input w-full rounded-2xl pl-10 pr-4 py-2.5 text-xs min-h-[40px]"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {STORE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        categoryFilter === cat
                          ? 'bg-[#A855F7] text-white'
                          : 'bg-[#1D1038] border border-purple-400/25 text-[#CBBCEB]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frames Showcase Grid */}
              {loading ? (
                <div className="py-12 text-center text-sm text-[#B8A9D9]">
                  Cargando tienda de marcos...
                </div>
              ) : filteredFrames.length === 0 ? (
                <div className="rounded-3xl bg-[#140A29] border border-purple-500/20 p-8 text-center space-y-3">
                  <p className="font-display text-base font-bold text-white">
                    {frames.length === 0
                      ? 'La tienda está lista para el primer marco PNG'
                      : 'No hay marcos que coincidan con tu filtro'}
                  </p>
                  <p className="text-xs text-[#B8A9D9] max-w-sm mx-auto">
                    Diseña un marco desde cero en nuestro Estudio PNG o sube cualquier imagen .png
                    con centro transparente.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('create')}
                    className="txl-btn-primary rounded-full px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    <span>Crear primer Marco PNG</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredFrames.map((f) => {
                    const isOwned = ownedIds.includes(f.id) || f.creatorId === user.id;
                    const isEquipped = user.frameImageUrl === f.imageUrl;
                    const isFav = favoriteIds.includes(f.id);
                    const canDelete = f.creatorId === user.id || user.role === 'owner';

                    return (
                      <div
                        key={f.id}
                        className="rounded-3xl bg-[#160B2D] border border-purple-500/25 hover:border-[#EC4899]/55 overflow-hidden flex flex-col transition-colors"
                      >
                        {/* Discord-style Preview Stage */}
                        <div className="relative h-40 bg-gradient-to-b from-[#26124A] to-[#120824] flex items-center justify-center p-4">
                          <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-black/45 border border-purple-400/30 text-[10px] font-semibold text-[#D8CCF4]">
                            {f.category || 'Comunidad'}
                          </span>

                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleFavorite(f.id)}
                              aria-label="Guardar favorito"
                              className="w-8 h-8 rounded-full bg-black/45 border border-white/15 flex items-center justify-center text-white hover:bg-black/65 cursor-pointer"
                            >
                              <Heart
                                className={`w-4 h-4 ${
                                  isFav ? 'fill-[#FF4D9D] text-[#FF4D9D]' : 'text-[#D8CCF4]'
                                }`}
                              />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                disabled={busyId === f.id}
                                onClick={() => handleDeleteFrame(f)}
                                aria-label="Eliminar marco"
                                className="w-8 h-8 rounded-full bg-black/45 border border-rose-400/30 flex items-center justify-center text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <AvatarWithFrame
                            src={user.avatarUrl}
                            alt={f.name}
                            frameImageUrl={f.imageUrl}
                            sizeClass="w-24 h-24"
                          />
                        </div>

                        {/* Metadata & Actions */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                          <div>
                            <h3 className="font-display text-sm font-bold text-white truncate">
                              {f.name}
                            </h3>
                            <div className="flex items-center gap-1 text-[11px] text-[#B8A9D9] mt-0.5">
                              <span className="truncate">Por {f.creatorName}</span>
                              <VerificationBadge tier={f.creatorBadgeTier} size={13} />
                            </div>
                            {f.description && (
                              <p className="text-[11px] text-[#9E8CC4] mt-1 line-clamp-2">
                                {f.description}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between text-xs font-mono-num">
                              <span className="inline-flex items-center gap-1 text-cyan-300 font-bold">
                                <Gem className="w-3.5 h-3.5" />
                                {f.priceCrystals.toLocaleString()} Cristales
                              </span>
                              <span className="text-[11px] text-[#8E7CB5]">
                                {f.salesCount} ventas
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isOwned ? (
                              <button
                                type="button"
                                disabled={busyId === f.id}
                                onClick={() =>
                                  isEquipped ? handleUnequipFrame() : handleEquipFrame(f)
                                }
                                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold min-h-[38px] flex items-center justify-center gap-1.5 cursor-pointer ${
                                  isEquipped
                                    ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-200'
                                    : 'bg-[#251544] border border-purple-400/35 text-white hover:bg-[#311C59]'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isEquipped ? 'Equipado' : 'Equipar'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === f.id}
                                onClick={() => handleBuyFrame(f)}
                                className="txl-btn-primary flex-1 py-2 px-3 rounded-xl text-xs font-semibold min-h-[38px] flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Gem className="w-3.5 h-3.5" />
                                <span>
                                  {busyId === f.id
                                    ? 'Procesando...'
                                    : `Comprar (${f.priceCrystals})`}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => downloadPngDataUrl(f.imageUrl, f.name)}
                              title="Descargar archivo .PNG"
                              aria-label={`Descargar ${f.name} en PNG`}
                              className="w-9 h-[38px] rounded-xl bg-[#1D1238] border border-purple-400/30 hover:border-cyan-400/60 text-cyan-200 flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : tab === 'create' ? (
            /* ——— CREATE & PUBLISH PNG STUDIO ——— */
            <form onSubmit={handlePublishFrame} className="space-y-4">
              {!isOwner && (user.crystals || 0) < creationCost && (
                <div className="rounded-2xl bg-cyan-500/10 border border-cyan-400/35 px-4 py-3 text-xs text-cyan-100 flex items-center gap-2.5">
                  <Gem className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span>
                    Tu saldo actual es <strong>{user.crystals || 0} Cristales</strong> (publicar un
                    marco cuesta <strong>{creationCost} Cristales</strong>). Solo el Dueño de la
                    app puede asignar o regalar Cristales.
                  </span>
                </div>
              )}

              {/* Studio vs Upload mode switch */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCreateMode('upload')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                    createMode === 'upload'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100'
                      : 'bg-[#140A29] border-purple-400/25 text-[#B8A9D9]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir archivo .PNG propio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode('studio')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                    createMode === 'studio'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100'
                      : 'bg-[#140A29] border-purple-400/25 text-[#B8A9D9]'
                  }`}
                >
                  <Paintbrush className="w-3.5 h-3.5" />
                  <span>Diseñar Marco PNG aquí</span>
                </button>
              </div>

              {/* Live Avatar Preview Card + Creation Cost */}
              <div className="rounded-3xl bg-[#140A29] border border-cyan-400/35 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <AvatarWithFrame
                    src={user.avatarUrl}
                    alt="Vista previa de marco PNG"
                    frameImageUrl={activeDraftPngUrl || null}
                    sizeClass="w-24 h-24"
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">Vista previa en tiempo real</p>
                    <p className="text-[11px] text-cyan-200 font-mono-num">
                      Publicar cuesta:{' '}
                      <strong>{isOwner ? 'Gratis (∞ Dueño)' : `${creationCost} Cristales`}</strong>
                    </p>
                    <p className="text-[11px] text-[#B8A9D9]">
                      Cada venta suma el 100% de Cristales al creador.
                    </p>
                  </div>
                </div>

                {activeDraftPngUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadPngDataUrl(activeDraftPngUrl, frameName || 'mi-marco-txl')
                    }
                    className="rounded-full px-4 py-2 text-xs font-semibold bg-[#1E123B] border border-cyan-400/45 text-cyan-200 hover:bg-cyan-500/15 flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar .PNG</span>
                  </button>
                )}
              </div>

              {createMode === 'studio' ? (
                <div className="rounded-2xl bg-[#140A29]/85 border border-purple-500/25 p-4 space-y-3.5">
                  <div>
                    <p className="text-xs font-medium text-[#C4B5FD] mb-2">Estilo del marco</p>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {STUDIO_STYLES.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setStudioStyle(st.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                            studioStyle === st.id
                              ? 'bg-[#EC4899] text-white'
                              : 'bg-[#1D1038] border border-purple-400/25 text-[#D8CCF4]'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-[#C4B5FD] mb-2">Paleta y colores</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setPrimaryColor(preset.primary);
                            setSecondaryColor(preset.secondary);
                          }}
                          className="px-2.5 py-1.5 rounded-full bg-[#1D1038] border border-purple-400/25 text-[11px] text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{
                              background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                            }}
                          />
                          <span>{preset.name}</span>
                        </button>
                      ))}
                      <label className="flex items-center gap-1 text-[11px] text-[#C4B5FD] ml-auto">
                        <span>Color 1</span>
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-[#C4B5FD]">
                        <span>Color 2</span>
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#C4B5FD] mb-1">
                        Grosor del marco ({thickness}px)
                      </label>
                      <input
                        type="range"
                        min={18}
                        max={48}
                        value={thickness}
                        onChange={(e) => setThickness(Number(e.target.value))}
                        className="w-full accent-[#EC4899]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#C4B5FD] mb-1">
                        Intensidad de brillo ({glow}px)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={32}
                        value={glow}
                        onChange={(e) => setGlow(Number(e.target.value))}
                        className="w-full accent-[#8B5CF6]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-[#C4B5FD] mb-1.5">Emblema inferior</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {EMBLEMS.map((em) => (
                          <button
                            key={em || 'none'}
                            type="button"
                            onClick={() => setEmblem(em)}
                            className={`w-9 h-9 rounded-xl border text-base flex items-center justify-center cursor-pointer ${
                              emblem === em
                                ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                                : 'bg-[#1D1038] border-purple-400/25 text-[#B8A9D9]'
                            }`}
                          >
                            {em || '—'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#C4B5FD] mb-1.5">
                        Etiqueta superior opcional
                      </label>
                      <input
                        type="text"
                        value={labelTop}
                        onChange={(e) => setLabelTop(e.target.value)}
                        maxLength={14}
                        placeholder="Ej. VIP, SAIYAJIN, PRO"
                        className="txl-input w-full rounded-xl px-3.5 py-2 text-xs min-h-[38px]"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    ref={pngInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handlePickPng}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => pngInputRef.current?.click()}
                    className="w-full py-5 px-4 rounded-2xl border border-dashed border-cyan-400/55 bg-cyan-500/10 hover:bg-cyan-500/15 text-xs font-semibold text-cyan-200 flex flex-col items-center justify-center gap-2 cursor-pointer"
                  >
                    <ImagePlus className="w-6 h-6" />
                    <span>
                      {uploadedPngUrl
                        ? 'Archivo .PNG transparente cargado ✓ (toca para cambiar)'
                        : 'Seleccionar archivo de marco (.png con centro transparente)'}
                    </span>
                  </button>
                </div>
              )}

              {/* Metadata & Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#B8A9D9] mb-1">Nombre del marco</label>
                  <input
                    type="text"
                    value={frameName}
                    onChange={(e) => setFrameName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={36}
                    placeholder="Ej. Nube Dragón PNG"
                    className="txl-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#B8A9D9] mb-1">Categoría</label>
                  <select
                    value={frameCategory}
                    onChange={(e) => setFrameCategory(e.target.value)}
                    className="txl-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="Anime">Anime</option>
                    <option value="Gaming">Gaming</option>
                    <option value="Neón">Neón</option>
                    <option value="Fantasía">Fantasía</option>
                    <option value="Comunidad">Comunidad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#B8A9D9] mb-1">
                    Precio de venta (Cristales)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    value={priceCrystals}
                    onChange={(e) => setPriceCrystals(e.target.value)}
                    required
                    className="txl-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px] font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#B8A9D9] mb-1">
                  Descripción corta (opcional)
                </label>
                <input
                  type="text"
                  value={frameDesc}
                  onChange={(e) => setFrameDesc(e.target.value)}
                  maxLength={140}
                  placeholder="Ej. Marco PNG edición especial transparente listo para tu avatar"
                  className="txl-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[42px]"
                />
              </div>

              <button
                type="submit"
                disabled={creating || !activeDraftPngUrl || !frameName.trim()}
                className="txl-btn-primary w-full rounded-full py-3.5 text-sm font-semibold min-h-[48px] disabled:opacity-50 cursor-pointer"
              >
                {creating
                  ? 'Publicando marco PNG...'
                  : isOwner
                    ? 'Publicar Marco PNG en Tienda'
                    : `Publicar Marco PNG (${creationCost} Cristales)`}
              </button>
            </form>
          ) : (
            /* ——— OWNER CRYSTAL BALANCE ASSIGNMENT & VERIFICABLES TAB ——— */
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-r from-[#10243A] to-[#1D1038] border border-cyan-400/35 p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Gem className="w-4 h-4 text-cyan-300" />
                  <span>Asignación Manual de Cristales y Verificables (Solo Dueño)</span>
                </div>
                <p className="text-xs text-cyan-100/80">
                  Ningún usuario tiene Cristales a menos que tú los asignes. Puedes{' '}
                  <strong>Sumar (+)</strong> o <strong>Fijar saldo exacto (=)</strong> y añadir sus
                  insignias verificables al instante.
                </p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-[#A998CC] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar usuario por nombre o correo..."
                  className="txl-input w-full rounded-2xl pl-10 pr-4 py-2.5 text-xs min-h-[42px]"
                />
              </div>

              {usersLoading ? (
                <div className="py-10 text-center text-xs text-[#B8A9D9]">
                  Cargando lista de usuarios...
                </div>
              ) : (
                <div className="space-y-3">
                  {storeUsers
                    .filter((u) => {
                      const q = userSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        u.username.toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q)
                      );
                    })
                    .map((u) => {
                      const isOwnerRow = u.role === 'owner';
                      const draftVal = crystalDrafts[u.id] ?? String(u.crystals || 25);
                      return (
                        <div
                          key={u.id}
                          className="rounded-2xl bg-[#140A29] border border-purple-500/25 p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <AvatarWithFrame
                                src={u.avatarUrl}
                                alt={u.username}
                                frame={u.frame}
                                frameImageUrl={u.frameImageUrl}
                                sizeClass="w-10 h-10"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold text-white truncate">
                                    {u.username}
                                  </span>
                                  <VerificationBadge
                                    tier={u.badgeTier}
                                    verified={u.verified}
                                    size={15}
                                  />
                                </div>
                                <p className="text-[11px] text-[#9E8CC4] truncate">
                                  {u.email || 'Cuenta privada'}
                                </p>
                              </div>
                            </div>

                            <div className="px-3 py-1 rounded-full bg-[#10243A] border border-cyan-400/40 text-xs font-bold text-cyan-200 font-mono-num flex items-center gap-1">
                              <Gem className="w-3.5 h-3.5 text-cyan-300" />
                              <span>{isOwnerRow ? '∞ (Dueño)' : `${u.crystals || 0} Cristales`}</span>
                            </div>
                          </div>

                          {!isOwnerRow && (
                            <>
                              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-purple-500/15">
                                <input
                                  type="number"
                                  min={0}
                                  max={1000000}
                                  value={draftVal}
                                  onChange={(e) =>
                                    setCrystalDrafts((prev) => ({
                                      ...prev,
                                      [u.id]: e.target.value,
                                    }))
                                  }
                                  aria-label={`Cantidad de Cristales para ${u.username}`}
                                  className="txl-input w-24 rounded-xl px-2.5 py-1.5 text-xs font-mono-num min-h-[34px]"
                                />
                                <button
                                  type="button"
                                  disabled={busyId === u.id}
                                  onClick={() => handleAssignCrystals(u, 'add')}
                                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/20 border border-cyan-400/50 text-cyan-100 hover:bg-cyan-500/30 min-h-[34px] cursor-pointer"
                                >
                                  + Sumar
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === u.id}
                                  onClick={() => handleAssignCrystals(u, 'set')}
                                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#251544] border border-purple-400/45 text-white hover:bg-[#331E5C] min-h-[34px] cursor-pointer"
                                >
                                  = Fijar saldo
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === u.id}
                                  onClick={() => handleAssignCrystals(u, 'add', 25)}
                                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-[#1B1033] border border-purple-400/25 text-[#D8CCF4] cursor-pointer"
                                >
                                  +25
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === u.id}
                                  onClick={() => handleAssignCrystals(u, 'add', 100)}
                                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-[#1B1033] border border-purple-400/25 text-[#D8CCF4] cursor-pointer"
                                >
                                  +100
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-[#B8A9D9] flex items-center gap-1 mr-1">
                                  <BadgeCheck className="w-3.5 h-3.5 text-[#FF4D9D]" />
                                  Verificable:
                                </span>
                                {(
                                  [
                                    {tier: 'owner', label: '⚫ Negra'},
                                    {tier: 'moderator', label: '🔵 Azul'},
                                    {tier: 'influencer', label: '🔴 Roja'},
                                    {tier: 'none', label: 'Quitar'},
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.tier}
                                    type="button"
                                    disabled={busyId === u.id}
                                    onClick={() => handleQuickBadge(u, opt.tier)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors ${
                                      (u.badgeTier || 'none') === opt.tier
                                        ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                                        : 'bg-[#1A0D35] border-purple-400/25 text-[#CBBCEB] hover:border-purple-400/50'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
