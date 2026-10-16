import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustInventoryItemDto {
  @IsInt()
  delta!: number;

  /** Motif facultatif (consommation, réassort, inventaire). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
