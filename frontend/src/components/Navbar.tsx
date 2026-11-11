import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, HardHat, Bell, ShieldCheck, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface NavbarProps {
  lowStockCount: number;
  onNavigateToLowStock: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  lowStockCount, 
  onNavigateToLowStock,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-3">
        {/* Sidebar Collapse Toggle Button */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
            title={isSidebarCollapsed ? "Perluas Menu Navigasi (Ctrl+B)" : "Ciutkan Menu Navigasi (Ctrl+B)"}
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

      <div className="flex items-center gap-3">
        {/* Low Stock Alert Button */}
        {lowStockCount > 0 && (
          <button
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
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>PostgreSQL Active</span>
        </div>

        {/* Dark / Light Mode Switch */}
        <button
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
      </div>
    </header>
  );
};
