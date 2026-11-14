import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ROLE_META } from '../utils/rbac';
import {
  Bell,
  ChevronDown,
  HardHat,
  KeyRound,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';

interface NavbarProps {
  lowStockCount: number;
  onNavigateToLowStock: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenProfileModal: () => void;
  onNavigateToUsers?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  lowStockCount,
  onNavigateToLowStock,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenProfileModal,
  onNavigateToUsers,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, canAny, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const roleMeta = user ? ROLE_META[user.role] : null;
  const initials = user ? user.full_name.trim().slice(0, 2).toUpperCase() : 'US';
  const canViewUsers = canAny(['users:read', 'users:manage']);

  return (
    <header className="sticky top-0 z-30 shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-3">
        {/* Sidebar Collapse Toggle Button */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
            title={isSidebarCollapsed ? 'Perluas Menu Navigasi (Ctrl+B)' : 'Ciutkan Menu Navigasi (Ctrl+B)'}
            aria-label="Toggle Menu Bar"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Brand Logo & Name */}
        <div className="p-2 bg-gradient-to-tr from-amber-600 to-orange-500 rounded-xl text-white shadow-md shadow-orange-500/20">
          <HardHat className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              BangunJaya POS
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              v1.0 Pro
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Sistem Manajemen Stok & Inventaris Toko Bahan Bangunan
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Low Stock Alert Button */}
        {lowStockCount > 0 && (
          <button
            type="button"
            onClick={onNavigateToLowStock}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all animate-pulse"
            title="Klik untuk melihat produk dengan stok menipis"
          >
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">{lowStockCount} Stok Kritis</span>
            <span className="sm:hidden">{lowStockCount}</span>
          </button>
        )}

        {/* Database Status Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>PostgreSQL Active</span>
        </div>

        {/* Dark / Light Mode Switch */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle Dark Mode"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm"
          title={`Ubah ke Mode ${theme === 'dark' ? 'Terang' : 'Gelap'}`}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400 transition-transform rotate-0 hover:rotate-90" />
          ) : (
            <Moon className="w-5 h-5 text-indigo-600 transition-transform rotate-0 hover:-rotate-45" />
          )}
        </button>

        {/* User Profile Badge & Dropdown */}
        {user && roleMeta && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-colors shadow-sm"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-orange-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="hidden sm:block text-left min-w-0 max-w-[140px]">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {user.full_name}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {roleMeta.shortLabel}
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  menuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-50"
              >
                {/* User Summary */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {user.full_name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${roleMeta.badgeClass}`}
                    >
                      {roleMeta.shortLabel}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    @{user.username}
                    {user.email ? ` • ${user.email}` : ''}
                  </div>
                </div>

                {/* Actions */}
                <div className="p-1.5 space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenProfileModal();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    <span>Profil & Ganti Password</span>
                  </button>

                  {canViewUsers && onNavigateToUsers && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigateToUsers();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <Users className="w-4 h-4 text-blue-500" />
                      <span>Kelola Pengguna</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
