import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export default function PumpDonutBody({ on, off }: { on: number; off: number }) {
  const data = [
    { name: "ON", value: on },
    { name: "OFF", value: off },
  ];
  return (
    <div
      className="relative mx-auto h-[150px] w-[150px]"
      role="img"
      aria-label={`${on} pumps on, ${off} off`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={52}
            outerRadius={70}
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            paddingAngle={on + off > 0 ? 3 : 0}
          >
            <Cell fill="#10b981" />
            <Cell fill="#e2e8f0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-extrabold text-slate-900">{on}</div>
          <div className="text-[10px] font-bold tracking-widest text-slate-400">ON</div>
        </div>
      </div>
    </div>
  );
}
