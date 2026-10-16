import { IsNumber, IsNotEmpty, IsString, IsOptional, Max, Min } from 'class-validator';

export class LineItemDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPriceHT!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;
}
