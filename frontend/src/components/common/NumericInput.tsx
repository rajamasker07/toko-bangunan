import React, { useState, useEffect, useRef } from 'react';
import { LucideIcon } from 'lucide-react';

export interface NumericInputProps {
  value: number | string | undefined | null;
  onChange: (value: number) => void;
  placeholder?: string;
  allowDecimals?: boolean;
  maxDecimals?: number;
  min?: number;
  max?: number;
  prefixIcon?: LucideIcon;
  prefixText?: string;
  suffixText?: string;
  className?: string;
  inputClassName?: string;
  size?: 'sm' | 'md';
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}

/**
 * Format string atau angka ke format angka Indonesia (Pemisah ribuan "." dan desimal ",").
 * Menghapus leading zero (misal "05" -> "5") agar user tidak terganggu oleh angka 0.
 */
export function formatIdNumber(
  val: number | string | undefined | null,
  allowDecimals = true,
  maxDecimals = 2,
  preserveTrailingComma = false
): string {
  if (val === undefined || val === null || val === '') return '';

  let str = String(val).trim();

  // Jika input berupa number dari backend/state
  if (typeof val === 'number') {
    if (isNaN(val)) return '';
    // Format desimal '.' ke ','
    str = val.toString().replace('.', ',');
  } else {
    // Jika string memiliki format desimal dot tanpa koma (misal "125.50")
    if (str.includes('.') && !str.includes(',')) {
      str = str.replace('.', ',');
    }
  }

  // Pisahkan bagian integer dan desimal berdasarkan koma
  const parts = str.split(',');
  let intDigits = parts[0].replace(/\D/g, '');

  // Hilangkan leading zero: "05" -> "5", "00" -> "0"
  if (intDigits.length > 1 && intDigits.startsWith('0')) {
    intDigits = intDigits.replace(/^0+/, '') || '0';
  }

  // Format ribuan dengan titik
  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (!allowDecimals) {
    return formattedInt;
  }

  if (parts.length > 1) {
    const decDigits = parts[1].replace(/\D/g, '').slice(0, maxDecimals);
    return `${formattedInt},${decDigits}`;
  }

  if (preserveTrailingComma && str.endsWith(',')) {
    return `${formattedInt},`;
  }

  return formattedInt;
}

/**
 * Parsing string format Indonesia (misal "1.250.000,50") kembali ke tipe number JS murni (1250000.5).
 */
export function parseIdNumber(str: string): number {
  if (!str || !str.trim()) return 0;
  const clean = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  placeholder = '0',
  allowDecimals = false,
  maxDecimals = 2,
  min = 0,
  max,
  prefixIcon: PrefixIcon,
  prefixText,
  suffixText,
  className = '',
  inputClassName = '',
  size = 'md',
  required = false,
  disabled = false,
  id,
  name,
  autoFocus = false,
  onBlur,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Inisialisasi tampilan: jika 0 dan ada placeholder, bisa tampilkan '0'
  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (value === 0) return '0';
    return formatIdNumber(value, allowDecimals, maxDecimals);
  });

  // Sinkronisasi jika nilai value prop berubah dari luar (misal reset form)
  useEffect(() => {
    if (value === undefined || value === null || value === '') {
      setDisplayValue('');
      return;
    }
    const currentNum = parseIdNumber(displayValue);
    if (currentNum !== Number(value)) {
      setDisplayValue(formatIdNumber(value, allowDecimals, maxDecimals));
    }
  }, [value, allowDecimals, maxDecimals]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const raw = inputEl.value;
    const cursor = inputEl.selectionStart || 0;

    // Hitung berapa karakter non-titik sebelum kursor untuk menjaga posisi kursor
    const nonDotsBefore = raw.slice(0, cursor).replace(/\./g, '').length;

    // Deteksi jika user mengetik titik pada numpad keyboard, otomatis ubah menjadi koma
    let sanitized = raw;
    if (allowDecimals && !sanitized.includes(',')) {
      const lastChar = raw[cursor - 1];
      if (lastChar === '.') {
        sanitized = raw.slice(0, cursor - 1) + ',' + raw.slice(cursor);
      }
    }

    // Filter karakter yang diperbolehkan: angka 0-9 dan satu buah koma (jika allowDecimals)
    let clean = '';
    let commaCount = 0;
    for (const ch of sanitized) {
      if (/\d/.test(ch)) {
        clean += ch;
      } else if (ch === ',' && allowDecimals && commaCount === 0) {
        clean += ',';
        commaCount++;
      }
    }

    // Jika user menghapus seluruh isi field (backspace sampai kosong)
    if (clean === '') {
      setDisplayValue('');
      onChange(0);
      return;
    }

    const preserveTrailingComma = clean.endsWith(',');
    const formatted = formatIdNumber(clean, allowDecimals, maxDecimals, preserveTrailingComma);

    let numValue = parseIdNumber(formatted);
    if (max !== undefined && numValue > max) {
      numValue = max;
    }

    setDisplayValue(formatted);
    onChange(numValue);

    // Kembalikan posisi kursor secara presisi setelah penambahan titik ribuan
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let count = 0;
      let newPos = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== '.') {
          count++;
        }
        if (count === nonDotsBefore) {
          newPos = i + 1;
          break;
        }
      }
      inputRef.current.setSelectionRange(newPos, newPos);
    });
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all agar jika value '0', user langsung ketik angka tanpa harus hapus '0' dulu
    e.target.select();
  };

  const handleBlur = () => {
    // Jika diakhiri tanda koma tanpa angka desimal, bersihkan koma tersebut
    if (displayValue.endsWith(',')) {
      const cleaned = displayValue.slice(0, -1);
      setDisplayValue(cleaned);
      onChange(parseIdNumber(cleaned));
    }
    onBlur?.();
  };

  const isSmall = size === 'sm';

  return (
    <div
      className={`relative flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500 ${
        disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-800/80' : ''
      } ${className}`}
    >
      {/* Prefix Icon / Prefix Text */}
      {(PrefixIcon || prefixText) && (
        <div
          className={`flex items-center gap-1.5 shrink-0 pointer-events-none select-none text-slate-400 dark:text-slate-500 ${
            isSmall ? 'pl-2.5 pr-1.5' : 'pl-3 pr-2'
          }`}
        >
          {PrefixIcon && (
            <PrefixIcon
              className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-600 dark:text-amber-400`}
            />
          )}
          {prefixText && (
            <span
              className={`font-bold tracking-tight text-slate-600 dark:text-slate-300 ${
                isSmall ? 'text-[11px]' : 'text-xs'
              }`}
            >
              {prefixText}
            </span>
          )}
        </div>
      )}

      {/* Input Field */}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`w-full bg-transparent text-slate-900 dark:text-white font-medium focus:outline-none ${
          isSmall ? 'py-1.5 px-2 text-xs' : 'py-2.5 px-3 text-sm'
        } ${PrefixIcon || prefixText ? 'pl-0.5' : ''} ${suffixText ? 'pr-1' : ''} ${inputClassName}`}
      />

      {/* Suffix Text (e.g. Satuan 'Sak', 'Dus', 'Pcs') */}
      {suffixText && (
        <div
          className={`shrink-0 pointer-events-none select-none font-semibold text-slate-400 dark:text-slate-500 ${
            isSmall ? 'pr-2.5 pl-1 text-[10px]' : 'pr-3 pl-1.5 text-xs'
          }`}
        >
          {suffixText}
        </div>
      )}
    </div>
  );
};
