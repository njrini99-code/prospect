/**
 * Hand-rolled SVG sparkline. Server-renderable (no client deps).
 *
 * Replaces @tremor/react's SparkAreaChart on /today — drops ~128 KB of
 * client JS while preserving the visual: a single polyline normalized
 * to the box, with the accent stroke matching the KPI color.
 */
export type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
  ariaLabel?: string;
};

const STROKE_COLOR: Record<string, string> = {
  emerald: "rgb(52 211 153)", // emerald-400
  blue: "rgb(96 165 250)", // blue-400
  violet: "rgb(167 139 250)", // violet-400
  amber: "rgb(251 191 36)", // amber-400
  rose: "rgb(251 113 133)", // rose-400
};

export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = "emerald",
  className,
  ariaLabel = "Trend sparkline",
}: SparklineProps) {
  if (!data || data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={ariaLabel}
        role="img"
        className={className}
      />
    );
  }
  const strokeColor = STROKE_COLOR[stroke] ?? stroke;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      // Invert Y because SVG origin is top-left; add 1px breathing room.
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label={ariaLabel}
      role="img"
      className={className}
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
