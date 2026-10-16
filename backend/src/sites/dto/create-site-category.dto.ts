import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSiteCategoryDto {
  @IsString()
  categoryId!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Prix HT d'un passage (préparation de la facture du mois). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceHT?: number | null;
}
