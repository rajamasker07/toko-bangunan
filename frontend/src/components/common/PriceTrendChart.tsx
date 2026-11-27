import React, { useState, useMemo, useEffect } from 'react';
import { PriceTrendPoint } from '../../types';
import { TrendingUp, TrendingDown, Minus, Calendar, Filter, AlertTriangle } from 'lucide-react';
import { formatIdNumber } from './NumericInput';

export type PriceTrendTimeRange = '30d' | '90d' | '180d' | '365d' | 'all';

export interface PriceTrendChartProps {
  data: PriceTrendPoint[];
  canViewBuyPrice?: boolean;
  marginThreshold?: number;
  height?: number;
  title?: string;
  defaultUnit?: string;
  baseUnitName?: string;
  defaultRange?: PriceTrendTimeRange;
  className?: string;
}

type TimeRange = PriceTrendTimeRange;

export const PriceTrendChart: React.FC<PriceTrendChartProps> = ({
  data,
  canViewBuyPrice = true,
  marginThreshold = 10,
  height = 300,
  title = 'Tren Riwayat Harga',
  defaultUnit,
  baseUnitName,
  defaultRange = '90d',
  className = '',
}) => {
  const [selectedRange, setSelectedRange] = useState<TimeRange>(defaultRange);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const preferredUnit = defaultUnit || baseUnitName;

  // Extract available units, placing base unit first
  const availableUnits = useMemo(() => {
    const units = Array.from(new Set(data.map((p) => p.unit_name).filter(Boolean)));
    if (preferredUnit && units.includes(preferredUnit)) {
      return [preferredUnit, ...units.filter((u) => u !== preferredUnit)];
    }
    return units.length > 0 ? units : [preferredUnit || 'Utama'];
  }, [data, preferredUnit]);

  const [activeUnit, setActiveUnit] = useState<string>(
    () => (preferredUnit && availableUnits.includes(preferredUnit) ? preferredUnit : availableUnits[0]) || 'Utama'
  );

  // Sync active unit to base unit when preferredUnit changes (e.g. navigating variants)
  useEffect(() => {
    if (preferredUnit) {
      setActiveUnit(preferredUnit);
      setHoveredPointIndex(null);
    }
  }, [preferredUnit]);

  // Ensure activeUnit stays valid once data finishes loading
  useEffect(() => {
    if (availableUnits.length > 0 && !availableUnits.includes(activeUnit)) {
      setActiveUnit(
        preferredUnit && availableUnits.includes(preferredUnit) ? preferredUnit : availableUnits[0]
      );
      setHoveredPointIndex(null);
    }
  }, [availableUnits, activeUnit, preferredUnit]);

  // Filter data by active unit and time range
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let list = data.filter((p) => (p.unit_name || 'Utama') === activeUnit);

    // If unit has no data points, fallback to all points for that unit or first available
    if (list.length === 0) {
      list = data;
    }

    // Sort chronologically
    list = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (selectedRange === 'all') return list;

    const now = new Date().getTime();
    const daysMap: Record<TimeRange, number> = {
      '30d': 30,
      '90d': 90,
      '180d': 180,
      '365d': 365,
      all: 99999,
    };
    const maxAgeMs = daysMap[selectedRange] * 24 * 60 * 60 * 1000;
    const cutoff = now - maxAgeMs;

    const filtered = list.filter((p) => new Date(p.date).getTime() >= cutoff);
    // If range filter leaves nothing, return at least the latest point or original list
    return filtered.length > 0 ? filtered : list.slice(-1);
  }, [data, activeUnit, selectedRange]);

  // Statistics calculation
  const stats = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        latestSell: 0,
        latestBuy: 0,
        latestWholesale: null as number | null,
        latestMargin: null as number | null,
        minSell: 0,
        maxSell: 0,
        diffSell: 0,
        diffSellPercent: 0,
      };
    }

    const first = filteredData[0];
    const latest = filteredData[filteredData.length - 1];

    const sells = filteredData.map((d) => d.sell_price);
    const minSell = Math.min(...sells);
    const maxSell = Math.max(...sells);
    const diffSell = latest.sell_price - first.sell_price;
    const diffSellPercent = first.sell_price > 0 ? (diffSell / first.sell_price) * 100 : 0;

    return {
      latestSell: latest.sell_price,
      latestBuy: latest.buy_price ?? 0,
      latestWholesale: latest.wholesale_price,
      latestMargin: latest.gross_margin,
      minSell,
      maxSell,
      diffSell,
      diffSellPercent,
    };
  }, [filteredData]);

  // SVG Chart Geometry
  const svgPadding = { top: 20, right: 25, bottom: 35, left: 65 };
  const chartWidth = 700;
  const chartHeight = height;

  const innerWidth = chartWidth - svgPadding.left - svgPadding.right;
  const innerHeight = chartHeight - svgPadding.top - svgPadding.bottom;

  const { points, yTicks, xTicks, pathSell, pathBuy, pathWholesale, marginAreaPath } = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        points: [],
        yTicks: [],
        xTicks: [],
        pathSell: '',
        pathBuy: '',
        pathWholesale: '',
        marginAreaPath: '',
      };
    }

    // Determine Y range (Prices)
    const allPrices: number[] = [];
    filteredData.forEach((d) => {
      allPrices.push(d.sell_price);
      if (canViewBuyPrice && d.buy_price !== null && d.buy_price !== undefined) {
        allPrices.push(d.buy_price);
      }
      if (d.wholesale_price !== null && d.wholesale_price !== undefined) {
        allPrices.push(d.wholesale_price);
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

    // Y scale function
    const getY = (val: number) => {
      if (maxY === minY) return innerHeight / 2;
      return innerHeight - ((val - minY) / (maxY - minY)) * innerHeight;
    };

    // X scale function
    const getX = (index: number) => {
      if (filteredData.length <= 1) return innerWidth / 2;
      return (index / (filteredData.length - 1)) * innerWidth;
    };

    const calculatedPoints = filteredData.map((d, i) => {
      const x = svgPadding.left + getX(i);
      const ySell = svgPadding.top + getY(d.sell_price);
      const yBuy =
        canViewBuyPrice && d.buy_price !== null ? svgPadding.top + getY(d.buy_price) : null;
      const yWholesale =
        d.wholesale_price !== null ? svgPadding.top + getY(d.wholesale_price) : null;

      return {
        ...d,
        x,
        ySell,
        yBuy,
        yWholesale,
        index: i,
      };
    });

    // Generate paths
    const pathSell = calculatedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.ySell}`).join(' ');

    const buyPoints = calculatedPoints.filter((p) => p.yBuy !== null);
    const pathBuy = buyPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yBuy}`).join(' ');

    const wholesalePoints = calculatedPoints.filter((p) => p.yWholesale !== null);
    const pathWholesale = wholesalePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yWholesale}`)
      .join(' ');

    // Margin Area Path (area between Sell and Buy lines)
    let marginAreaPath = '';
    if (canViewBuyPrice && buyPoints.length === calculatedPoints.length && buyPoints.length > 1) {
      const sellLine = calculatedPoints.map((p) => `${p.x},${p.ySell}`).join(' L ');
      const buyLineReversed = [...calculatedPoints]
        .reverse()
        .map((p) => `${p.x},${p.yBuy}`)
        .join(' L ');
      marginAreaPath = `M ${sellLine} L ${buyLineReversed} Z`;
    }

    // Generate Y Ticks (4 ticks)
    const yTickCount = 4;
    const yTicks = Array.from({ length: yTickCount + 1 }).map((_, i) => {
      const val = minY + (i / yTickCount) * (maxY - minY);
      const y = svgPadding.top + getY(val);
      return { val, y };
    });

    // Generate X Ticks
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

    // Ensure last point is included in xTicks if not already
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
      pathWholesale,
      marginAreaPath,
    };
  }, [filteredData, canViewBuyPrice, innerWidth, innerHeight, svgPadding]);

  const hoveredPoint =
    hoveredPointIndex !== null && points[hoveredPointIndex] ? points[hoveredPointIndex] : null;

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 ${className}`}
    >
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Riwayat fluktuasi harga modal, jual, grosir, dan marjin kotor per satuan
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unit selector pills */}
          {availableUnits.length > 1 && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 text-xs font-medium">
              {availableUnits.map((u) => {
                const isBase = Boolean(baseUnitName && u === baseUnitName);
                return (
                  <button
                    key={u}
                    type="button"
                    title={isBase ? `${u} (Satuan Dasar)` : u}
                    onClick={() => {
                      setActiveUnit(u);
                      setHoveredPointIndex(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      activeUnit === u
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <span>{u}</span>
                    {isBase && (
                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                        Dasar
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Time range pills */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 text-xs font-medium">
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
                onClick={() => {
                  setSelectedRange(r.id);
                  setHoveredPointIndex(null);
                }}
                className={`px-2 py-1 rounded-lg transition-all ${
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
      </div>

      {/* Quick KPI Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
            Harga Jual Terkini
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              Rp {formatIdNumber(stats.latestSell, false)}
            </span>
            <span className="text-[10px] text-slate-400">/{activeUnit}</span>
          </div>
        </div>

        {canViewBuyPrice && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
              Harga Modal Terkini
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-extrabold text-slate-700 dark:text-slate-300">
                Rp {formatIdNumber(stats.latestBuy, false)}
              </span>
              <span className="text-[10px] text-slate-400">/{activeUnit}</span>
            </div>
          </div>
        )}

        {canViewBuyPrice && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">
              Gross Margin
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
            Perubahan Periode
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
              <span className="text-slate-600 dark:text-slate-300 font-medium">Harga Jual</span>
            </div>

            {canViewBuyPrice && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-500 rounded-full inline-block"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">Harga Modal</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b border-dashed border-indigo-500 inline-block"></span>
              <span className="text-slate-600 dark:text-slate-300 font-medium">Harga Grosir</span>
            </div>

            {canViewBuyPrice && marginAreaPath && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-emerald-500/20 rounded inline-block"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">Gross Margin Band</span>
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
                <linearGradient id="marginBandGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
                </linearGradient>

                <linearGradient id="sellAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
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
                <path d={marginAreaPath} fill="url(#marginBandGradient)" />
              )}

              {/* Wholesale Price Line (Dashed) */}
              {pathWholesale && (
                <path
                  d={pathWholesale}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              )}

              {/* Buy Price Line */}
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

              {/* Sell Price Line */}
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
                <g>
                  <line
                    x1={hoveredPoint.x}
                    y1={svgPadding.top}
                    x2={hoveredPoint.x}
                    y2={chartHeight - svgPadding.bottom}
                    className="stroke-slate-300 dark:stroke-slate-600"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                </g>
              )}

              {/* Point Circles and Interactive Hit Areas */}
              {points.map((p, i) => (
                <g key={i}>
                  {/* Invisible hit box for easier hover */}
                  <rect
                    x={p.x - 15}
                    y={svgPadding.top}
                    width={30}
                    height={chartHeight - svgPadding.top - svgPadding.bottom}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPointIndex(i)}
                  />

                  {/* Buy Price Dot */}
                  {canViewBuyPrice && p.yBuy !== null && (
                    <circle
                      cx={p.x}
                      cy={p.yBuy}
                      r={hoveredPointIndex === i ? 5 : 3}
                      fill="#f43f5e"
                      className="transition-all"
                    />
                  )}

                  {/* Wholesale Price Dot */}
                  {p.yWholesale !== null && (
                    <circle
                      cx={p.x}
                      cy={p.yWholesale}
                      r={hoveredPointIndex === i ? 4.5 : 2.5}
                      fill="#6366f1"
                      className="transition-all"
                    />
                  )}

                  {/* Sell Price Dot */}
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

            {/* Hover Tooltip Popup */}
            {hoveredPoint && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-900/95 dark:bg-slate-950/95 text-white backdrop-blur-md rounded-xl p-3 shadow-2xl border border-slate-700 text-xs w-60 space-y-1.5 transition-all duration-75"
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
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="font-semibold text-emerald-400">{hoveredPoint.unit_name}</span>
                </div>

                <div className="space-y-1 pt-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[11px]">Harga Jual:</span>
                    <span className="font-extrabold text-emerald-400">
                      Rp {formatIdNumber(hoveredPoint.sell_price, false)}
                    </span>
                  </div>

                  {canViewBuyPrice && hoveredPoint.buy_price !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Harga Modal:</span>
                      <span className="font-bold text-rose-400">
                        Rp {formatIdNumber(hoveredPoint.buy_price, false)}
                      </span>
                    </div>
                  )}

                  {hoveredPoint.wholesale_price !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Harga Grosir:</span>
                      <span className="font-bold text-indigo-300">
                        Rp {formatIdNumber(hoveredPoint.wholesale_price, false)}
                      </span>
                    </div>
                  )}

                  {canViewBuyPrice && typeof hoveredPoint.gross_margin === 'number' && (
                    <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                      <span className="text-slate-400 text-[11px]">Gross Margin:</span>
                      <span
                        className={`font-black ${
                          hoveredPoint.gross_margin <= 0
                            ? 'text-rose-400'
                            : hoveredPoint.gross_margin < marginThreshold
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {hoveredPoint.gross_margin.toFixed(1).replace('.', ',')}%
                      </span>
                    </div>
                  )}

                  {hoveredPoint.reason && (
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-300">
                      <span className="text-slate-400">Alasan: </span>
                      {hoveredPoint.reason}
                    </div>
                  )}

                  {(hoveredPoint.created_by || hoveredPoint.change_source) && (
                    <div className="text-[10px] text-slate-400 flex justify-between pt-0.5">
                      <span>Oleh: {hoveredPoint.created_by || 'Sistem'}</span>
                      <span className="opacity-75">{hoveredPoint.change_source}</span>
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
