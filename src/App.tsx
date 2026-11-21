import {useEffect, useState} from 'react';
import {
  BadgeCheck,
  Bell,
  Coins,
  Compass,
  Layers,
  Settings,
  Share2,
  Sparkles,
  Store,
  User,
} from 'lucide-react';
import {AlertsView} from './components/AlertsView.tsx';
import {AuthScreen} from './components/AuthScreen.tsx';
import {BottleView} from './components/BottleView.tsx';
import {CirclesView} from './components/CirclesView.tsx';
import {FrameStoreModal} from './components/FrameStoreModal.tsx';
import {OwnerPanelModal} from './components/OwnerPanelModal.tsx';
import {PostsView} from './components/PostsView.tsx';
import {ProfileView} from './components/ProfileView.tsx';
import {SettingsView} from './components/SettingsView.tsx';
import {OfflineIndicator, ShareAndInstallModal} from './components/ShareAndInstallModal.tsx';
import {AvatarWithFrame, TxlLogo, VerificationBadge} from './components/TxlLogo.tsx';
import {apiRequest, setSessionToken} from './lib/api.ts';
import type {AlertItem, AppTab, LanguageCode, UserProfile} from './types.ts';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('circles');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [totalVoiceCount, setTotalVoiceCount] = useState(0);
  const [totalPostsCount, setTotalPostsCount] = useState(0);
  const [ownerPanelOpen, setOwnerPanelOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [frameStoreOpen, setFrameStoreOpen] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('room');
  });

  const lang: LanguageCode = user?.settings?.language || 'es';

  useEffect(() => {
    const mode = user?.settings?.appearance || 'neon';
    document.documentElement.setAttribute('data-appearance', mode);
  }, [user?.settings?.appearance]);

  async function refreshAlerts() {
    try {
      const res = await apiRequest<{alerts: AlertItem[]; unreadCount: number}>('/api/alerts');
      setAlerts(res.alerts);
      setUnreadAlerts(res.unreadCount);
    } catch {
      // ignore if unauthenticated
    }
  }

  useEffect(() => {
    apiRequest<{user: UserProfile}>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setBooting(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshAlerts();
    apiRequest<{totalInVoice: number}>('/api/circles')
      .then((res) => setTotalVoiceCount(res.totalInVoice))
      .catch(() => undefined);
    apiRequest<{totalCount: number}>('/api/posts')
      .then((res) => setTotalPostsCount(res.totalCount))
      .catch(() => undefined);
  }, [user?.id]);

  async function handleLogout() {
    await apiRequest('/api/auth/logout', {method: 'POST'}).catch(() => undefined);
    setSessionToken(null);
    setUser(null);
    setAlerts([]);
    setUnreadAlerts(0);
    setActiveTab('circles');
  }

  if (booting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <TxlLogo size={44} />
        <p className="text-sm text-[#B8A9D9]">Cargando TXLsocial...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(loggedInUser) => {
          setUser(loggedInUser);
          setActiveTab('circles');
        }}
      />
    );
  }

  const navItems: {id: AppTab; label: string; icon: typeof Compass; badge?: number}[] = [
    {id: 'circles', label: lang === 'es' ? 'Círculos' : 'Circles', icon: Compass},
    {id: 'posts', label: lang === 'es' ? 'Posts' : 'Posts', icon: Layers},
    {id: 'bottle', label: lang === 'es' ? 'Botella' : 'Bottle', icon: Sparkles},
    {
      id: 'alerts',
      label: lang === 'es' ? 'Alertas' : 'Alerts',
      icon: Bell,
      badge: unreadAlerts,
    },
    {id: 'profile', label: lang === 'es' ? 'Perfil' : 'Profile', icon: User},
    {id: 'settings', label: lang === 'es' ? 'Ajustes' : 'Settings', icon: Settings},
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden lg:flex lg:w-64 xl:w-72 lg:flex-col lg:fixed lg:inset-y-0 border-r border-purple-500/20 bg-[#120824]/90 backdrop-blur-xl px-4 py-6 z-30">
        <div className="flex items-center gap-3 px-2 mb-8">
          <TxlLogo size={34} />
          <span className="font-display text-xl font-bold text-white tracking-tight">
            TXLsocial
          </span>
        </div>

        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'alerts') void refreshAlerts();
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-colors min-h-[46px] cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#8B5CF6]/30 to-[#FF4D9D]/25 text-white border border-[#FF4D9D]/40'
                    : 'text-[#B8A9D9] hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${active ? 'text-[#FF4D9D]' : ''}`} />
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FF4D9D] text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Desktop User Card */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="mt-6 txl-card rounded-2xl p-3 flex items-center gap-3 text-left hover:border-[#FF4D9D]/40 transition-colors cursor-pointer"
        >
          <AvatarWithFrame
            src={user.avatarUrl}
            alt={user.username}
            frame={user.frame}
            frameImageUrl={user.frameImageUrl}
            sizeClass="w-10 h-10"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-white truncate">{user.username}</span>
              <VerificationBadge tier={user.badgeTier} verified={user.verified} size={14} />
            </div>
            <div className="text-xs text-amber-300 font-mono-num flex items-center gap-1">
              <Coins className="w-3 h-3" />
              <span>
                {user.role === 'owner' || user.infiniteCoins
                  ? '∞'
                  : user.coins.toLocaleString()}
              </span>
            </div>
          </div>
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 xl:pl-72 flex flex-col min-h-screen">
        {/* Compact Top Header Bar */}
        <header className="sticky top-0 z-20 h-14 bg-[#120824]/85 backdrop-blur-md border-b border-purple-500/15 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 lg:hidden">
            <TxlLogo size={28} />
            <span className="font-display text-lg font-bold text-white">TXLsocial</span>
          </div>
          <div className="hidden lg:block text-sm font-medium text-[#B8A9D9]">
            {navItems.find((i) => i.id === activeTab)?.label}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user.role === 'owner' && (
              <button
                type="button"
                onClick={() => setOwnerPanelOpen(true)}
                aria-label={
                  lang === 'es'
                    ? 'Añadir verificables y asignar cristales'
                    : 'Manage verification badges'
                }
                className="px-2.5 py-1.5 rounded-full bg-[#24103B] border border-[#FF4D9D]/55 hover:border-[#FF4D9D] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <BadgeCheck className="w-3.5 h-3.5 text-[#FF4D9D]" />
                <span className="hidden sm:inline">
                  {lang === 'es' ? 'Verificables' : 'Badges'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setFrameStoreOpen(true)}
              aria-label={lang === 'es' ? 'Abrir tienda de marcos PNG' : 'Open PNG frame shop'}
              className="px-2.5 py-1.5 rounded-full bg-[#10243A] border border-cyan-400/45 hover:border-cyan-300 text-xs font-medium text-cyan-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Store className="w-3.5 h-3.5 text-cyan-300" />
              <span className="hidden sm:inline">{lang === 'es' ? 'Tienda' : 'Shop'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              aria-label={lang === 'es' ? 'Compartir enlace y app móvil' : 'Share link and mobile app'}
              className="px-2.5 py-1.5 rounded-full bg-[#1E0F38] border border-purple-400/35 hover:border-[#FF4D9D]/60 text-xs font-medium text-[#E5DBFF] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5 text-[#FF4D9D]" />
              <span className="hidden sm:inline">{lang === 'es' ? 'Compartir / App' : 'Share / App'}</span>
            </button>
            {activeTab === 'posts' ? (
              <div className="px-3 py-1.5 rounded-full bg-[#1E0F38] border border-purple-400/30 text-xs text-[#C084FC] font-mono-num whitespace-nowrap">
                {totalPostsCount} {lang === 'es' ? 'publicaciones' : 'posts'}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="px-3 py-1.5 rounded-full bg-[#2B1F16]/85 border border-amber-400/45 text-xs font-bold text-amber-200 flex items-center gap-1.5 font-mono-num cursor-pointer whitespace-nowrap"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-300" />
                  <span>
                    {user.role === 'owner' || user.infiniteCoins
                      ? '∞'
                      : user.coins.toLocaleString()}
                  </span>
                </button>
                <div className="hidden sm:block px-3 py-1.5 rounded-full bg-[#1E0F38] border border-purple-400/30 text-xs text-[#D8CCF4] font-mono-num whitespace-nowrap">
                  {totalVoiceCount} {lang === 'es' ? 'en voz' : 'in voice'}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Scrollable View Body */}
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
          {activeTab === 'circles' && (
            <CirclesView
              currentUser={user}
              lang={lang}
              initialRoomId={pendingRoomId}
              onInitialRoomConsumed={() => {
                setPendingRoomId(null);
                if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
                  window.history.replaceState({}, '', window.location.pathname);
                }
              }}
              onUserUpdated={setUser}
              onVoiceCountChange={setTotalVoiceCount}
            />
          )}
          {activeTab === 'posts' && (
            <PostsView
              currentUser={user}
              lang={lang}
              onUserUpdated={setUser}
              onTotalCountChange={setTotalPostsCount}
            />
          )}
          {activeTab === 'bottle' && <BottleView lang={lang} />}
          {activeTab === 'alerts' && (
            <AlertsView alerts={alerts} lang={lang} onAlertsUpdated={refreshAlerts} />
          )}
          {activeTab === 'profile' && (
            <ProfileView
              user={user}
              lang={lang}
              onUserUpdated={setUser}
              onNavigateCircles={() => setActiveTab('circles')}
              onOpenOwnerPanel={() => setOwnerPanelOpen(true)}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              onUserUpdated={setUser}
              onOpenOwnerPanel={() => setOwnerPanelOpen(true)}
              onOpenShareModal={() => setShareModalOpen(true)}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (6 tabs matching all screenshots) */}
      <nav
        aria-label="Navegación principal"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-[#130826]/95 backdrop-blur-md border-t border-purple-500/20 grid grid-cols-6 items-center px-1"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                if (item.id === 'alerts') void refreshAlerts();
              }}
              className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl cursor-pointer transition-colors ${
                active ? 'text-[#FF4D9D]' : 'text-[#9E8CC4]'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full transition-colors ${
                  active ? 'bg-purple-500/25' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-0.5 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF4D9D] text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                  {item.badge}
                </span>
              )}
              <span className="text-[10px] font-medium mt-0.5 truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Owner Moderation Panel Modal */}
      <OwnerPanelModal
        open={ownerPanelOpen}
        onClose={() => setOwnerPanelOpen(false)}
        currentUser={user}
        onUserUpdated={setUser}
      />

      {/* Social Share & Mobile PWA Installer Modal */}
      <ShareAndInstallModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={typeof window !== 'undefined' ? window.location.origin : ''}
        lang={lang}
      />

      {/* Discord-inspired PNG Frame Shop & Studio Modal */}
      <FrameStoreModal
        open={frameStoreOpen}
        onClose={() => setFrameStoreOpen(false)}
        user={user}
        lang={lang}
        onUserUpdated={setUser}
      />

      <OfflineIndicator lang={lang} />
    </div>
  );
}
