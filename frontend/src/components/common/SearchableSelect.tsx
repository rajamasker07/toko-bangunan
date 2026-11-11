import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Plus, Check, LucideIcon } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  subtitle?: string;
  level?: number;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  onAddNew?: (query: string) => Promise<void> | void;
  addNewLabel?: (query: string) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  icon?: LucideIcon;
  iconColor?: string;
  allowClear?: boolean;
  clearLabel?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  onAddNew,
  addNewLabel = (q) => `Tambah "${q}" baru`,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Cari...',
  disabled = false,
  size = 'md',
  className = '',
  icon: Icon,
  iconColor = 'text-amber-500',
  allowClear = false,
  clearLabel = '-- Kosongkan / Tanpa Pilihan --',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      setSearchQuery('');
    }
    setIsOpen(!isOpen);
  };

  // Filter options based on search query
  const safeOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    return options.filter((opt) => opt && typeof opt.label === 'string');
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return safeOptions;
    return safeOptions.filter(
      (opt) =>
        (opt.label || '').toLowerCase().includes(q) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(q))
    );
  }, [safeOptions, searchQuery]);

  // Exact match check
  const exactMatchExists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return safeOptions.some((opt) => (opt.label || '').trim().toLowerCase() === q);
  }, [safeOptions, searchQuery]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleCreateNew = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !onAddNew) return;
    try {
      setIsSubmittingNew(true);
      await onAddNew(trimmed);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return safeOptions.find((opt) => opt.value === value);
  }, [safeOptions, value]);

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
        } ${isSmall ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2.5 text-sm'}`}
      >
        <span className="flex items-center gap-2 truncate">
          {Icon && (
            <Icon
              className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${iconColor} flex-shrink-0`}
            />
          )}
          {selectedOption ? (
            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
              {selectedOption.label}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 truncate">{placeholder}</span>
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
        <div className="absolute z-50 left-0 right-0 mt-1 min-w-[240px] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                    if (filteredOptions.length > 0 && exactMatchExists) {
                      handleSelect(filteredOptions[0].value);
                    } else if (!exactMatchExists && searchQuery.trim() && onAddNew) {
                      handleCreateNew();
                    }
                  } else if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* List Options */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-slate-800/50">
            {allowClear && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-lg text-xs italic transition-colors ${
                  !value
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}
              >
                <span>{clearLabel}</span>
                {!value && <Check className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
              </button>
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                const levelPadding = opt.level ? opt.level * 14 : 0;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    style={{ paddingLeft: levelPadding ? `${levelPadding + 10}px` : undefined }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-left rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-semibold truncate">
                        {opt.level ? `↳ ${opt.label}` : opt.label}
                      </span>
                      {opt.subtitle && (
                        <span className="text-[10px] text-slate-400 truncate">
                          {opt.subtitle}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 ml-1" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                Tidak ditemukan hasil untuk "{searchQuery}"
              </div>
            )}
          </div>

          {/* Shortcut Tambah Baru Langsung dari Pencarian */}
          {onAddNew && !exactMatchExists && searchQuery.trim() && (
            <div className="p-1.5 border-t border-slate-100 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20">
              <button
                type="button"
                disabled={isSubmittingNew}
                onClick={handleCreateNew}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {isSubmittingNew ? 'Menyimpan...' : addNewLabel(searchQuery.trim())}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
