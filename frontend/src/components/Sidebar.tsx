import React from 'react';
import {
  LayoutDashboard,
  Package,
  SlidersHorizontal,
  FolderTree,
  BookOpen,
  Sparkles,
  AlertTriangle,
  LucideIcon,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Award,
  Truck,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppTab } from '../utils/rbac';

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

interface NavSection {
  title: string;
  items: NavItem[];
}

export type ActiveTab = AppTab;

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lowStockCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  lowStockCount = 0,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { can, canAccess } = useAuth();

  const rawSections: NavSection[] = [
    {
      title: 'Menu Utama',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: 'products',
          label: 'Data Produk & Varian',
          icon: Package,
          badge: lowStockCount > 0 ? formatBadgeCount(lowStockCount) : null,
          badgeIcon: AlertTriangle,
          badgeTitle: `${lowStockCount} varian dengan stok menipis`,
          badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
        },
        {
          id: 'adjust',
          label: can('stock:adjust') ? 'Penyesuaian Stok' : 'Riwayat Mutasi Stok',
          icon: SlidersHorizontal,
          badge: null,
        },
      ],
    },
    {
      title: 'Data Master',
      items: [
        {
          id: 'categories',
          label: 'Kategori Bertingkat',
          icon: FolderTree,
          badge: null,
        },
        {
          id: 'brands',
          label: 'Master Merek (Brand)',
          icon: Award,
          badge: null,
        },
        {
          id: 'suppliers',
          label: 'Master Supplier',
          icon: Truck,
          badge: null,
        },
      ],
    },
    {
      title: 'Administrasi',
      items: [
        {
          id: 'users',
          label: 'Manajemen Pengguna',
          icon: Users,
          badge: null,
        },
      ],
    },
    {
      title: 'Sistem & Bantuan',
      items: [
        {
          id: 'docs',
          label: 'Dokumentasi Sistem',
          icon: BookOpen,
          badge: 'Info',
          badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
        },
      ],
    },
  ];

  const navSections = rawSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(item.id)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 h-full overflow-hidden transition-all duration-300 ease-in-out select-none z-20`}
    >
      {/* Top Navigation Items */}
      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3.5'} space-y-1`}>
        {/* Section Header with quick toggle */}
        <div
          className={`flex items-center mb-2 ${
            isCollapsed ? 'justify-center py-1' : 'justify-between px-3 py-1'
          }`}
        >
          {!isCollapsed ? (
            <>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Navigasi
              </span>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Ciutkan Menu (Ctrl+B)"
                  aria-label="Ciutkan Menu"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Perluas Menu (Ctrl+B)"
                aria-label="Perluas Menu"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Navigation sections */}
        <nav className="space-y-3">
          {navSections.map((section, sIdx) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed ? (
                <div className="px-3 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {section.title}
                </div>
              ) : sIdx > 0 ? (
                <div className="my-2 mx-1 border-t border-slate-200 dark:border-slate-800" />
              ) : null}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <div key={item.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        title={isCollapsed ? item.label : undefined}
                        className={`w-full flex items-center rounded-xl font-medium text-sm transition-all text-left relative ${
                          isCollapsed
                            ? 'justify-center p-3'
                            : 'justify-between px-3.5 py-2.5'
                        } ${
                          isActive
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20 dark:bg-amber-500 dark:text-slate-950 font-bold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <div
                          className={`flex items-center min-w-0 ${
                            isCollapsed ? 'justify-center' : 'gap-3'
                          }`}
                        >
                          <Icon
                            className={`shrink-0 transition-transform ${
                              isCollapsed ? 'w-5 h-5' : 'w-4 h-4'
                            } ${
                              isActive
                                ? 'text-white dark:text-slate-950'
                                : 'text-slate-400 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'
                            }`}
                          />
                          {!isCollapsed && <span className="truncate">{item.label}</span>}
                        </div>

                        {/* Badge when expanded */}
                        {!isCollapsed && item.badge && (
                          <span
                            title={item.badgeTitle}
                            className={`ml-2 shrink-0 inline-flex items-center gap-0.5 text-[10px] leading-none px-1.5 py-1 rounded-full font-bold tabular-nums ${
                              isActive
                                ? 'bg-white/20 text-white dark:bg-slate-950/30 dark:text-slate-950'
                                : item.badgeColor
                            }`}
                          >
                            {item.badgeIcon && <item.badgeIcon className="w-3 h-3" />}
                            {item.badge}
                          </span>
                        )}

                        {/* Floating dot/badge when collapsed */}
                        {isCollapsed && item.badge && (
                          <span
                            title={item.badgeTitle || `${item.label}: ${item.badge}`}
                            className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5"
                          >
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                          </span>
                        )}
                      </button>

                      {/* Floating tooltip on hover when collapsed */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 dark:bg-slate-800 dark:border dark:border-slate-700 flex items-center gap-1.5">
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="shrink-0 p-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2 bg-white dark:bg-slate-900">
        {!isCollapsed ? (
          <>
            {/* Toko Bangunan Quick Badge Card */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-800/80 dark:to-slate-800/40 border border-amber-200/60 dark:border-slate-700/60 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-400 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>UUIDv7 Architecture</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Stok & data terurut berbasis waktu untuk performa tinggi.
              </p>
            </div>

            {/* Bottom Collapse Button */}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Ciutkan Menu (Ctrl+B)"
              >
                <PanelLeftClose className="w-4 h-4" />
                <span>Ciutkan Menu</span>
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 cursor-help"
              title="UUIDv7 Architecture: Database terindeks berbasis waktu untuk efisiensi tinggi"
            >
              <Sparkles className="w-4 h-4" />
            </div>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Perluas Menu (Ctrl+B)"
                aria-label="Perluas Menu"
              >
                <PanelLeftOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
