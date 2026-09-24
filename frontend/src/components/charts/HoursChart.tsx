import React from 'react';

type DataPoint = {
  label: string;
  value: number;
};

const DATA: DataPoint[] = [
  { label: 'Lun', value: 6 },
  { label: 'Mar', value: 7 },
  { label: 'Mer', value: 8 },
  { label: 'Jeu', value: 6 },
  { label: 'Ven', value: 5 },
];

export const HoursChart: React.FC<{ data?: DataPoint[] }> = ({ data = DATA }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="hours-chart">
      {data.map((point) => (
        <div key={point.label} className="hours-chart__bar">
          <div
            className="hours-chart__fill"
            style={{ height: `${(point.value / max) * 100}%` }}
            aria-label={`${point.label} ${point.value}h`}
          />
          <span>{point.label}</span>
        </div>
      ))}
    </div>
  );
};
