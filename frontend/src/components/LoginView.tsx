import React, { useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  HardHat,
  Loader2,
  Lock,
  LogIn,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ApiError } from '../services/api';

interface LoginErrorState {
  variant: 'error' | 'warning';
  title: string;
  message: string;
}

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<LoginErrorState | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      setErrorState({
        variant: 'error',
        title: 'Data Belum Lengkap',
        message: 'Masukkan username atau email beserta kata sandi Anda.',
      });
      return;
    }

    setSubmitting(true);
    setErrorState(null);

    try {
      await login(trimmedIdentifier, password);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setErrorState({
            variant: 'warning',
            title: 'Terlalu Banyak Percobaan Login',
            message:
              err.message ||
              'Terlalu banyak percobaan login yang gagal. Silakan tunggu beberapa menit sebelum mencoba lagi.',
          });
        } else if (err.status === 403 || err.code === 'ACCOUNT_INACTIVE') {
          setErrorState({
            variant: 'warning',
            title: 'Akun Dinonaktifkan',
            message:
              err.message ||
              'Akun Anda sedang dinonaktifkan. Hubungi Owner atau Admin untuk mengaktifkan kembali.',
          });
        } else if (err.status === 401) {
          setErrorState({
            variant: 'error',
            title: 'Gagal Masuk',
            message: err.message || 'Username/email atau kata sandi salah.',
          });
        } else {
          setErrorState({
            variant: 'error',
            title: 'Terjadi Kesalahan',
            message: err.message || 'Tidak dapat memproses login saat ini.',
          });
        }
      } else {
        setErrorState({
          variant: 'error',
          title: 'Koneksi Server Gagal',
          message:
            err instanceof Error
              ? err.message
              : 'Gagal terhubung ke server backend. Pastikan server aktif.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors p-4 sm:p-6">
      {/* Top Bar with Theme Switch */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle Dark Mode"
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
          title={`Ubah ke Mode ${theme === 'dark' ? 'Terang' : 'Gelap'}`}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-indigo-600" />
          )}
        </button>
      </div>

      {/* Centered Login Card */}
      <div className="w-full max-w-md mx-auto my-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl shadow-slate-200/60 dark:shadow-black/40 p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex p-3.5 bg-gradient-to-tr from-amber-600 to-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/25">
              <HardHat className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  BangunJaya POS
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  v1.0 Pro
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Masuk ke Sistem Manajemen Stok & Inventaris Toko Bangunan
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorState && (
            <div
              role="alert"
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs sm:text-sm ${
                errorState.variant === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-300'
              }`}
            >
              {errorState.variant === 'warning' ? (
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              )}
              <div className="min-w-0">
                <p className="font-bold">{errorState.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed opacity-90">{errorState.message}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="login-identifier"
                className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                Username atau Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-identifier"
                  type="text"
                  autoFocus
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Contoh: owner atau kasir@toko.id"
                  disabled={submitting}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  disabled={submitting}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Masuk ke Sistem</span>
                </>
              )}
            </button>
          </form>

          {/* Footer info */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Akses Terproteksi RBAC
            </span>
            <span>Hubungi Owner jika lupa sandi</span>
          </div>
        </div>
      </div>

      {/* Subtle Bottom Copyright */}
      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        BangunJaya POS &bull; Sistem Inventaris Bahan Bangunan
      </p>
    </div>
  );
};
