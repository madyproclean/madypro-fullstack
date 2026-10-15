export type AttendanceCompletenessInput = {
  userId: string;
  arrivalTime?: Date | null;
  checkInTime?: Date | null;
  checkOutTime?: Date | null;
  status?: string;
};

export type AttendanceCompletenessResult = {
  complete: boolean;
  missingStart: string[];
  missingEnd: string[];
  pending: string[];
};

/**
 * Seule règle de complétude des pointages multi-agents. Utilisée à la fois pour valider
 * une intervention (rejet explicite) et pour décider automatiquement si elle peut passer
 * en attente de validation — pour que les deux ne divergent jamais.
 */
export function checkAttendanceCompleteness(
  assignedUserIds: string[],
  attendances: AttendanceCompletenessInput[],
): AttendanceCompletenessResult {
  const attForAssigned = attendances.filter((a) => assignedUserIds.includes(a.userId));
  // Un agent affecté sans aucune ligne de pointage n'a pas commencé : la mission n'est pas validable.
  const withoutRecord = assignedUserIds.filter((id) => !attForAssigned.some((a) => a.userId === id));
  const missingStart = [
    ...withoutRecord,
    ...attForAssigned.filter((a) => !a.arrivalTime && !a.checkInTime).map((a) => a.userId),
  ];
  const missingEnd = attForAssigned.filter((a) => !a.checkOutTime).map((a) => a.userId);
  const pending = attForAssigned.filter((a) => a.status !== 'COMPLETED').map((a) => a.userId);
  return {
    complete: missingStart.length === 0 && missingEnd.length === 0 && pending.length === 0,
    missingStart,
    missingEnd,
    pending,
  };
}
