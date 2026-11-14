import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserPlus,
  UserCog,
  X,
} from 'lucide-react';
import { AuthUser, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ROLE_META, getAssignableRoles } from '../utils/rbac';
import { validatePasswordStrength, validateUsernameFormat } from '../utils/validation';

export type UserFormModalMode = 'create' | 'edit' | 'reset-password';

interface UserFormModalProps {
  isOpen: boolean;
  mode: UserFormModalMode;
  targetUser: AuthUser | null;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  mode,
  targetUser,
  onClose,
  onSuccess,
  showToast,
}) => {
  const { user: currentUser, updateLocalUser } = useAuth();

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('kasir');
  const [isActive, setIsActive] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forceChangeOnLogin, setForceChangeOnLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const assignableRoles = getAssignableRoles(currentUser?.role);
  const isSelf = Boolean(currentUser && targetUser && targetUser.id === currentUser.id);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);

    if (mode === 'create') {
      setUsername('');
      setFullName('');
      setEmail('');
      setRole(assignableRoles.includes('kasir') ? 'kasir' : assignableRoles[0] || 'kasir');
      setIsActive(true);
      setMustChangePassword(true);
    } else if (targetUser) {
      setUsername(targetUser.username);
      setFullName(targetUser.full_name);
      setEmail(targetUser.email || '');
      setRole(targetUser.role);
      setIsActive(targetUser.is_active);
      setForceChangeOnLogin(true);
    }
  }, [isOpen, mode, targetUser]);

  if (!isOpen || !currentUser) return null;
  if ((mode === 'edit' || mode === 'reset-password') && !targetUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (mode === 'reset-password' && targetUser) {
      const pwdErr = validatePasswordStrength(password);
      if (pwdErr) {
        setFormError(pwdErr);
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Konfirmasi kata sandi baru tidak cocok.');
        return;
      }

      setSubmitting(true);
      try {
        await api.resetUserPassword(targetUser.id, {
          new_password: password,
          force_change_on_login: forceChangeOnLogin,
        });
        showToast(`Kata sandi "${targetUser.full_name}" berhasil direset.`, 'success');
        onSuccess();
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal mereset kata sandi.';
        setFormError(msg);
        showToast(msg, 'error');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const trimmedName = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setFormError('Nama lengkap minimal 2 karakter.');
      return;
    }

    const usernameErr = validateUsernameFormat(normalizedUsername);
    if (usernameErr) {
      setFormError(usernameErr);
      return;
    }

    if (mode === 'create') {
      const pwdErr = validatePasswordStrength(password);
      if (pwdErr) {
        setFormError(pwdErr);
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await api.createUser({
          username: normalizedUsername,
          full_name: trimmedName,
          email: trimmedEmail || null,
          password,
          role,
          is_active: isActive,
          must_change_password: mustChangePassword,
        });
        showToast(`Pengguna "${trimmedName}" berhasil ditambahkan.`, 'success');
      } else if (mode === 'edit' && targetUser) {
        const updated = await api.updateUser(targetUser.id, {
          username: normalizedUsername,
          full_name: trimmedName,
          email: trimmedEmail || null,
          ...(isSelf ? {} : { role, is_active: isActive }),
        });
        if (isSelf) {
          updateLocalUser(updated);
        }
        showToast(`Data pengguna "${updated.full_name}" berhasil diperbarui.`, 'success');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data pengguna.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const titleMap: Record<UserFormModalMode, string> = {
    create: 'Tambah Pengguna Baru',
    edit: `Edit Pengguna: ${targetUser?.full_name || ''}`,
    'reset-password': `Reset Kata Sandi: ${targetUser?.full_name || ''}`,
  };

  const HeaderIcon = mode === 'create' ? UserPlus : mode === 'edit' ? UserCog : KeyRound;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
              <HeaderIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {titleMap[mode]}
              </h2>
              {targetUser && mode !== 'create' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  @{targetUser.username} &bull; {ROLE_META[targetUser.role].shortLabel}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {formError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {mode !== 'reset-password' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="contoh: budi.gudang"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Email (Opsional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="budi@tokobangunan.id"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                />
              </div>

              {/* Role Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Peran (Role) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  disabled={isSelf}
                  title={isSelf ? 'Tidak dapat mengubah role akun sendiri' : undefined}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {(isSelf && targetUser ? [targetUser.role] : assignableRoles).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_META[r].label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 pt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{ROLE_META[role].description}</span>
                </p>
              </div>
            </>
          )}

          {(mode === 'create' || mode === 'reset-password') && (
            <>
              {mode === 'reset-password' && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  Mereset kata sandi akan segera menghentikan semua sesi login aktif pengguna ini.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {mode === 'reset-password' ? 'Kata Sandi Baru' : 'Kata Sandi'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 karakter"
                      required
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Konfirmasi Kata Sandi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Minimal 8 karakter dengan kombinasi huruf dan angka.
              </p>
            </>
          )}

          {/* Checkboxes / Active switch */}
          {mode !== 'reset-password' ? (
            <div className="space-y-3 pt-1">
              <label
                className={`flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 ${
                  isSelf ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
                title={isSelf ? 'Tidak dapat menonaktifkan akun sendiri' : undefined}
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Status Akun Aktif
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isSelf
                      ? 'Akun Anda sendiri tidak dapat dinonaktifkan.'
                      : 'Pengguna non-aktif langsung dicabut aksesnya dan tidak dapat masuk.'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={isSelf}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 accent-amber-600 rounded"
                />
              </label>

              {mode === 'create' && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mustChangePassword}
                    onChange={(e) => setMustChangePassword(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-amber-600 rounded"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Wajibkan ganti password saat login pertama
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Pengguna akan diminta membuat kata sandi pribadi setelah pertama kali masuk.
                    </div>
                  </div>
                </label>
              )}
            </div>
          ) : (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={forceChangeOnLogin}
                onChange={(e) => setForceChangeOnLogin(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-amber-600 rounded"
              />
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Wajibkan ganti password saat login berikutnya
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Disarankan agar pengguna mengganti kata sandi sementara dengan sandi pribadi.
                </div>
              </div>
            </label>
          )}

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {mode === 'create'
                ? 'Tambah Pengguna'
                : mode === 'edit'
                  ? 'Simpan Perubahan'
                  : 'Reset Kata Sandi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
