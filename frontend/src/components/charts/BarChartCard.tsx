import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';

const SERIES_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
];

type BarChartCardProps = {
  title: string;
  data: Array<Record<string, string | number>>;
  /** clé de l'axe X (ex. "month") */
  xKey: string;
  /** clés numériques à tracer, une barre par clé */
  series: string[];
  actions?: React.ReactNode;
  height?: number;
};

export const BarChartCard: React.FC<BarChartCardProps> = ({ title, data, xKey, series, actions, height = 260 }) => {
  return (
    <Card>
      <div className="chart-card__header">
        <h3 className="chart-card__title">{title}</h3>
        {actions}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted)" />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted)" width={32} />
          <Tooltip
            cursor={{ fill: 'var(--color-cream)' }}
            contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border)', fontSize: 13 }}
          />
          {series.map((key, index) => (
            <Bar key={key} dataKey={key} fill={SERIES_COLORS[index % SERIES_COLORS.length]} radius={[6, 6, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-card__legend">
        {series.map((key, index) => (
          <span key={key} className="chart-card__legend-item">
            <span
              className="chart-card__legend-dot"
              style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            {key}
          </span>
        ))}
      </div>
    </Card>
  );
};
