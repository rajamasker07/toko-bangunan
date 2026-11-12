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

type NavItem =
  | { type: 'clear'; id: string }
  | { type: 'option'; option: SearchableOption; id: string }
  | { type: 'addNew'; query: string; id: string };

const MAX_OPTIONS_DISPLAY = 50;

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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isClosingRef = useRef<boolean>(false);
  const isMouseDownRef = useRef<boolean>(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Safe timeout helper to avoid memory leaks on unmount
  const safeTimeout = (callback: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, ms);
    timersRef.current.add(timer);
    return timer;
  };

  // Clear all pending timeouts on component unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input immediately on open
      safeTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (isOpen) {
      isClosingRef.current = true;
      setIsOpen(false);
      safeTimeout(() => {
        isClosingRef.current = false;
      }, 200);
    } else {
      setSearchQuery('');
      setIsOpen(true);
    }
  };

  // When trigger is focused via Tab, immediately open and focus search input
  const handleTriggerFocus = () => {
    if (disabled || isClosingRef.current || isMouseDownRef.current) return;
    setSearchQuery('');
    setIsOpen(true);
    safeTimeout(() => {
      searchInputRef.current?.focus();
    }, 15);
  };

  // Keyboard navigation on the trigger button itself
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchQuery('');
      setIsOpen(true);
      safeTimeout(() => {
        searchInputRef.current?.focus();
      }, 15);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Printable key: open immediately and pre-fill search query
      e.preventDefault();
      setSearchQuery(e.key);
      setIsOpen(true);
      safeTimeout(() => {
        searchInputRef.current?.focus();
      }, 15);
    }
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

  // Bounded list to protect browser memory and prevent freeze when data scales to thousands
  const visibleOptions = useMemo(() => {
    return filteredOptions.slice(0, MAX_OPTIONS_DISPLAY);
  }, [filteredOptions]);

  // List of all items currently navigable via ArrowUp/ArrowDown & Enter
  const navigableItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];
    if (allowClear && !searchQuery.trim()) {
      items.push({ type: 'clear', id: '__clear__' });
    }
    for (const opt of visibleOptions) {
      items.push({ type: 'option', option: opt, id: opt.value });
    }
    if (onAddNew && !exactMatchExists && searchQuery.trim()) {
      items.push({ type: 'addNew', query: searchQuery.trim(), id: '__add_new__' });
    }
    return items;
  }, [allowClear, searchQuery, visibleOptions, onAddNew, exactMatchExists]);

  // Synchronize highlightedIndex when navigable items or search query change
  useEffect(() => {
    if (navigableItems.length > 0) {
      if (!searchQuery.trim() && value) {
        const found = navigableItems.findIndex(
          (item) => item.type === 'option' && item.option.value === value
        );
        setHighlightedIndex(found >= 0 ? found : 0);
      } else {
        setHighlightedIndex(0);
      }
    } else {
      setHighlightedIndex(0);
    }
  }, [searchQuery, isOpen, value, navigableItems.length]);

  // Clean up detached itemRefs to prevent memory leaks
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, navigableItems.length);
  }, [navigableItems.length]);

  // Scroll highlighted item into view automatically
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [isOpen, highlightedIndex]);

  const handleSelect = (val: string) => {
    onChange(val);
    isClosingRef.current = true;
    setIsOpen(false);
    triggerRef.current?.focus();
    safeTimeout(() => {
      isClosingRef.current = false;
    }, 200);
  };

  const handleCreateNew = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !onAddNew) return;
    try {
      setIsSubmittingNew(true);
      await onAddNew(trimmed);
      isClosingRef.current = true;
      setIsOpen(false);
      triggerRef.current?.focus();
      safeTimeout(() => {
        isClosingRef.current = false;
      }, 200);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Keyboard navigation within the search input
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (navigableItems.length > 0) {
        setHighlightedIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navigableItems.length > 0) {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (navigableItems.length > 0 && highlightedIndex >= 0 && highlightedIndex < navigableItems.length) {
        const item = navigableItems[highlightedIndex];
        if (item.type === 'option') {
          handleSelect(item.option.value);
        } else if (item.type === 'clear') {
          handleSelect('');
        } else if (item.type === 'addNew') {
          handleCreateNew();
        }
      } else if (!exactMatchExists && searchQuery.trim() && onAddNew) {
        handleCreateNew();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isClosingRef.current = true;
      setIsOpen(false);
      triggerRef.current?.focus();
      safeTimeout(() => {
        isClosingRef.current = false;
      }, 200);
    } else if (e.key === 'Tab') {
      // If user typed a search query and hits Tab, auto-select the highlighted option
      if (!e.shiftKey && searchQuery.trim() !== '' && navigableItems.length > 0) {
        const item = navigableItems[highlightedIndex];
        if (item && item.type === 'option') {
          onChange(item.option.value);
        }
      }
      // Allow browser native Tab to smoothly move to next/prev form element
      isClosingRef.current = true;
      safeTimeout(() => {
        setIsOpen(false);
        isClosingRef.current = false;
      }, 50);
    }
  };

  // Close dropdown if focus moves outside the component container
  const handleContainerBlur = (e: React.FocusEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  };

  // Find currently selected option for trigger display
  const selectedOption = useMemo(() => {
    return safeOptions.find((opt) => opt.value === value);
  }, [safeOptions, value]);

  const isSmall = size === 'sm';

  return (
    <div
      ref={containerRef}
      onBlur={handleContainerBlur}
      className={`relative inline-block w-full ${className}`}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        tabIndex={isOpen ? -1 : 0}
        onClick={handleToggleOpen}
        onFocus={handleTriggerFocus}
        onMouseDown={() => {
          isMouseDownRef.current = true;
          safeTimeout(() => {
            isMouseDownRef.current = false;
          }, 200);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full flex items-center justify-between gap-1.5 rounded-xl border text-left transition-colors ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border-slate-200 dark:border-slate-800'
            : isOpen
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-400 text-slate-900 dark:text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none'
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
                tabIndex={0}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* List Options */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-slate-800/50">
            {allowClear && !searchQuery.trim() && (
              <button
                ref={(el) => {
                  itemRefs.current[0] = el;
                }}
                type="button"
                tabIndex={-1}
                onClick={() => handleSelect('')}
                onMouseEnter={() => setHighlightedIndex(0)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-lg text-xs italic transition-colors ${
                  highlightedIndex === 0
                    ? 'bg-amber-500/15 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 ring-1 ring-amber-500/30'
                    : !value
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}
              >
                <span>{clearLabel}</span>
                {!value && <Check className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
              </button>
            )}

            {visibleOptions.length > 0 ? (
              visibleOptions.map((opt, optIdx) => {
                const isSelected = value === opt.value;
                const navIdx = (allowClear && !searchQuery.trim() ? 1 : 0) + optIdx;
                const isHighlighted = highlightedIndex === navIdx;
                const levelPadding = opt.level ? opt.level * 14 : 0;

                return (
                  <button
                    key={opt.value}
                    ref={(el) => {
                      itemRefs.current[navIdx] = el;
                    }}
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(navIdx)}
                    style={{ paddingLeft: levelPadding ? `${levelPadding + 10}px` : undefined }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-left rounded-lg text-xs transition-colors ${
                      isHighlighted
                        ? 'bg-amber-500/15 dark:bg-amber-500/25 text-amber-900 dark:text-amber-100 ring-1 ring-amber-500/30 font-medium'
                        : isSelected
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className={`truncate ${isSelected ? 'font-bold' : 'font-semibold'}`}>
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

          {/* Performance notice if results exceed display limit */}
          {filteredOptions.length > MAX_OPTIONS_DISPLAY && (
            <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 text-center border-t border-slate-100 dark:border-slate-800">
              Menampilkan {MAX_OPTIONS_DISPLAY} dari {filteredOptions.length} hasil. Ketik kata kunci untuk mempersempit.
            </div>
          )}

          {/* Shortcut Tambah Baru Langsung dari Pencarian */}
          {onAddNew && !exactMatchExists && searchQuery.trim() && (
            <div className="p-1.5 border-t border-slate-100 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20">
              <button
                ref={(el) => {
                  itemRefs.current[navigableItems.length - 1] = el;
                }}
                type="button"
                tabIndex={-1}
                disabled={isSubmittingNew}
                onClick={handleCreateNew}
                onMouseEnter={() => setHighlightedIndex(navigableItems.length - 1)}
                className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors ${
                  highlightedIndex === navigableItems.length - 1
                    ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/50'
                    : 'text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25'
                }`}
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
