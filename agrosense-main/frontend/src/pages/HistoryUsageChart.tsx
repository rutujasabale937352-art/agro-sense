import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IrrigationStats } from "@/types";

const COLORS = ["#0e9c6a", "#3b82f6", "#f59e0b"];

export default function HistoryUsageChart({ stats }: { stats: IrrigationStats }) {
  const summary = stats.per_zone.map((p) => `Zone ${p.zone_id} ${p.liters} liters`).join(", ");
  return (
    <div
      className="h-[220px] w-full"
      role="img"
      aria-label={summary ? `Water usage by zone: ${summary}` : "No water usage data"}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stats.per_zone} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="zone_id"
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `Zone ${v}`}
          />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Bar dataKey="liters" radius={[8, 8, 4, 4]} maxBarSize={64}>
            {stats.per_zone.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
