import React from 'react';
import { FolderTree, Award, Truck } from 'lucide-react';

export type MasterDataTab = 'categories' | 'brands' | 'suppliers';

interface MasterDataNavProps {
  activeTab: MasterDataTab;
  onSelectTab: (tab: MasterDataTab) => void;
  categoryCount?: number;
  brandCount?: number;
  supplierCount?: number;
}

export const MasterDataNav: React.FC<MasterDataNavProps> = ({
  activeTab,
  onSelectTab,
  categoryCount,
  brandCount,
  supplierCount,
}) => {
  const tabs = [
    {
      id: 'categories' as MasterDataTab,
      label: 'Kategori Bertingkat',
      icon: FolderTree,
      count: categoryCount,
    },
    {
      id: 'brands' as MasterDataTab,
      label: 'Master Merek (Brand)',
      icon: Award,
      count: brandCount,
    },
    {
      id: 'suppliers' as MasterDataTab,
      label: 'Master Supplier (Pemasok)',
      icon: Truck,
      count: supplierCount,
    },
  ];

  return (
    <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isActive
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/40'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isActive
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
