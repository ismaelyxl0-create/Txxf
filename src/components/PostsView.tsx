import {useEffect, useRef, useState} from 'react';
import {
  Calendar,
  Heart,
  ImagePlus,
  Layers,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {apiRequest, formatRelativeTime, readAndCompressImage} from '../lib/api.ts';
import type {CircleItem, LanguageCode, PostItem, UserProfile} from '../types.ts';
import {AvatarWithFrame, SafeImage, VerificationBadge} from './TxlLogo.tsx';
import {UserProfileModal} from './UserProfileModal.tsx';

export function PostsView({
  currentUser,
  lang,
  onUserUpdated,
  onTotalCountChange,
}: {
  currentUser: UserProfile;
  lang: LanguageCode;
  onUserUpdated: (user: UserProfile) => void;
  onTotalCountChange: (count: number) => void;
}) {
  const [inspectedAuthorId, setInspectedAuthorId] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'with_photo' | 'mine'>('all');
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);

  // New Post composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState('');
  const [selectedCircleId, setSelectedCircleId] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Comment state per post
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  async function loadPosts() {
    try {
      const params = new URLSearchParams({filter});
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const [postsRes, circlesRes] = await Promise.all([
        apiRequest<{posts: PostItem[]; totalCount: number}>(`/api/posts?${params.toString()}`),
        apiRequest<{circles: CircleItem[]}>('/api/circles'),
      ]);
      setPosts(postsRes.posts);
      onTotalCountChange(postsRes.totalCount);
      setCircles(circlesRes.circles);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPosts();
  }, [filter, fromDate, toDate]);

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readAndCompressImage(file, 1080);
      setImageUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar foto');
    }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{post: PostItem}>('/api/posts', {
        method: 'POST',
        body: {
          content: content.trim(),
          imageUrl,
          circleId: selectedCircleId || null,
        },
      });
      setPosts((prev) => [res.post, ...prev]);
      onTotalCountChange(posts.length + 1);
      setContent('');
      setImageUrl(null);
      setSelectedCircleId('');
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLike(postId: string) {
    const res = await apiRequest<{likesCount: number; likedByMe: boolean}>(
      `/api/posts/${postId}/like`,
      {method: 'POST'}
    );
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? {...p, likesCount: res.likesCount, likedByMe: res.likedByMe} : p
      )
    );
  }

  async function handleAddComment(e: React.FormEvent, postId: string) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const res = await apiRequest<{comment: PostItem['comments'][number]}>(
      `/api/posts/${postId}/comments`,
      {
        method: 'POST',
        body: {content: commentText.trim()},
      }
    );
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? {...p, comments: [...p.comments, res.comment]} : p))
    );
    setCommentText('');
  }

  async function handleDeletePost(postId: string) {
    await apiRequest(`/api/posts/${postId}`, {method: 'DELETE'});
    const next = posts.filter((p) => p.id !== postId);
    setPosts(next);
    onTotalCountChange(next.length);
  }

  const hasDateFilter = Boolean(fromDate || toDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          {lang === 'es' ? 'Publicaciones' : 'Posts'}
        </h1>
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="hidden lg:inline-flex txl-btn-primary rounded-full px-5 py-2.5 text-sm font-semibold items-center gap-2 min-h-[44px] cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'es' ? 'Nueva publicación' : 'New post'}</span>
        </button>
      </div>

      {/* Filter Pills Row (Screenshot 1) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            {id: 'all', label: lang === 'es' ? 'Todas' : 'All'},
            {id: 'with_photo', label: lang === 'es' ? 'Con foto' : 'With photo'},
            {id: 'mine', label: lang === 'es' ? 'Mis posts' : 'My posts'},
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-full text-xs font-medium min-h-[38px] whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              filter === tab.id
                ? 'bg-[#C026D3] text-white shadow-md shadow-fuchsia-700/30'
                : 'bg-[#21103C] border border-purple-400/25 text-[#CBBCEB] hover:border-purple-400/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Range Filter Row (Screenshot 1) */}
      <div className="txl-card rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Calendar className="w-4 h-4 text-[#38BDF8] shrink-0" />
          <span className="text-sm text-[#C7B8E6] truncate">
            {hasDateFilter
              ? `${fromDate || 'Inicio'} → ${toDate || 'Hoy'}`
              : lang === 'es'
                ? 'Filtrar por rango de fechas'
                : 'Filter by date range'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasDateFilter && (
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="text-xs text-[#FF88BE] hover:underline cursor-pointer px-2 py-1"
            >
              Limpiar
            </button>
          )}
          <button
            type="button"
            onClick={() => setDateModalOpen((prev) => !prev)}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-purple-400/35 text-[#D8CCF4] hover:bg-purple-500/15 min-h-[34px] cursor-pointer"
          >
            {lang === 'es' ? 'Elegir' : 'Choose'}
          </button>
        </div>
      </div>

      {dateModalOpen && (
        <div className="txl-card rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#B8A9D9] mb-1">Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="txl-input w-full rounded-xl px-3 py-2 text-sm min-h-[42px]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#B8A9D9] mb-1">Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="txl-input w-full rounded-xl px-3 py-2 text-sm min-h-[42px]"
            />
          </div>
        </div>
      )}

      {/* Feed or Empty State */}
      {loading ? (
        <div className="txl-card rounded-3xl p-10 text-center text-sm text-[#B8A9D9]">
          Cargando publicaciones...
        </div>
      ) : posts.length === 0 ? (
        <div className="txl-card rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-400/25 flex items-center justify-center mb-4">
            <Layers className="w-7 h-7 text-[#C084FC]" />
          </div>
          <h2 className="font-display text-lg font-bold text-white">
            {lang === 'es' ? 'Sin publicaciones todavía' : 'No posts yet'}
          </h2>
          <p className="text-sm text-[#B8A9D9] mt-1.5 max-w-sm">
            {lang === 'es'
              ? 'Toca "+ Nueva publicación" abajo para compartir texto o fotos con la comunidad.'
              : 'Tap "+ New post" below to share text or photos with the community.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {posts.map((post) => {
            const canDelete =
              post.authorId === currentUser.id || currentUser.role === 'owner';
            const commentsOpen = openCommentsId === post.id;

            return (
              <article key={post.id} className="txl-card rounded-3xl p-5 space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setInspectedAuthorId(post.authorId)}
                    className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
                  >
                    <AvatarWithFrame
                      src={post.authorAvatar}
                      alt={post.authorName}
                      frame={post.authorFrame}
                      frameImageUrl={post.authorFrameImageUrl}
                      sizeClass="w-10 h-10"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-white group-hover:text-[#FF88BE] transition-colors truncate">
                          {post.authorName}
                        </span>
                        <VerificationBadge
                          tier={post.authorBadgeTier}
                          verified={post.authorVerified}
                          size={15}
                        />
                      </div>
                      <div className="text-xs text-[#9E8CC4] truncate">
                        {formatRelativeTime(post.createdAt, lang)}
                        {post.circleName ? ` · ${post.circleName}` : ''}
                      </div>
                    </div>
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeletePost(post.id)}
                      aria-label="Eliminar publicación"
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-[#9E8CC4] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {post.content && (
                  <p className="text-sm text-[#EFEAFF] leading-relaxed whitespace-pre-wrap break-words">
                    {post.content}
                  </p>
                )}

                {post.imageUrl && (
                  <div className="rounded-2xl overflow-hidden border border-purple-500/20">
                    <SafeImage
                      src={post.imageUrl}
                      alt={`Foto publicada por ${post.authorName}`}
                      className="w-full max-h-80 object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center gap-4 pt-1 border-t border-purple-500/15">
                  <button
                    type="button"
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-2.5 rounded-xl min-h-[36px] cursor-pointer transition-colors ${
                      post.likedByMe
                        ? 'text-[#FF4D9D] bg-[#FF4D9D]/15'
                        : 'text-[#B8A9D9] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${post.likedByMe ? 'fill-[#FF4D9D]' : ''}`} />
                    <span className="font-mono-num">{post.likesCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenCommentsId(commentsOpen ? null : post.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#B8A9D9] hover:text-white py-1.5 px-2.5 rounded-xl hover:bg-white/5 min-h-[36px] cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="font-mono-num">{post.comments.length}</span>
                  </button>
                </div>

                {commentsOpen && (
                  <div className="pt-2 border-t border-purple-500/15 space-y-3">
                    {post.comments.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {post.comments.map((c) => (
                          <div key={c.id} className="flex items-start gap-2.5 text-xs">
                            <SafeImage
                              src={c.authorAvatar}
                              alt={c.authorName}
                              className="w-7 h-7 rounded-full object-cover shrink-0"
                            />
                            <div className="flex-1 bg-[#140A29] rounded-xl px-3 py-2">
                              <div className="flex items-center gap-1 font-semibold text-white">
                                <span>{c.authorName}</span>
                                <VerificationBadge
                                  tier={c.authorBadgeTier}
                                  verified={c.authorVerified}
                                  size={14}
                                />
                                <span className="text-[#8E7CB5] font-normal">
                                  · {formatRelativeTime(c.createdAt, lang)}
                                </span>
                              </div>
                              <p className="text-[#E5DBFF] mt-0.5">{c.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => handleAddComment(e, post.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Escribe un comentario..."
                        maxLength={300}
                        className="txl-input flex-1 rounded-full px-3.5 py-2 text-xs min-h-[38px]"
                      />
                      <button
                        type="submit"
                        disabled={!commentText.trim()}
                        aria-label="Comentar"
                        className="txl-btn-primary w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Mobile Primary CTA matching Screenshot 1 */}
      <div className="lg:hidden pt-1">
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="txl-btn-primary w-full rounded-full py-3.5 px-6 text-sm font-semibold min-h-[48px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'es' ? 'Nueva publicación' : 'New post'}</span>
        </button>
      </div>

      {/* Composer Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="txl-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">Nueva publicación</h2>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#B8A9D9] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-2.5 text-sm text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handlePublish} className="space-y-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="¿Qué quieres compartir hoy con la comunidad?"
                rows={4}
                maxLength={1000}
                className="txl-input w-full rounded-2xl p-4 text-sm resize-none"
              />

              {circles.length > 0 && (
                <div>
                  <label className="block text-xs text-[#B8A9D9] mb-1">
                    Círculo (opcional)
                  </label>
                  <select
                    value={selectedCircleId}
                    onChange={(e) => setSelectedCircleId(e.target.value)}
                    className="txl-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="">Feed general de TXLsocial</option>
                    {circles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {imageUrl && (
                <div className="relative rounded-2xl overflow-hidden border border-purple-400/30">
                  <img
                    src={imageUrl}
                    alt="Vista previa"
                    className="w-full max-h-56 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    aria-label="Quitar foto"
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePickImage}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2.5 rounded-full text-xs font-medium border border-[#FF4D9D]/55 text-[#FF88BE] hover:bg-[#FF4D9D]/10 flex items-center gap-2 min-h-[42px] cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>{imageUrl ? 'Cambiar foto' : 'Agregar foto'}</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting || (!content.trim() && !imageUrl)}
                  className="txl-btn-primary rounded-full px-6 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Publicando...' : 'Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <UserProfileModal
        userId={inspectedAuthorId}
        currentUser={currentUser}
        lang={lang}
        onClose={() => setInspectedAuthorId(null)}
        onCurrentUserUpdated={onUserUpdated}
        onBlockedUser={(blockedId) => {
          setPosts((prev) =>
            prev
              .filter((p) => p.authorId !== blockedId)
              .map((p) => ({
                ...p,
                comments: p.comments.filter((c) => c.authorId !== blockedId),
              }))
          );
        }}
      />
    </div>
  );
}
