import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSiteCategoryDto {
  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Prix HT d'un passage (préparation de la facture du mois). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceHT?: number | null;
}
