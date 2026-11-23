import React, { useState, useMemo } from 'react';
import { ProductMarginTrendPoint } from '../../types';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { formatIdNumber } from './NumericInput';

export interface MarginTrendChartProps {
  data: ProductMarginTrendPoint[];
  canViewBuyPrice?: boolean;
  marginThreshold?: number;
  totalVariants?: number;
  height?: number;
  title?: string;
  className?: string;
}

type TimeRange = '30d' | '90d' | '180d' | '365d' | 'all';

export const MarginTrendChart: React.FC<MarginTrendChartProps> = ({
  data,
  canViewBuyPrice = true,
  marginThreshold = 10,
  totalVariants = 0,
  height = 300,
  title = 'Tren Rata-Rata Harga Modal & Jual Varian',
  className = '',
}) => {
  // Default periode diset ke 90 hari terakhir
  const [selectedRange, setSelectedRange] = useState<TimeRange>('90d');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (selectedRange === 'all') return sorted;

    const now = Date.now();
    const daysMap: Record<TimeRange, number> = {
      '30d': 30,
      '90d': 90,
      '180d': 180,
      '365d': 365,
      all: 99999,
    };
    const cutoff = now - daysMap[selectedRange] * 24 * 60 * 60 * 1000;
    const filtered = sorted.filter((p) => new Date(p.date).getTime() >= cutoff);

    return filtered.length > 0 ? filtered : sorted.slice(-1);
  }, [data, selectedRange]);

  const stats = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        latestSell: 0,
        latestBuy: null as number | null,
        latestMargin: null as number | null,
        latestMinMargin: null as number | null,
        latestMaxMargin: null as number | null,
        latestVariantsCount: totalVariants,
        diffSell: 0,
        diffSellPercent: 0,
      };
    }

    const first = filteredData[0];
    const latest = filteredData[filteredData.length - 1];
    const diffSell = latest.avg_sell_price - first.avg_sell_price;
    const diffSellPercent =
      first.avg_sell_price > 0 ? (diffSell / first.avg_sell_price) * 100 : 0;

    return {
      latestSell: latest.avg_sell_price,
      latestBuy: latest.avg_buy_price,
      latestMargin: latest.avg_margin,
      latestMinMargin: latest.min_margin,
      latestMaxMargin: latest.max_margin,
      latestVariantsCount: latest.variants_count || totalVariants,
      diffSell,
      diffSellPercent,
    };
  }, [filteredData, totalVariants]);

  const svgPadding = { top: 20, right: 25, bottom: 35, left: 65 };
  const chartWidth = 700;
  const chartHeight = height;

  const innerWidth = chartWidth - svgPadding.left - svgPadding.right;
  const innerHeight = chartHeight - svgPadding.top - svgPadding.bottom;

  const { points, yTicks, xTicks, pathSell, pathBuy, marginAreaPath } = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        points: [],
        yTicks: [],
        xTicks: [],
        pathSell: '',
        pathBuy: '',
        marginAreaPath: '',
      };
    }

    const allPrices: number[] = [];
    filteredData.forEach((d) => {
      allPrices.push(d.avg_sell_price);
      if (canViewBuyPrice && d.avg_buy_price !== null && d.avg_buy_price !== undefined) {
        allPrices.push(d.avg_buy_price);
      }
    });

    let minY = Math.min(...allPrices);
    let maxY = Math.max(...allPrices);

    if (minY === maxY) {
      minY = Math.max(0, minY * 0.9);
      maxY = maxY * 1.1 || 10000;
    } else {
      const buffer = (maxY - minY) * 0.15;
      minY = Math.max(0, minY - buffer);
      maxY = maxY + buffer;
    }

    const getY = (val: number) => {
      if (maxY === minY) return innerHeight / 2;
      return innerHeight - ((val - minY) / (maxY - minY)) * innerHeight;
    };

    const getX = (index: number) => {
      if (filteredData.length <= 1) return innerWidth / 2;
      return (index / (filteredData.length - 1)) * innerWidth;
    };

    const calculatedPoints = filteredData.map((d, i) => ({
      ...d,
      x: svgPadding.left + getX(i),
      ySell: svgPadding.top + getY(d.avg_sell_price),
      yBuy:
        canViewBuyPrice && d.avg_buy_price !== null
          ? svgPadding.top + getY(d.avg_buy_price)
          : null,
      index: i,
    }));

    const pathSell = calculatedPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.ySell}`)
      .join(' ');

    const buyPoints = calculatedPoints.filter((p) => p.yBuy !== null);
    const pathBuy = buyPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yBuy}`).join(' ');

    let marginAreaPath = '';
    if (canViewBuyPrice && buyPoints.length === calculatedPoints.length && buyPoints.length > 1) {
      const sellLine = calculatedPoints.map((p) => `${p.x},${p.ySell}`).join(' L ');
      const buyLineReversed = [...calculatedPoints]
        .reverse()
        .map((p) => `${p.x},${p.yBuy}`)
        .join(' L ');
      marginAreaPath = `M ${sellLine} L ${buyLineReversed} Z`;
    }

    const yTickCount = 4;
    const yTicks = Array.from({ length: yTickCount + 1 }).map((_, i) => {
      const val = minY + (i / yTickCount) * (maxY - minY);
      const y = svgPadding.top + getY(val);
      return { val, y };
    });

    const maxXTicks = Math.min(filteredData.length, 5);
    const xStep = Math.max(1, Math.floor((filteredData.length - 1) / (maxXTicks - 1 || 1)));
    const xTicks: Array<{ date: string; x: number }> = [];

    for (let i = 0; i < filteredData.length; i += xStep) {
      xTicks.push({
        date: new Date(filteredData[i].date).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
        }),
        x: calculatedPoints[i].x,
      });
    }

    const lastPoint = calculatedPoints[calculatedPoints.length - 1];
    if (xTicks[xTicks.length - 1]?.x !== lastPoint.x) {
      xTicks.push({
        date: new Date(lastPoint.date).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
        }),
        x: lastPoint.x,
      });
    }

    return {
      points: calculatedPoints,
      yTicks,
      xTicks,
      pathSell,
      pathBuy,
      marginAreaPath,
    };
  }, [filteredData, canViewBuyPrice, innerWidth, innerHeight, svgPadding]);

  const hoveredPoint =
    hoveredPointIndex !== null && points[hoveredPointIndex] ? points[hoveredPointIndex] : null;

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 ${className}`}
    >
      {/* Header & Period Filter Only */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pergerakan rata-rata harga modal, harga jual & histori margin keuntungan seluruh varian aktif (
            {stats.latestVariantsCount}
            {totalVariants > 0 && stats.latestVariantsCount !== totalVariants
              ? `/${totalVariants}`
              : ''}{' '}
            varian)
          </p>
        </div>

        {/* Time range pills (default 90H) */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 text-xs font-medium self-start sm:self-auto">
          {(
            [
              { id: '30d', label: '30H' },
              { id: '90d', label: '90H' },
              { id: '180d', label: '6B' },
              { id: '365d', label: '1T' },
              { id: 'all', label: 'Semua' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setSelectedRange(r.id);
                setHoveredPointIndex(null);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedRange === r.id
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick KPI Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
            Rata-Rata Harga Jual
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              Rp {formatIdNumber(stats.latestSell, false)}
            </span>
          </div>
        </div>

        {canViewBuyPrice && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
              Rata-Rata Harga Modal
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-extrabold text-slate-700 dark:text-slate-300">
                {stats.latestBuy !== null ? `Rp ${formatIdNumber(stats.latestBuy, false)}` : '-'}
              </span>
            </div>
          </div>
        )}

        {canViewBuyPrice && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
              Rata-Rata Gross Margin
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {typeof stats.latestMargin === 'number' ? (
                <>
                  <span
                    className={`text-base font-black ${
                      stats.latestMargin <= 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : stats.latestMargin < marginThreshold
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {stats.latestMargin.toFixed(1).replace('.', ',')}%
                  </span>
                  {stats.latestMargin <= 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                      Rugi
                    </span>
                  ) : stats.latestMargin < marginThreshold ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                      Kritis
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                      Aman
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-400">-</span>
              )}
            </div>
          </div>
        )}

        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
            Perubahan Rata-Rata Jual
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {stats.diffSell > 0 ? (
              <span className="flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" />+
                {formatIdNumber(stats.diffSell, false)} (+
                {stats.diffSellPercent.toFixed(1).replace('.', ',')}%)
              </span>
            ) : stats.diffSell < 0 ? (
              <span className="flex items-center text-xs font-bold text-rose-600 dark:text-rose-400">
                <TrendingDown className="w-3.5 h-3.5 mr-0.5" />-
                {formatIdNumber(Math.abs(stats.diffSell), false)} (
                {stats.diffSellPercent.toFixed(1).replace('.', ',')}%)
              </span>
            ) : (
              <span className="flex items-center text-xs font-medium text-slate-500">
                <Minus className="w-3.5 h-3.5 mr-0.5" /> Stabil (0%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SVG Chart Area */}
      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 dark:text-slate-500">
          <Calendar className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs font-medium">Belum ada data riwayat harga pada periode ini.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-end gap-4 text-[11px] mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 rounded-full inline-block"></span>
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                Rata-Rata Harga Jual
              </span>
            </div>

            {canViewBuyPrice && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-500 rounded-full inline-block"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Rata-Rata Harga Modal
                </span>
              </div>
            )}

            {canViewBuyPrice && marginAreaPath && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-emerald-500/20 rounded inline-block"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Area Margin Keuntungan
                </span>
              </div>
            )}
          </div>

          {/* SVG Viewport */}
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto select-none overflow-visible"
              style={{ minWidth: 480 }}
              onMouseLeave={() => setHoveredPointIndex(null)}
            >
              <defs>
                <linearGradient id="productAvgMarginBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
                </linearGradient>
              </defs>

              {/* Grid Lines & Y Ticks */}
              {yTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={svgPadding.left}
                    y1={tick.y}
                    x2={chartWidth - svgPadding.right}
                    y2={tick.y}
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth="1"
                    strokeDasharray={i === 0 ? '' : '3 3'}
                  />
                  <text
                    x={svgPadding.left - 8}
                    y={tick.y + 3}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                  >
                    Rp {formatIdNumber(Math.round(tick.val), false)}
                  </text>
                </g>
              ))}

              {/* X Ticks */}
              {xTicks.map((tick, i) => (
                <text
                  key={i}
                  x={tick.x}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-medium"
                >
                  {tick.date}
                </text>
              ))}

              {/* Gross Margin Shaded Band Area */}
              {canViewBuyPrice && marginAreaPath && (
                <path d={marginAreaPath} fill="url(#productAvgMarginBand)" />
              )}

              {/* Average Buy Price Line */}
              {canViewBuyPrice && pathBuy && (
                <path
                  d={pathBuy}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Average Sell Price Line */}
              {pathSell && (
                <path
                  d={pathSell}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Hover Crosshair */}
              {hoveredPoint && (
                <line
                  x1={hoveredPoint.x}
                  y1={svgPadding.top}
                  x2={hoveredPoint.x}
                  y2={chartHeight - svgPadding.bottom}
                  className="stroke-slate-300 dark:stroke-slate-600"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Point Circles & Hit Boxes */}
              {points.map((p, i) => (
                <g key={i}>
                  <rect
                    x={p.x - 15}
                    y={svgPadding.top}
                    width={30}
                    height={chartHeight - svgPadding.top - svgPadding.bottom}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPointIndex(i)}
                  />

                  {canViewBuyPrice && p.yBuy !== null && (
                    <circle
                      cx={p.x}
                      cy={p.yBuy}
                      r={hoveredPointIndex === i ? 5 : 3}
                      fill="#f43f5e"
                      className="transition-all"
                    />
                  )}

                  <circle
                    cx={p.x}
                    cy={p.ySell}
                    r={hoveredPointIndex === i ? 6 : 4}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="transition-all shadow-sm"
                  />
                </g>
              ))}
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-900/95 dark:bg-slate-950/95 text-white backdrop-blur-md rounded-xl p-3 shadow-2xl border border-slate-700 text-xs w-64 space-y-1.5 transition-all duration-75"
                style={{
                  left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                  top: `${Math.max(10, (hoveredPoint.ySell / chartHeight) * 100 - 15)}%`,
                }}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-[11px] text-slate-400">
                  <span>
                    {new Date(hoveredPoint.date).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="font-semibold text-emerald-400">
                    {hoveredPoint.variants_count} Varian
                  </span>
                </div>

                <div className="space-y-1 pt-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[11px]">Rata-Rata Jual:</span>
                    <span className="font-extrabold text-emerald-400">
                      Rp {formatIdNumber(hoveredPoint.avg_sell_price, false)}
                    </span>
                  </div>

                  {canViewBuyPrice && hoveredPoint.avg_buy_price !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Rata-Rata Modal:</span>
                      <span className="font-bold text-rose-400">
                        Rp {formatIdNumber(hoveredPoint.avg_buy_price, false)}
                      </span>
                    </div>
                  )}

                  {canViewBuyPrice && typeof hoveredPoint.avg_margin === 'number' && (
                    <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                      <span className="text-slate-400 text-[11px]">Rata-Rata Margin:</span>
                      <span
                        className={`font-black ${
                          hoveredPoint.avg_margin <= 0
                            ? 'text-rose-400'
                            : hoveredPoint.avg_margin < marginThreshold
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {hoveredPoint.avg_margin.toFixed(1).replace('.', ',')}%
                      </span>
                    </div>
                  )}

                  {canViewBuyPrice &&
                    typeof hoveredPoint.min_margin === 'number' &&
                    typeof hoveredPoint.max_margin === 'number' && (
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400">Rentang Margin:</span>
                        <span className="font-mono text-slate-300">
                          {hoveredPoint.min_margin.toFixed(1).replace('.', ',')}% –{' '}
                          {hoveredPoint.max_margin.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>
                    )}

                  {hoveredPoint.changed_variants.length > 0 && (
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-300">
                      <span className="text-slate-400">
                        Diubah ({hoveredPoint.changed_count}x):{' '}
                      </span>
                      {hoveredPoint.changed_variants.join(', ')}
                      {hoveredPoint.changed_count > hoveredPoint.changed_variants.length
                        ? ', ...'
                        : ''}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
