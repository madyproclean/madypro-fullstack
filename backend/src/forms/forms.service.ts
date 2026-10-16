import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.customForm.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  create(dto: CreateFormDto) {
    return this.prisma.customForm.create({ data: { name: dto.name, fields: dto.fields as any } });
  }

  async archive(id: string) {
    const existing = await this.prisma.customForm.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Formulaire introuvable');
    }
    await this.prisma.customForm.update({ where: { id }, data: { active: false } });
    return { archived: true };
  }

  async submit(formId: string, submittedBy: string, dto: SubmitFormDto) {
    const form = await this.prisma.customForm.findUnique({ where: { id: formId } });
    if (!form) {
      throw new NotFoundException('Formulaire introuvable');
    }
    return this.prisma.customFormSubmission.create({
      data: {
        formId,
        submittedBy,
        data: dto.data as any,
        interventionId: dto.interventionId,
        siteId: dto.siteId,
      },
    });
  }

  /** `siteIds` restreint au périmètre d'un superviseur (réponses rattachées à ses sites). */
  findSubmissions(formId: string, siteIds: string[] | null = null) {
    return this.prisma.customFormSubmission.findMany({
      where: { formId, ...(siteIds ? { siteId: { in: siteIds } } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
