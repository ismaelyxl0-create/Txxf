import {useState} from 'react';
import {Eye, EyeOff, Lock, Mail, User} from 'lucide-react';
import {apiRequest, setSessionToken} from '../lib/api.ts';
import type {UserProfile} from '../types.ts';
import {TxlLogo} from './TxlLogo.tsx';

interface AuthResponse {
  token: string;
  user: UserProfile;
}

export function AuthScreen({onAuthenticated}: {onAuthenticated: (user: UserProfile) => void}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      if (!acceptedTerms) {
        setError('Debes aceptar los términos y condiciones.');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? {identifier: identifier.trim(), password}
          : {username: username.trim(), email: email.trim(), password};

      const res = await apiRequest<AuthResponse>(endpoint, {
        method: 'POST',
        body: payload,
      });
      setSessionToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al autenticar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="flex items-center gap-3 mb-3">
          <TxlLogo size={38} />
          <span className="font-display text-2xl font-bold tracking-tight text-white">TXLsocial</span>
        </div>
        <p className="text-center text-sm text-[#B8A9D9] max-w-xs mb-8">
          Tu espacio para conectar con personas que comparten tus gustos
        </p>

        <div className="txl-card w-full rounded-3xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50">
          <h1 className="font-display text-2xl font-bold text-center text-white">
            {mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}
          </h1>
          <p className="text-center text-sm text-[#B8A9D9] mt-1 mb-6">
            {mode === 'login'
              ? 'Vuelve a tus círculos y salas de voz'
              : 'Regístrate con tu correo y únete a los círculos'}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl bg-rose-500/15 border border-rose-400/35 px-4 py-3 text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' ? (
              <>
                <div className="relative">
                  <User className="w-4 h-4 text-[#C084FC] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nombre de usuario"
                    autoComplete="username"
                    required
                    className="txl-input w-full rounded-xl pl-11 pr-4 py-3.5 text-sm min-h-[48px]"
                  />
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#C084FC] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo electrónico"
                    autoComplete="email"
                    required
                    className="txl-input w-full rounded-xl pl-11 pr-4 py-3.5 text-sm min-h-[48px]"
                  />
                </div>
              </>
            ) : (
              <div className="relative">
                <Mail className="w-4 h-4 text-[#C084FC] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Usuario o correo electrónico"
                  autoComplete="username"
                  required
                  className="txl-input w-full rounded-xl pl-11 pr-4 py-3.5 text-sm min-h-[48px]"
                />
              </div>
            )}

            <div className="relative">
              <Lock className="w-4 h-4 text-[#C084FC] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Contraseña (mín. 6 caracteres)' : 'Contraseña'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="txl-input w-full rounded-xl pl-11 pr-12 py-3.5 text-sm min-h-[48px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#B8A9D9] hover:text-white rounded-lg"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'register' && (
              <>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#C084FC] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar contraseña"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="txl-input w-full rounded-xl pl-11 pr-4 py-3.5 text-sm min-h-[48px]"
                  />
                </div>
                <label className="flex items-center gap-2.5 text-xs text-[#C7B8E6] pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 accent-[#FF4D9D] rounded"
                  />
                  <span>Acepto los términos de comunidad y convivencia</span>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="txl-btn-primary w-full rounded-full py-3.5 px-6 text-sm font-semibold min-h-[48px] mt-2 disabled:opacity-60 cursor-pointer"
            >
              {loading
                ? 'Procesando...'
                : mode === 'login'
                  ? 'Iniciar sesión'
                  : 'Registrarse'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[#B8A9D9]">
            <p>{mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode(mode === 'login' ? 'register' : 'login');
              }}
              className="mt-1.5 text-sm font-medium text-[#FF4D9D] underline underline-offset-4 hover:text-[#ff70b2] cursor-pointer min-h-[36px] px-3"
            >
              {mode === 'login' ? 'Crear cuenta nueva' : 'Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
