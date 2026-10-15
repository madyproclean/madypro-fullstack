import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTemplateExceptionDto {
  @IsString()
  stopId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date invalide' })
  date!: string;

  @IsIn(['CANCEL', 'REPLACE_AGENTS'])
  kind!: 'CANCEL' | 'REPLACE_AGENTS';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
