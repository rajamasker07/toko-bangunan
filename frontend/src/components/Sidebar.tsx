import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  SlidersHorizontal, 
  History, 
  FolderTree, 
  BookOpen,
  Sparkles,
  AlertTriangle,
  LucideIcon
} from 'lucide-react';

/** Format angka badge: tampilkan "99+" jika melebihi 99 agar badge tetap ringkas */
const formatBadgeCount = (count: number): string => (count > 99 ? '99+' : String(count));

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: LucideIcon;
  badge: string | null;
  badgeIcon?: LucideIcon;
  badgeTitle?: string;
  badgeColor?: string;
}

export type ActiveTab = 'dashboard' | 'products' | 'adjust' | 'movements' | 'categories' | 'docs';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lowStockCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, lowStockCount = 0 }) => {
  const navItems: NavItem[] = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'products' as ActiveTab,
      label: 'Data Produk & Varian',
      icon: Package,
      badge: lowStockCount > 0 ? formatBadgeCount(lowStockCount) : null,
      badgeIcon: AlertTriangle,
      badgeTitle: `${lowStockCount} varian dengan stok menipis`,
      badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
    },
    {
      id: 'adjust' as ActiveTab,
      label: 'Penyesuaian Stok',
      icon: SlidersHorizontal,
      badge: null,
    },
    {
      id: 'movements' as ActiveTab,
      label: 'Riwayat Log Mutasi',
      icon: History,
      badge: null,
    },
    {
      id: 'categories' as ActiveTab,
      label: 'Kategori Bertingkat',
      icon: FolderTree,
      badge: null,
    },
    {
      id: 'docs' as ActiveTab,
      label: 'Dokumentasi Sistem',
      icon: BookOpen,
      badge: 'Info',
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
    },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 transition-colors">
      <div className="p-4 space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Menu Utama
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all text-left ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20 dark:bg-amber-500 dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white dark:text-slate-950' : 'text-slate-400 dark:text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    title={item.badgeTitle}
                    className={`ml-2 shrink-0 inline-flex items-center gap-0.5 text-[10px] leading-none px-1.5 py-1 rounded-full font-bold tabular-nums ${
                      isActive ? 'bg-white/20 text-white dark:bg-slate-950/30 dark:text-slate-950' : item.badgeColor
                    }`}
                  >
                    {item.badgeIcon && <item.badgeIcon className="w-3 h-3" />}
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Toko Bangunan Quick Badge Card */}
      <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-800/80 dark:to-slate-800/40 border border-amber-200/60 dark:border-slate-700/60 text-xs">
        <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-400 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>UUIDv7 Architecture</span>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
          Semua produk, varian, dan log stok menggunakan UUID v7 berbasis waktu untuk performa tinggi.
        </p>
      </div>
    </aside>
  );
};
