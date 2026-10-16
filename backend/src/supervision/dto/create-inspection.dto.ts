import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class InspectionItemDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  @IsIn(['GOOD', 'AVERAGE', 'POOR'])
  rating!: 'GOOD' | 'AVERAGE' | 'POOR';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class CreateInspectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items!: InspectionItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  interventionId?: string;
}
