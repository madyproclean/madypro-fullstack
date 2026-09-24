import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LineItemDto } from '../../documents/dto/line-item.dto';

export class CreateInvoiceDto {
  @IsString()
  siteId!: string;

  @IsOptional()
  @IsString()
  quoteId?: string;

  @IsString()
  label!: string;

  @IsString()
  clientName!: string;

  @IsOptional()
  @IsString()
  clientAddress?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];
}
