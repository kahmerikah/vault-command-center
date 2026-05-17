import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import GlassPanel from "./GlassPanel";

export default function RevenueChart({ data = [] }) {
  return (
    <GlassPanel title="Revenue Signal">
      <div className="h-60 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#b89f7a" stopOpacity={0.75} />
                <stop offset="95%" stopColor="#b89f7a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
            <Area type="monotone" dataKey="amount" stroke="#b89f7a" fill="url(#revenue)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
}
