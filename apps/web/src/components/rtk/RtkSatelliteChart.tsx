import type { RtkHistorySample } from "../../types/rtk.js";

export interface RtkSatelliteChartProps {
  samples: RtkHistorySample[];
}

const WIDTH = 640;
const HEIGHT = 190;
const PAD_X = 34;
const PAD_TOP = 18;
const PAD_BOTTOM = 32;

export function RtkSatelliteChart({ samples }: RtkSatelliteChartProps) {
  const usable = samples.filter(
    (sample) =>
      sample.gpsSatellites !== undefined || sample.rtkSatellites !== undefined
  );

  if (usable.length < 2) {
    return (
      <div className="chart-empty">
        Satellitenverlauf erscheint nach dem zweiten RTK/GNSS-Sample.
      </div>
    );
  }

  const maxSatellites = Math.max(
    8,
    ...usable.flatMap((sample) => [
      sample.gpsSatellites ?? 0,
      sample.rtkSatellites ?? 0
    ])
  );

  const gpsPoints = points(usable, "gpsSatellites", maxSatellites);
  const rtkPoints = points(usable, "rtkSatellites", maxSatellites);
  const gridValues = gridSteps(maxSatellites);

  return (
    <div className="satellite-chart">
      <div className="satellite-chart__legend">
        <span><i className="legend-line legend-line--rtk" />RTK</span>
        <span><i className="legend-line legend-line--gps" />GPS</span>
        <span className="muted">letzte {usable.length} Samples</span>
      </div>

      <svg
        viewBox={"0 0 " + WIDTH + " " + HEIGHT}
        role="img"
        aria-label="Verlauf der GPS- und RTK-Satellitenzahl"
      >
        {gridValues.map((value) => {
          const y = yFor(value, maxSatellites);
          return (
            <g key={value}>
              <line className="chart-grid" x1={PAD_X} x2={WIDTH - 10} y1={y} y2={y} />
              <text className="chart-axis-label" x={PAD_X - 8} y={y + 4}>
                {value}
              </text>
            </g>
          );
        })}

        <polyline className="chart-line chart-line--gps" points={gpsPoints} />
        <polyline className="chart-line chart-line--rtk" points={rtkPoints} />

        {usable.map((sample, index) => {
          if (sample.isFixed !== false) return null;
          const x = xFor(index, usable.length);
          return (
            <line
              className="chart-fix-loss"
              key={sample.sampledAt}
              x1={x}
              x2={x}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
            />
          );
        })}

        <text className="chart-axis-caption" x={PAD_X} y={HEIGHT - 8}>
          älter
        </text>
        <text
          className="chart-axis-caption"
          x={WIDTH - 10}
          y={HEIGHT - 8}
          textAnchor="end"
        >
          aktuell
        </text>
      </svg>
    </div>
  );
}

function points(
  samples: RtkHistorySample[],
  key: "gpsSatellites" | "rtkSatellites",
  max: number
): string {
  return samples
    .map((sample, index) => {
      const value = sample[key] ?? 0;
      return xFor(index, samples.length) + "," + yFor(value, max);
    })
    .join(" ");
}

function xFor(index: number, count: number): number {
  if (count <= 1) return PAD_X;
  return PAD_X + (index / (count - 1)) * (WIDTH - PAD_X - 10);
}

function yFor(value: number, max: number): number {
  const usableHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + usableHeight - (value / max) * usableHeight;
}

function gridSteps(max: number): number[] {
  const step = max <= 20 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let value = 0; value <= top; value += step) values.push(value);
  return values;
}
