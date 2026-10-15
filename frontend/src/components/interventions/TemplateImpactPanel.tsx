import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { TemplateImpact, TemplateImpactItem } from '../../types/intervention';

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

const line = (item: TemplateImpactItem) =>
  `${dayLabel(item.date)} · ${item.startTime}–${item.endTime}${item.categoryLabel ? ` · ${item.categoryLabel}` : ''} · ${
    item.agents.join(', ') || 'aucun agent'
  }`;

const Group: React.FC<{ title: string; color: string; items: string[] }> = ({ title, color, items }) =>
  items.length ? (
    <div>
      <strong style={{ color }}>
        {title} ({items.length})
      </strong>
      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', maxHeight: 160, overflowY: 'auto' }}>
        {items.map((text, index) => (
          <li key={index} style={{ fontSize: '0.85rem' }}>
            {text}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

/** Ce que l'enregistrement du gabarit change sur les deux prochaines semaines. */
export const TemplateImpactPanel: React.FC<{ impact: TemplateImpact }> = ({ impact }) => {
  const nothing = !impact.added.length && !impact.removed.length && !impact.changed.length;
  return (
    <div className="panel" style={{ padding: '0.75rem', display: 'grid', gap: '0.6rem' }} aria-label="aperçu des changements">
      <p style={{ margin: 0 }}>
        <strong>Effet sur les 2 prochaines semaines</strong> (du {dayLabel(impact.period.startDate)} au {dayLabel(impact.period.endDate)})
      </p>
      {impact.warnings.map((warning) => (
        <p
          key={warning}
          style={{ margin: 0, display: 'flex', gap: '0.4rem', alignItems: 'flex-start', color: 'var(--color-danger, #b42318)' }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {warning}
        </p>
      ))}
      {nothing && <p style={{ margin: 0, color: 'var(--color-muted)' }}>Aucune mission ne change sur cette période.</p>}
      <Group title="Missions ajoutées" color="#067647" items={impact.added.map(line)} />
      <Group title="Missions retirées" color="#b42318" items={impact.removed.map(line)} />
      <Group
        title="Missions modifiées"
        color="#b54708"
        items={impact.changed.map((c) => `${line(c.before)} → ${c.after.startTime}–${c.after.endTime} · ${c.after.agents.join(', ') || 'aucun agent'}`)}
      />
      {impact.requiresValidation && (
        <p style={{ margin: 0, color: 'var(--color-muted)' }}>
          La modification sera envoyée à l’administrateur. En attendant sa validation, la version actuelle du gabarit continue de
          s’appliquer.
        </p>
      )}
    </div>
  );
};
