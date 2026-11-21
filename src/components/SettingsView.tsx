import {useState} from 'react';
import {
  Ban,
  Bell,
  Globe,
  HelpCircle,
  KeyRound,
  Languages,
  Lock,
  LogOut,
  Palette,
  ShieldCheck,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import {apiRequest, setSessionToken} from '../lib/api.ts';
import type {AppearanceMode, BadgeTier, LanguageCode, UserProfile, UserSettings} from '../types.ts';
import {SafeImage, VerificationBadge} from './TxlLogo.tsx';

interface BlockedUserSummary {
  id: string;
  username: string;
  avatarUrl: string;
  badgeTier: BadgeTier;
  verified: boolean;
}

export function SettingsView({
  user,
  onUserUpdated,
  onOpenOwnerPanel,
  onOpenShareModal,
  onLogout,
}: {
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onOpenOwnerPanel: () => void;
  onOpenShareModal: () => void;
  onLogout: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedList, setBlockedList] = useState<BlockedUserSummary[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const settings: UserSettings = user.settings || {
    webBrowser: false,
    privacyVisible: true,
    notificationsEnabled: true,
    appearance: 'neon',
    language: 'es',
  };

  const lang: LanguageCode = settings.language;

  async function updateSettings(patch: Partial<UserSettings>) {
    const res = await apiRequest<{user: UserProfile}>('/api/users/me', {
      method: 'PATCH',
      body: {settings: {...settings, ...patch}},
    });
    onUserUpdated(res.user);
  }

  function cycleAppearance() {
    const order: AppearanceMode[] = ['neon', 'deep-purple', 'midnight'];
    const idx = order.indexOf(settings.appearance);
    const next = order[(idx + 1) % order.length];
    void updateSettings({appearance: next});
  }

  function appearanceLabel(mode: AppearanceMode) {
    if (mode === 'deep-purple') return lang === 'es' ? 'Morado profundo' : 'Deep purple';
    if (mode === 'midnight') return lang === 'es' ? 'Medianoche' : 'Midnight';
    return lang === 'es' ? 'Neón intenso' : 'Intense neon';
  }

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAccountError(null);
    setAccountNotice(null);
    try {
      const res = await apiRequest<{user: UserProfile}>('/api/users/me', {
        method: 'PATCH',
        body: {username: newUsername.trim()},
      });
      onUserUpdated(res.user);
      setAccountNotice('Nombre de usuario actualizado.');
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setAccountError(null);
    setAccountNotice(null);
    if (newPassword !== confirmPassword) {
      setAccountError('Las nuevas contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest<{token: string; user: UserProfile}>('/api/auth/change-password', {
        method: 'POST',
        body: {currentPassword, newPassword},
      });
      setSessionToken(res.token);
      onUserUpdated(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setAccountNotice(
        'Contraseña actualizada. Se cerraron automáticamente las sesiones en otros dispositivos.'
      );
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Error al cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevokeOtherSessions() {
    setSaving(true);
    setAccountError(null);
    setAccountNotice(null);
    try {
      const res = await apiRequest<{token: string; user: UserProfile}>(
        '/api/auth/revoke-other-sessions',
        {method: 'POST'}
      );
      setSessionToken(res.token);
      onUserUpdated(res.user);
      setAccountNotice('Se cerraron todas tus sesiones activas en otros dispositivos.');
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'No se pudieron cerrar otras sesiones');
    } finally {
      setSaving(false);
    }
  }

  async function openBlockedModal() {
    setBlockedOpen(true);
    setLoadingBlocked(true);
    try {
      const res = await apiRequest<{blocked: BlockedUserSummary[]}>('/api/users/me/blocked');
      setBlockedList(res.blocked);
    } finally {
      setLoadingBlocked(false);
    }
  }

  async function handleUnblock(targetId: string) {
    setUnblockingId(targetId);
    try {
      const res = await apiRequest<{user: UserProfile}>(`/api/users/${targetId}/block`, {
        method: 'DELETE',
      });
      onUserUpdated(res.user);
      setBlockedList((prev) => prev.filter((u) => u.id !== targetId));
    } finally {
      setUnblockingId(null);
    }
  }

  const blockedCount = user.blockedUsers?.length || 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          {lang === 'es' ? 'Configuración' : 'Settings'}
        </h1>
        <p className="text-sm text-[#B8A9D9] mt-1">
          {lang === 'es'
            ? 'Seguridad de sesión, bloqueos, privacidad y personalización de TXLsocial'
            : 'Session security, blocks, privacy, and TXLsocial customization'}
        </p>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        <button
          type="button"
          onClick={() => void updateSettings({webBrowser: !settings.webBrowser})}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center">
            <Globe className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Navegador Web' : 'Web Browser'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {settings.webBrowser
                ? lang === 'es'
                  ? 'Activado'
                  : 'Enabled'
                : lang === 'es'
                  ? 'Apagado'
                  : 'Off'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setNewUsername(user.username);
            setAccountError(null);
            setAccountNotice(null);
            setAccountOpen(true);
          }}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center">
            <User className="w-5 h-5 text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Cuenta y Seguridad' : 'Account & Security'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5 truncate">{user.email || user.username}</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void updateSettings({privacyVisible: !settings.privacyVisible})}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/25 flex items-center justify-center">
            <Lock className="w-5 h-5 text-[#C084FC]" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Privacidad' : 'Privacy'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {settings.privacyVisible
                ? lang === 'es'
                  ? 'Visible en salas'
                  : 'Visible in rooms'
                : lang === 'es'
                  ? 'Modo discreto'
                  : 'Stealth mode'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={openBlockedModal}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-rose-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-400/25 flex items-center justify-center">
            <Ban className="w-5 h-5 text-rose-300" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Usuarios bloqueados' : 'Blocked users'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5 font-mono-num">
              {blockedCount} {blockedCount === 1 ? 'bloqueado' : 'bloqueados'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            void updateSettings({notificationsEnabled: !settings.notificationsEnabled})
          }
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-400/25 flex items-center justify-center">
            <Bell className="w-5 h-5 text-[#FF4D9D]" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Notificaciones' : 'Notifications'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {settings.notificationsEnabled
                ? lang === 'es'
                  ? 'Activadas'
                  : 'Enabled'
                : lang === 'es'
                  ? 'Silenciadas'
                  : 'Muted'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={cycleAppearance}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/25 flex items-center justify-center">
            <Palette className="w-5 h-5 text-[#C084FC]" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Apariencia' : 'Appearance'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {appearanceLabel(settings.appearance)}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void updateSettings({language: lang === 'es' ? 'en' : 'es'})}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center">
            <Languages className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Idioma' : 'Language'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {lang === 'es' ? 'Español (ES)' : 'English (EN)'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-purple-400/50 transition-colors cursor-pointer space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-400/25 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-[#FF4D9D]" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'Ayuda y soporte' : 'Help & Support'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {lang === 'es' ? 'Guía TXLsocial' : 'TXLsocial guide'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenShareModal}
          className="col-span-2 txl-card rounded-3xl p-4 sm:p-5 text-left hover:border-[#FF4D9D]/50 transition-colors cursor-pointer flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">
              {lang === 'es' ? 'App Móvil y Compartir' : 'Mobile App & Share'}
            </div>
            <div className="text-xs text-[#A998CC] mt-0.5">
              {lang === 'es' ? 'Android, iPhone y redes sociales' : 'Android, iPhone & social links'}
            </div>
          </div>
        </button>
      </div>

      {/* Bottom Action Buttons */}
      <div className="space-y-3 pt-2">
        {(user.role === 'owner' || user.role === 'moderator') && (
          <button
            type="button"
            onClick={onOpenOwnerPanel}
            className="w-full rounded-full py-3.5 px-6 text-sm font-semibold border border-[#FF4D9D]/70 bg-[#170A2B] text-white hover:bg-[#FF4D9D]/15 min-h-[48px] cursor-pointer"
          >
            {user.role === 'owner'
              ? 'Panel del Dueño (Verificados, Saldos y Baneos)'
              : 'Panel de Moderación (Banear cuentas)'}
          </button>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="txl-btn-primary w-full rounded-full py-3.5 px-6 text-sm font-semibold min-h-[48px] cursor-pointer flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>{lang === 'es' ? 'Cerrar sesión' : 'Log out'}</span>
        </button>
      </div>

      {/* Account & Security Modal (Password Change + Multi-Device Invalidation) */}
      {accountOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Cuenta y Seguridad</h2>
              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/30 p-3.5 text-xs text-emerald-100 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>Sesión cifrada activa solo en este dispositivo</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                Tu sesión se guarda con un token seguro HttpOnly sin almacenar nunca tu contraseña en
                texto plano. Al cambiar tu contraseña, se cierran automáticamente las sesiones en los
                demás dispositivos.
              </p>
            </div>

            <div className="text-xs text-[#B8A9D9]">
              Correo privado: <span className="text-white">{user.email}</span>
            </div>

            {accountError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-xs text-rose-200">
                {accountError}
              </div>
            )}
            {accountNotice && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-2.5 text-xs text-emerald-200">
                {accountNotice}
              </div>
            )}

            <form onSubmit={handleSaveUsername} className="space-y-2.5">
              <label className="block text-xs text-[#B8A9D9]">Nombre de usuario</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                maxLength={24}
                className="txl-input w-full rounded-xl px-4 py-2.5 text-sm min-h-[44px]"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full py-2.5 text-xs font-semibold bg-[#251544] border border-purple-400/45 text-white hover:bg-[#311C59] min-h-[40px] cursor-pointer"
              >
                Actualizar nombre de usuario
              </button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="space-y-2.5 pt-3 border-t border-purple-500/20"
            >
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#FF4D9D]" />
                <span>Cambiar contraseña</span>
              </div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Contraseña actual"
                required
                className="txl-input w-full rounded-xl px-4 py-2.5 text-sm min-h-[42px]"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña (mín. 6 caracteres)"
                required
                minLength={6}
                className="txl-input w-full rounded-xl px-4 py-2.5 text-sm min-h-[42px]"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar nueva contraseña"
                required
                minLength={6}
                className="txl-input w-full rounded-xl px-4 py-2.5 text-sm min-h-[42px]"
              />
              <button
                type="submit"
                disabled={saving}
                className="txl-btn-primary w-full rounded-full py-2.5 text-xs font-semibold min-h-[42px] cursor-pointer"
              >
                {saving ? 'Guardando...' : 'Cambiar contraseña y cerrar otros dispositivos'}
              </button>
            </form>

            <div className="pt-2 border-t border-purple-500/20">
              <button
                type="button"
                disabled={saving}
                onClick={handleRevokeOtherSessions}
                className="w-full rounded-full py-2.5 px-4 text-xs font-medium bg-amber-500/15 border border-amber-400/35 text-amber-200 hover:bg-amber-500/25 cursor-pointer"
              >
                Cerrar sesión en todos los demás dispositivos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Users Modal */}
      {blockedOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Usuarios bloqueados</h2>
                <p className="text-xs text-[#B8A9D9]">
                  No ves su perfil, posts ni comentarios. Puedes desbloquearlos aquí.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBlockedOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5">
              {loadingBlocked ? (
                <p className="text-xs text-[#B8A9D9] text-center py-8">Cargando...</p>
              ) : blockedList.length === 0 ? (
                <div className="rounded-2xl bg-[#130926]/80 border border-purple-500/20 p-6 text-center text-xs text-[#B8A9D9]">
                  No tienes usuarios bloqueados en este momento.
                </div>
              ) : (
                blockedList.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-2xl bg-[#130926]/85 border border-purple-500/20 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SafeImage
                        src={b.avatarUrl}
                        alt={b.username}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-semibold text-white truncate">
                          {b.username}
                        </span>
                        <VerificationBadge tier={b.badgeTier} verified={b.verified} size={14} />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={unblockingId === b.id}
                      onClick={() => handleUnblock(b.id)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 cursor-pointer shrink-0"
                    >
                      Desbloquear
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Guía TXLsocial</h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-2.5 text-sm text-[#D8CCF4] leading-relaxed">
              <li>• Tu sesión permanece abierta en este dispositivo hasta que pulses Cerrar sesión.</li>
              <li>• Personaliza tu perfil con portada, tema neón, marcos PNG y privacidad.</li>
              <li>• Los administradores pueden subir fondos personalizados (1920 × 1080) para sus salas.</li>
              <li>• Puedes bloquear usuarios en silencio desde su perfil y desbloquearlos en Ajustes.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
