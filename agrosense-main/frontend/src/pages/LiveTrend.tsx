import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendSample = {
  t: string;
  temperature: number;
  humidity: number;
  flow: number;
  [k: string]: string | number;
};

const COLORS = ["#0e9c6a", "#3b82f6", "#f59e0b", "#8b5cf6"];

export default function LiveTrend({
  buffer,
  zoneKeys,
  cropOf,
  mode,
}: {
  buffer: TrendSample[];
  zoneKeys: string[];
  cropOf: (zoneId: number) => string;
  mode: "moisture" | "environment";
}) {
  if (mode === "environment") {
    return (
      <div
        className="h-[260px] w-full"
        role="img"
        aria-label={`Environment trend over the last ${buffer.length} readings: temperature, humidity and flow rate`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={buffer} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="temperature"
              name="Temp (°C)"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="humidity"
              name="Humidity (%)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="flow"
              name="Flow (L/min)"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div
      className="h-[260px] w-full"
      role="img"
      aria-label={`Zone moisture trend over the last ${buffer.length} readings`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={buffer} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {zoneKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              name={`${k} ${cropOf(Number(k.slice(1)))}`}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
