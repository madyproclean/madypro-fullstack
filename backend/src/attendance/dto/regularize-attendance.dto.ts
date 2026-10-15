import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Correction d'un pointage oublié ou erroné par le superviseur, motif obligatoire. */
export class RegularizeAttendanceDto {
  @IsOptional()
  @Matches(HHMM, { message: 'Heure de début au format HH:MM' })
  checkInTime?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'Heure de fin au format HH:MM' })
  checkOutTime?: string;

  @IsString()
  @MinLength(3, { message: 'Le motif est obligatoire' })
  reason!: string;
}
