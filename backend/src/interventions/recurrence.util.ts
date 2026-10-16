const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Lundi de la semaine UTC contenant `date`, à minuit UTC. */
function startOfWeekUTC(date: Date): Date {
  const day = date.getUTCDay(); // 0 = dimanche
  const mondayOffset = (day + 6) % 7;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return start;
}

export type TemplateLike = {
  siteId: string;
  startDate: Date;
  endDate?: Date | null;
};

export type TemplateStopLike = {
  id: string;
  daysOfWeek: number[];
  intervalWeeks: number;
  /** Date précise (YYYY-MM-DD) pour un arrêt sans fréquence, exclusif avec daysOfWeek/intervalWeeks. */
  specificDate?: string | null;
  categoryId?: string | null;
  startTime: string;
  endTime: string;
  agentIds: string[];
};

export type TemplateOccurrence = {
  date: string;
  stopId: string;
  siteId: string;
  categoryId?: string | null;
  startTime: string;
  endTime: string;
  agentIds: string[];
};

/**
 * Calcule les occurrences d'un gabarit d'intervention (un seul site, un ou plusieurs arrêts,
 * chacun avec ses propres jours de la semaine, horaire, fréquence, agents) à l'intérieur d'une
 * fenêtre [horizonStart, horizonEnd] (bornes incluses, UTC, minuit). Un arrêt peut couvrir
 * plusieurs jours de la semaine (ex. "Lun/Mer/Ven") avec sa propre cadence (ex. chaque semaine
 * pour un arrêt, une semaine sur deux pour un autre du même gabarit).
 */
export function computeTemplateOccurrences(
  template: TemplateLike,
  stops: TemplateStopLike[],
  horizonStart: Date,
  horizonEnd: Date,
): TemplateOccurrence[] {
  const effectiveStart = template.startDate > horizonStart ? template.startDate : horizonStart;
  const effectiveEnd = template.endDate && template.endDate < horizonEnd ? template.endDate : horizonEnd;
  if (effectiveStart > effectiveEnd || !stops.length) {
    return [];
  }

  const templateWeekStart = startOfWeekUTC(template.startDate);
  const occurrences: TemplateOccurrence[] = [];

  let cursor = new Date(Date.UTC(effectiveStart.getUTCFullYear(), effectiveStart.getUTCMonth(), effectiveStart.getUTCDate()));
  const end = new Date(Date.UTC(effectiveEnd.getUTCFullYear(), effectiveEnd.getUTCMonth(), effectiveEnd.getUTCDate()));

  while (cursor <= end) {
    const cursorWeekStart = startOfWeekUTC(cursor);
    const weeksDiff = Math.round((cursorWeekStart.getTime() - templateWeekStart.getTime()) / MS_PER_WEEK);
    const date = cursor.toISOString().slice(0, 10);
    for (const stop of stops) {
      const matches = stop.specificDate
        ? stop.specificDate.slice(0, 10) === date
        : weeksDiff >= 0 &&
          weeksDiff % Math.max(1, stop.intervalWeeks || 1) === 0 &&
          stop.daysOfWeek.includes(cursor.getUTCDay());
      if (matches) {
        occurrences.push({
          date,
          stopId: stop.id,
          siteId: template.siteId,
          categoryId: stop.categoryId,
          startTime: stop.startTime,
          endTime: stop.endTime,
          agentIds: stop.agentIds,
        });
      }
    }
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }

  return occurrences;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

export type TemplateGroup = {
  template: TemplateLike;
  stops: TemplateStopLike[];
};

export type StopConflict = {
  templateA: TemplateLike;
  stopA: TemplateStopLike;
  templateB: TemplateLike;
  stopB: TemplateStopLike;
  date: string;
  agentId: string;
};

/**
 * Détecte, en dépliant les occurrences réelles de chaque gabarit sur [horizonStart, horizonEnd],
 * les paires d'arrêts (au sein d'un même gabarit ou entre plusieurs gabarits différents, ex. deux
 * sites) qui tombent le même jour avec des horaires qui se chevauchent et qui partagent au moins
 * un agent — un agent ne peut pas être à deux endroits en même temps. Passer un seul groupe
 * détecte les conflits intra-gabarit ; passer plusieurs groupes (le gabarit en cours + les
 * gabarits déjà validés) détecte aussi les conflits inter-gabarits, en une seule passe.
 */
export function findStopConflicts(
  groups: TemplateGroup[],
  horizonStart: Date,
  horizonEnd: Date,
): StopConflict[] {
  const dated = groups.flatMap(({ template, stops }) => {
    const stopById = new Map(stops.map((s) => [s.id, s]));
    return computeTemplateOccurrences(template, stops, horizonStart, horizonEnd).map((occ) => ({
      template,
      stop: stopById.get(occ.stopId)!,
      occ,
    }));
  });

  const conflicts: StopConflict[] = [];
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const x = dated[i];
      const y = dated[j];
      if (x.stop.id === y.stop.id) continue;
      if (x.occ.date !== y.occ.date) continue;
      if (!timeRangesOverlap(x.occ.startTime, x.occ.endTime, y.occ.startTime, y.occ.endTime)) continue;
      const sharedAgent = x.occ.agentIds.find((id) => y.occ.agentIds.includes(id));
      if (sharedAgent) {
        conflicts.push({
          templateA: x.template,
          stopA: x.stop,
          templateB: y.template,
          stopB: y.stop,
          date: x.occ.date,
          agentId: sharedAgent,
        });
      }
    }
  }
  return conflicts;
}

export type TemplateExceptionLike = {
  stopId: string;
  /** YYYY-MM-DD */
  date: string;
  kind: 'CANCEL' | 'REPLACE_AGENTS';
  agentIds: string[];
  reason?: string | null;
};

/**
 * Applique les exceptions datées aux occurrences d'un gabarit : un créneau annulé ce jour-là
 * disparaît, un remplacement change les agents de ce seul jour. Le gabarit reste inchangé.
 */
export function applyTemplateExceptions<T extends { date: string; stopId: string; agentIds: string[] }>(
  occurrences: T[],
  exceptions: TemplateExceptionLike[],
): (T & { exception?: { kind: 'REPLACE_AGENTS'; reason?: string | null; originalAgentIds: string[] } })[] {
  if (!exceptions.length) return occurrences;
  const byKey = new Map(exceptions.map((e) => [`${e.date}:${e.stopId}`, e]));
  const result: (T & { exception?: { kind: 'REPLACE_AGENTS'; reason?: string | null; originalAgentIds: string[] } })[] = [];
  for (const occ of occurrences) {
    const exception = byKey.get(`${occ.date}:${occ.stopId}`);
    if (!exception) {
      result.push(occ);
    } else if (exception.kind === 'REPLACE_AGENTS') {
      result.push({
        ...occ,
        agentIds: exception.agentIds,
        exception: { kind: 'REPLACE_AGENTS', reason: exception.reason, originalAgentIds: occ.agentIds },
      });
    }
  }
  return result;
}
