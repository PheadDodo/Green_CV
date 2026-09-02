"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { DashboardStatusDatum } from "@/lib/metrics";

const STATUS_COLORS: Record<DashboardStatusDatum["status"], string> = {
  Saved: "#87908d",
  Applied: "#3978a7",
  Screening: "#d59d26",
  Interview: "#145b45",
  Offer: "#795f9b",
  Closed: "#b8554e",
};

export function ApplicationStatusChart({ data }: { data: DashboardStatusDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const summary = data.map(item => `${item.status}: ${item.value}`).join(". ");

  return <figure className="statusChart">
    <div
      className="statusChartGraphic"
      role="img"
      aria-label={`Current application status chart. ${summary}.`}
    >
      {total > 0 ? <>
        <div className="statusChartCanvas" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer={false}>
              <Pie
                data={data.filter(item => item.value > 0)}
                dataKey="value"
                nameKey="status"
                innerRadius="61%"
                outerRadius="84%"
                paddingAngle={3}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.filter(item => item.value > 0).map(item => (
                  <Cell key={item.status} fill={STATUS_COLORS[item.status]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ border: "1px solid #dfe5df", borderRadius: 10, fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="statusChartTotal" aria-hidden="true">
          <strong>{total}</strong>
          <span>Total roles</span>
        </div>
      </> : <p className="statusChartEmpty">Add your first role to see application status data.</p>}
    </div>
    <figcaption>
      <ul className="statusChartLegend" aria-label="Current application status totals">
        {data.map(item => <li key={item.status}>
          <span className="statusLegendLabel">
            <i aria-hidden="true" style={{ background: STATUS_COLORS[item.status] }} />
            {item.status}
          </span>
          <strong>{item.value}</strong>
        </li>)}
      </ul>
    </figcaption>
  </figure>;
}
