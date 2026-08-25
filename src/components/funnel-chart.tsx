"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function FunnelChart({ data }: { data: Array<{ stage: string; value: number }> }) {
  return (
    <div className="funnelChart" aria-label="Application funnel chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}>
          <CartesianGrid stroke="#edf0ed" vertical={false} />
          <XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: "#697471", fontSize: 10 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#87908d", fontSize: 9 }} />
          <Tooltip cursor={{ fill: "rgba(20,91,69,.04)" }} contentStyle={{ border: "1px solid #dfe5df", borderRadius: 10, fontSize: 11 }} />
          <Bar dataKey="value" fill="#145b45" radius={[7, 7, 2, 2]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
