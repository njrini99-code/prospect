/**
 * Hand-rolled SVG area chart. Server-renderable (no Tremor / Recharts).
 *
 * Replaces the @tremor/react `<AreaChart>` import on /dashboard — drops the
 * majority of Tremor's client JS while preserving the visual (gradient fill
 * under polyline, axes, optional hover tooltip on a thin marker layer).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type AreaChartPoint = { date: string; value: number };

const STROKE: Record<string, string> = {
  emerald: "rgb(52 211 153)",
  blue: "rgb(96 165 250)",
  violet: "rgb(167 139 250)",
  amber: "rgb(251 191 36)",
  rose: "rgb(251 113 133)",
};

export function AreaChart({
  data,
  width = 480,
  height = 200,
  paddingX = 28,
  paddingY = 18,
  stroke = "emerald",
  className,
  ariaLabel = "Area chart",
  formatValue = (n) => String(n),
  formatDate = (d) => d,
}: {
  data: AreaChartPoint[];
  width?: number;
  height?: number;
  paddingX?: number;
  paddingY?: number;
  stroke?: string;
  className?: string;
  ariaLabel?: string;
  formatValue?: (n: number) => string;
  formatDate?: (s: string) => string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const color = STROKE[stroke] ?? stroke;
  const gradId = React.useId();

  if (!data || data.length === 0) {
    return (
      <div
        className={cn("text-xs text-muted-foreground p-4", className)}
        aria-label={ariaLabel}
      >
        No data.
      </div>
    );
  }

  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.value);
  const maxY = Math.max(1, ...ys);
  const minY = 0;
  const rangeY = Math.max(1, maxY - minY);
  const innerW = Math.max(1, width - paddingX * 2);
  const innerH = Math.max(1, height - paddingY * 2);
  const stepX = xs.length > 1 ? innerW / (xs.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = paddingX + i * stepX;
    const y = paddingY + innerH - ((d.value - minY) / rangeY) * innerH;
    return { x, y, raw: d };
  });

  const polyline = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPath = `M ${points[0].x.toFixed(2)},${(paddingY + innerH).toFixed(2)} L ${polyline} L ${points[points.length - 1].x.toFixed(2)},${(paddingY + innerH).toFixed(2)} Z`;

  const ticks = [0, Math.round(maxY / 2), maxY];

  // Track hover via SVG x-coord
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgEl = e.currentTarget;
    const rect = svgEl.getBoundingClientRect();
    const ratio = svgEl.viewBox.baseVal.width / rect.width;
    const x = (e.clientX - rect.left) * ratio;
    // Snap to nearest point
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - x);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    setHover(idx);
  };

  const hoverPoint = hover != null ? points[hover] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y gridlines */}
        {ticks.map((t) => {
          const y = paddingY + innerH - ((t - minY) / rangeY) * innerH;
          return (
            <g key={t}>
              <line
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
              />
              <text
                x={paddingX - 4}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="monospace"
                fill="currentColor"
                fillOpacity="0.45"
              >
                {formatValue(t)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover marker */}
        {hoverPoint && (
          <g>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={paddingY}
              y2={paddingY + innerH}
              stroke={color}
              strokeOpacity="0.4"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r="3.5"
              fill={color}
              stroke="white"
              strokeOpacity="0.4"
              strokeWidth="1"
            />
          </g>
        )}

        {/* X tick labels (first / middle / last) */}
        {[0, Math.floor(points.length / 2), points.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx)
          .map((i) => (
            <text
              key={i}
              x={points[i].x}
              y={height - 4}
              textAnchor="middle"
              fontSize="9"
              fontFamily="monospace"
              fill="currentColor"
              fillOpacity="0.45"
            >
              {formatDate(points[i].raw.date)}
            </text>
          ))}
      </svg>

      {hoverPoint && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2 py-1 text-[10px] shadow-md"
          style={{
            left: `${(hoverPoint.x / width) * 100}%`,
            top: `${(hoverPoint.y / height) * 100}%`,
          }}
        >
          <div className="font-medium">
            {formatValue(hoverPoint.raw.value)}
          </div>
          <div className="text-muted-foreground font-mono">
            {formatDate(hoverPoint.raw.date)}
          </div>
        </div>
      )}
    </div>
  );
}
