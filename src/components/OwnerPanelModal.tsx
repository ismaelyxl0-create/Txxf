import {useEffect, useState} from 'react';
import {BadgeCheck, Ban, Coins, Gem, Search, ShieldAlert, X} from 'lucide-react';
import {apiRequest} from '../lib/api.ts';
import type {BadgeTier, UserProfile} from '../types.ts';
import {AvatarWithFrame, VerificationBadge} from './TxlLogo.tsx';

export function OwnerPanelModal({
  open,
  onClose,
  currentUser,
  onUserUpdated,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [crystalDrafts, setCrystalDrafts] = useState<Record<string, string>>({});
  const [coinDrafts, setCoinDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    apiRequest<{users: UserProfile[]}>('/api/users')
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando usuarios'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(query.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(query.toLowerCase())
  );

  async function handleAssignBadge(targetId: string, tier: BadgeTier) {
    setBusyId(targetId);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${targetId}/badge`, {
        method: 'POST',
        body: {tier},
      });
      setUsers((prev) => prev.map((u) => (u.id === targetId ? res.user : u)));
      if (targetId === currentUser.id) onUserUpdated(res.user);
      setNotice(`Insignia actualizada para @${res.user.username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar insignia');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGrantCrystals(
    u: UserProfile,
    mode: 'add' | 'set' = 'add',
    amountOverride?: number
  ) {
    const raw =
      amountOverride !== undefined ? amountOverride : Number(crystalDrafts[u.id] ?? 25);
    if (!Number.isFinite(raw) || (mode === 'add' ? raw < 1 : raw < 0)) {
      setError(
        mode === 'set'
          ? 'Ingresa un saldo válido (0 o mayor).'
          : 'Ingresa una cantidad válida de Cristales (mín. 1).'
      );
      return;
    }
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${u.id}/crystals`, {
        method: 'POST',
        body: {amount: raw, mode},
      });
      setUsers((prev) => prev.map((item) => (item.id === u.id ? res.user : item)));
      setNotice(
        mode === 'set'
          ? `Saldo de @${u.username} fijado manualmente en ${res.user.crystals} Cristales.`
          : `Asignaste +${raw} Cristales a @${u.username}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar Cristales');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGrantCoins(
    u: UserProfile,
    mode: 'add' | 'set' = 'add',
    amountOverride?: number
  ) {
    const raw =
      amountOverride !== undefined ? amountOverride : Number(coinDrafts[u.id] ?? 500);
    if (!Number.isFinite(raw) || (mode === 'add' ? raw < 1 : raw < 0)) {
      setError(
        mode === 'set'
          ? 'Ingresa un saldo válido de Monedas (0 o mayor).'
          : 'Ingresa una cantidad válida de Monedas (mín. 1).'
      );
      return;
    }
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${u.id}/coins`, {
        method: 'POST',
        body: {amount: raw, mode},
      });
      setUsers((prev) => prev.map((item) => (item.id === u.id ? res.user : item)));
      setNotice(
        mode === 'set'
          ? `Saldo de @${u.username} fijado en ${res.user.coins.toLocaleString()} Monedas.`
          : `Regalaste +${raw.toLocaleString()} Monedas a @${u.username}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar Monedas');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleBan(targetId: string) {
    setBusyId(targetId);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${targetId}/ban`, {
        method: 'POST',
      });
      setUsers((prev) => prev.map((u) => (u.id === targetId ? res.user : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar baneo');
    } finally {
      setBusyId(null);
    }
  }

  const isOwnerViewer = currentUser.role === 'owner';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="txl-card w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[#FF4D9D]" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                {isOwnerViewer
                  ? 'Panel del Dueño: Monedas, Cristales, Verificables y Baneos'
                  : 'Panel de Moderación: Baneos de Cuentas'}
              </h2>
              <p className="text-xs text-[#B8A9D9]">
                {isOwnerViewer
                  ? 'Dueño: Monedas ∞ · Cristales ∞ · Da cualquier cantidad de monedas o cristales por usuario'
                  : 'Los moderadores pueden suspender cuentas de miembros que incumplan las normas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="relative">
            <Search className="w-4 h-4 text-[#A78BFA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario o correo..."
              className="txl-input w-full rounded-xl pl-10 pr-4 py-2.5 text-sm min-h-[44px]"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-2.5 text-sm text-emerald-200">
              {notice}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-[#B8A9D9]">Cargando usuarios...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#B8A9D9]">
              No hay usuarios que coincidan con tu búsqueda.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((u) => {
                const isOwnerRow = u.role === 'owner';
                return (
                  <div
                    key={u.id}
                    className="rounded-2xl bg-[#130926]/85 border border-purple-500/20 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <AvatarWithFrame
                          src={u.avatarUrl}
                          alt={u.username}
                          frame={u.frame}
                          frameImageUrl={u.frameImageUrl}
                          sizeClass="w-11 h-11"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-white truncate">{u.username}</span>
                            <VerificationBadge tier={u.badgeTier} verified={u.verified} size={16} />
                            <span className="text-xs text-[#A998CC]">
                              ·{' '}
                              {isOwnerRow
                                ? 'Dueño'
                                : u.badgeTier === 'moderator' || u.role === 'moderator'
                                  ? 'Moderador'
                                  : u.badgeTier === 'influencer'
                                    ? 'Influencer'
                                    : 'Miembro'}
                            </span>
                          </div>
                          <p className="text-xs text-[#8E7CB5] truncate">
                            {u.email || 'Cuenta privada'} ·{' '}
                            <span className="text-amber-300 font-mono-num">
                              {isOwnerRow ? 'Monedas ∞' : `${u.coins.toLocaleString()} Monedas`}
                            </span>{' '}
                            ·{' '}
                            <span className="text-cyan-300 font-mono-num">
                              {isOwnerRow ? 'Cristales ∞' : `${u.crystals || 0} Cristales`}
                            </span>
                            {u.banned ? ' · Suspendida' : ''}
                          </p>
                        </div>
                      </div>

                      {isOwnerRow ? (
                        <span className="text-xs font-medium text-[#C4B5FD]">
                          Insignia Negra fija · Protegida
                        </span>
                      ) : (isOwnerViewer || u.role === 'member') && u.id !== currentUser.id ? (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => handleToggleBan(u.id)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium min-h-[38px] flex items-center gap-1.5 cursor-pointer self-start sm:self-center ${
                            u.banned
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                              : 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25'
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{u.banned ? 'Desbanear' : 'Banear'}</span>
                        </button>
                      ) : null}
                    </div>

                    {isOwnerViewer && !isOwnerRow && (
                      <div className="space-y-2.5 pt-2 border-t border-purple-500/15">
                        {/* Verificables manual buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-[#E5DBFF] flex items-center gap-1 mr-1 font-medium">
                            <BadgeCheck className="w-3.5 h-3.5 text-[#FF4D9D]" />
                            Añadir verificable:
                          </span>
                          {(
                            [
                              {tier: 'owner', label: '⚫ Negra (Dueño)'},
                              {tier: 'moderator', label: '🔵 Azul (Mod)'},
                              {tier: 'influencer', label: '🔴 Roja (Influencer)'},
                              {tier: 'none', label: 'Quitar'},
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.tier}
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() => handleAssignBadge(u.id, opt.tier)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                                (u.badgeTier || 'none') === opt.tier
                                  ? 'bg-[#EC4899]/25 border-[#EC4899] text-white'
                                  : 'bg-[#1D1038] border-purple-400/25 text-[#D8CCF4] hover:border-purple-400/55'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {/* Manual Crystal balance controls */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-cyan-200 flex items-center gap-1">
                            <Gem className="w-3.5 h-3.5 text-cyan-300" />
                            Saldo de Cristales:
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={1000000}
                            value={crystalDrafts[u.id] ?? String(u.crystals || 25)}
                            onChange={(e) =>
                              setCrystalDrafts((prev) => ({...prev, [u.id]: e.target.value}))
                            }
                            aria-label={`Cristales para ${u.username}`}
                            className="txl-input w-24 rounded-xl px-2.5 py-1.5 text-xs font-mono-num min-h-[34px]"
                          />
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCrystals(u, 'add')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 hover:bg-cyan-500/30 min-h-[34px] cursor-pointer"
                          >
                            + Sumar
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCrystals(u, 'set')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#251544] border border-purple-400/45 text-white hover:bg-[#331E5C] min-h-[34px] cursor-pointer"
                          >
                            = Fijar saldo
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCrystals(u, 'add', 25)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#1E103A] border border-purple-400/30 text-[#D8CCF4] hover:bg-purple-500/20 min-h-[34px] cursor-pointer"
                          >
                            +25
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCrystals(u, 'add', 100)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#1E103A] border border-purple-400/30 text-[#D8CCF4] hover:bg-purple-500/20 min-h-[34px] cursor-pointer"
                          >
                            +100
                          </button>
                        </div>

                        {/* Manual Coin balance controls */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-amber-200 flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-amber-300" />
                            Saldo de Monedas:
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={10000000}
                            value={coinDrafts[u.id] ?? String(u.coins || 500)}
                            onChange={(e) =>
                              setCoinDrafts((prev) => ({...prev, [u.id]: e.target.value}))
                            }
                            aria-label={`Monedas para ${u.username}`}
                            className="txl-input w-28 rounded-xl px-2.5 py-1.5 text-xs font-mono-num min-h-[34px]"
                          />
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCoins(u, 'add')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 border border-amber-400/50 text-amber-100 hover:bg-amber-500/30 min-h-[34px] cursor-pointer"
                          >
                            + Dar monedas
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCoins(u, 'set')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#251544] border border-purple-400/45 text-white hover:bg-[#331E5C] min-h-[34px] cursor-pointer"
                          >
                            = Fijar monedas
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCoins(u, 'add', 500)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#1E103A] border border-purple-400/30 text-[#D8CCF4] hover:bg-purple-500/20 min-h-[34px] cursor-pointer"
                          >
                            +500
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCoins(u, 'add', 5000)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#1E103A] border border-purple-400/30 text-[#D8CCF4] hover:bg-purple-500/20 min-h-[34px] cursor-pointer"
                          >
                            +5,000
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleGrantCoins(u, 'add', 50000)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#1E103A] border border-purple-400/30 text-[#D8CCF4] hover:bg-purple-500/20 min-h-[34px] cursor-pointer"
                          >
                            +50,000
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
