import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AbsenceStatus } from '../entities/absence.entity';

export class UpdateAbsenceStatusDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: AbsenceStatus;

  /** Ignoré : le serveur le remplace par le nom de l'utilisateur connecté. */
  @IsOptional()
  @IsString()
  validatedBy?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
