import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** `siteIds` restreint au périmètre d'un superviseur ; un site explicite hors périmètre ne renvoie rien. */
  findAll(siteId?: string, siteIds: string[] | null = null) {
    const siteFilter = siteIds ? (siteId ? (siteIds.includes(siteId) ? siteId : '__none__') : { in: siteIds }) : siteId;
    return this.prisma.inventoryItem.findMany({
      where: siteFilter ? { siteId: siteFilter } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findLowStock(siteIds: string[] | null = null) {
    const items = await this.prisma.inventoryItem.findMany({
      where: siteIds ? { siteId: { in: siteIds } } : undefined,
      include: { site: { select: { id: true, name: true } } },
      orderBy: { quantity: 'asc' },
    });
    return items.filter((item) => item.quantity <= item.minThreshold);
  }

  async findByBarcode(barcode: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { barcode } });
    if (!item) {
      throw new NotFoundException('Article introuvable pour ce code-barres');
    }
    return item;
  }

  async getSiteId(id: string): Promise<string> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id }, select: { siteId: true } });
    if (!item) {
      throw new NotFoundException('Article introuvable');
    }
    return item.siteId;
  }

  create(dto: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({
      data: {
        siteId: dto.siteId,
        name: dto.name,
        barcode: dto.barcode,
        unit: dto.unit ?? 'unité',
        quantity: dto.quantity ?? 0,
        minThreshold: dto.minThreshold ?? 0,
      },
    });
  }

  async adjustQuantity(id: string, delta: number) {
    // Compare-and-swap sur la quantité observée : deux ajustements concurrents (deux agents qui
    // scannent le même article) ne doivent jamais s'écraser l'un l'autre (lecture-puis-écriture
    // naïve perdrait silencieusement un décrément).
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.prisma.inventoryItem.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Article introuvable');
      }
      const nextQuantity = Math.max(0, existing.quantity + delta);
      const result = await this.prisma.inventoryItem.updateMany({
        where: { id, quantity: existing.quantity },
        data: { quantity: nextQuantity },
      });
      if (result.count > 0) {
        return this.prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
      }
    }
    throw new BadRequestException('Ajustement impossible (article modifié en parallèle), réessayez.');
  }

  async remove(id: string) {
    const existing = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Article introuvable');
    }
    await this.prisma.inventoryItem.delete({ where: { id } });
    return { deleted: true };
  }
}
