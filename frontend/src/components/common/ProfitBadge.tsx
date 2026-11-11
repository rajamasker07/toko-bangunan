import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { formatIdNumber } from './NumericInput';

export interface ProfitCalculation {
  diff: number;
  markupPercent: number; // % laba terhadap modal: ((jual - modal) / modal) * 100
  marginPercent: number; // % laba terhadap jual: ((jual - modal) / jual) * 100
  isProfit: boolean;
  isLoss: boolean;
  isZero: boolean;
  hasValidPrices: boolean;
}

function calculateProfit(buyPrice: number, sellPrice: number): ProfitCalculation {
  const buy = Number(buyPrice) || 0;
  const sell = Number(sellPrice) || 0;
  const diff = sell - buy;

  if (buy <= 0 && sell <= 0) {
    return {
      diff: 0,
      markupPercent: 0,
      marginPercent: 0,
      isProfit: false,
      isLoss: false,
      isZero: true,
      hasValidPrices: false,
    };
  }

  // Jika modal 0 tetapi harga jual terisi
  if (buy <= 0 && sell > 0) {
    return {
      diff: sell,
      markupPercent: 100,
      marginPercent: 100,
      isProfit: true,
      isLoss: false,
      isZero: false,
      hasValidPrices: true,
    };
  }

  const markupPercent = (diff / buy) * 100;
  const marginPercent = sell > 0 ? (diff / sell) * 100 : 0;

  return {
    diff,
    markupPercent,
    marginPercent,
    isProfit: diff > 0,
    isLoss: diff < 0,
    isZero: diff === 0,
    hasValidPrices: true,
  };
}

export interface ProfitBadgeProps {
  buyPrice: number;
  sellPrice: number;
  compact?: boolean;
  unitName?: string;
  className?: string;
}

export const ProfitBadge: React.FC<ProfitBadgeProps> = ({
  buyPrice,
  sellPrice,
  compact = false,
  unitName,
  className = '',
}) => {
  const profit = calculateProfit(buyPrice, sellPrice);
  const buyNum = Number(buyPrice) || 0;
  const sellNum = Number(sellPrice) || 0;

  if (!profit.hasValidPrices) {
    if (compact) {
      return (
        <span className={`text-[11px] text-slate-400 dark:text-slate-500 italic ${className}`}>
          -
        </span>
      );
    }
    return null;
  }

  const formattedDiff = formatIdNumber(Math.abs(profit.diff), false);
  const formattedPercent = (profit.isProfit ? '+' : '') + profit.markupPercent.toFixed(1).replace('.', ',') + '%';
  const unitSuffix = unitName ? ` / ${unitName}` : '';

  // Kasus: RUGI (Harga Jual < Harga Modal)
  if (profit.isLoss) {
    return (
      <div
        className={`inline-flex items-center gap-1 rounded-lg font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 max-w-full whitespace-nowrap overflow-hidden ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
        } ${className}`}
        title={`Peringatan: Jual di bawah modal! Rugi Rp ${formattedDiff}${unitSuffix} (${formattedPercent})`}
      >
        <TrendingDown className={compact ? 'w-3 h-3 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} />
        <span className="truncate">-Rp {formattedDiff}</span>
        <span className="font-bold flex-shrink-0">({formattedPercent})</span>
      </div>
    );
  }

  // Kasus: IMPAS (Harga Jual == Harga Modal)
  if (profit.isZero) {
    return (
      <div
        className={`inline-flex items-center gap-1 rounded-lg font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-w-full whitespace-nowrap overflow-hidden ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
        } ${className}`}
        title={`Harga jual sama dengan modal (tanpa keuntungan)`}
      >
        <Minus className={compact ? 'w-3 h-3 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} />
        <span className="truncate">Impas (0%)</span>
      </div>
    );
  }

  // Kasus: Modal 0 tetapi harga jual diisi
  if (buyNum <= 0 && sellNum > 0) {
    return (
      <div
        className={`inline-flex items-center gap-1 rounded-lg font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 max-w-full whitespace-nowrap overflow-hidden ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
        } ${className}`}
        title="Modal belum diisi (dihitung sebagai 100% dari harga jual)"
      >
        <AlertCircle className={compact ? 'w-3 h-3 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} />
        <span className="truncate">+Rp {formattedDiff}</span>
        <span className="font-bold text-[10px] flex-shrink-0">(Modal 0)</span>
      </div>
    );
  }

  // Kasus: UNTUNG (Harga Jual > Harga Modal)
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 max-w-full whitespace-nowrap overflow-hidden ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      } ${className}`}
      title={`Estimasi Laba: Rp ${formattedDiff}${unitSuffix} | Markup: ${formattedPercent} | Margin Penjualan: ${profit.marginPercent.toFixed(1).replace('.', ',')}%`}
    >
      <TrendingUp className={compact ? 'w-3 h-3 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} />
      <span className="truncate">+Rp {formattedDiff}</span>
      <span className="font-bold flex-shrink-0">({formattedPercent})</span>
    </div>
  );
};
