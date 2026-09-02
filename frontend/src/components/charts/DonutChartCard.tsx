import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '../ui/Card';

const SERIES_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
];

export type DonutChartDatum = {
  label: string;
  value: number;
};

type DonutChartCardProps = {
  title: string;
  data: DonutChartDatum[];
  centerLabel?: string;
  centerValue?: React.ReactNode;
  actions?: React.ReactNode;
  height?: number;
};

export const DonutChartCard: React.FC<DonutChartCardProps> = ({
  title,
  data,
  centerLabel,
  centerValue,
  actions,
  height = 220,
}) => {
  return (
    <Card>
      <div className="chart-card__header">
        <h3 className="chart-card__title">{title}</h3>
        {actions}
      </div>
      <div className="chart-card__donut-wrap">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="65%" outerRadius="100%" paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={entry.label} fill={SERIES_COLORS[index % SERIES_COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border)', fontSize: 13 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="chart-card__donut-center">
            {centerValue && <span className="chart-card__donut-value">{centerValue}</span>}
            {centerLabel && <span className="chart-card__donut-label">{centerLabel}</span>}
          </div>
        )}
      </div>
      <div className="chart-card__legend">
        {data.map((entry, index) => (
          <span key={entry.label} className="chart-card__legend-item">
            <span
              className="chart-card__legend-dot"
              style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            {entry.label} — {entry.value}%
          </span>
        ))}
      </div>
    </Card>
  );
};
