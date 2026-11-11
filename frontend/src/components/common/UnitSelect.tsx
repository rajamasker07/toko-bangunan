import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UnitMaster } from '../../types';
import { ChevronDown, Search, Plus, Check, Scale } from 'lucide-react';

export interface UnitSelectProps {
  value: string;
  onChange: (value: string) => void;
  units: UnitMaster[];
  onAddNewUnit?: (name: string) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const UnitSelect: React.FC<UnitSelectProps> = ({
  value,
  onChange,
  units,
  onAddNewUnit,
  placeholder = 'Pilih satuan...',
  disabled = false,
  size = 'md',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tutup dropdown saat klik di luar area
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-fokus ke input pencarian
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset pencarian ketika modal/dropdown dibuka
  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      setSearchQuery('');
    }
    setIsOpen(!isOpen);
  };

  // Filter satuan berdasarkan query pencarian
  const filteredUnits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.description && u.description.toLowerCase().includes(q))
    );
  }, [units, searchQuery]);

  // Cek apakah query yang diketik persis sama dengan nama satuan yang sudah ada
  const exactMatchExists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return units.some((u) => u.name.toLowerCase() === q);
  }, [units, searchQuery]);

  const handleSelectUnit = (unitName: string) => {
    onChange(unitName);
    setIsOpen(false);
  };

  const handleCreateNew = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    try {
      setIsCreating(true);
      if (onAddNewUnit) {
        await onAddNewUnit(trimmed);
      }
      onChange(trimmed);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  // Cari object satuan yang sedang terpilih
  const selectedUnit = useMemo(() => {
    return units.find((u) => u.name.toLowerCase() === (value || '').toLowerCase());
  }, [units, value]);

  const isSmall = size === 'sm';

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggleOpen}
        className={`w-full flex items-center justify-between gap-1.5 rounded-xl border text-left transition-colors ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border-slate-200 dark:border-slate-800'
            : isOpen
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-400 text-slate-900 dark:text-white'
        } ${isSmall ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Scale className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-500 flex-shrink-0`} />
          {value ? (
            <span className="font-semibold text-slate-800 dark:text-slate-100">{value}</span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-400 flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-amber-500' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 min-w-[240px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredUnits.length > 0 && exactMatchExists) {
                      handleSelectUnit(filteredUnits[0].name);
                    } else if (!exactMatchExists && searchQuery.trim()) {
                      handleCreateNew();
                    }
                  } else if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
                placeholder="Cari atau ketik satuan..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* List Options */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-slate-800/50">
            {filteredUnits.length > 0 ? (
              filteredUnits.map((u) => {
                const isSelected = (value || '').toLowerCase() === u.name.toLowerCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUnit(u.name)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-left rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-semibold">{u.name}</span>
                      {u.description && (
                        <span className="text-[10px] text-slate-400 truncate">{u.description}</span>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                Tidak ada satuan "{searchQuery}"
              </div>
            )}
          </div>

          {/* Shortcut Tambah Satuan Baru Langsung dari Pencarian */}
          {!exactMatchExists && searchQuery.trim() && (
            <div className="p-1.5 border-t border-slate-100 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20">
              <button
                type="button"
                disabled={isCreating}
                onClick={handleCreateNew}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {isCreating ? 'Menyimpan...' : `Tambah "${searchQuery.trim()}" sebagai Satuan Baru`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
