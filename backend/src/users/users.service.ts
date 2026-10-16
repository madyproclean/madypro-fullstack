import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../notifications/mailer.service';

type PublicUser = Omit<UserEntity, 'password' | 'twoFactorSecret'> & { name: string };

// crypto.randomBytes (pas Math.random, un PRNG non cryptographique) : ce mot de passe généré est
// un vrai secret temporaire, au même titre que les tokens de reset (auth.service.ts).
const generatePassword = () => randomBytes(8).toString('base64url');

interface UserFilters {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private users: UserEntity[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit() {
    await this.syncFromDatabase();
  }

  private async syncFromDatabase() {
    const records = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    this.users = records.map((record) => this.mapRecord(record));
  }

  private mapRecord(record: User): UserEntity {
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email,
      role: record.role,
      phone: record.phone ?? '',
      address: record.address ?? undefined,
      latitude: record.latitude ?? undefined,
      longitude: record.longitude ?? undefined,
      password: record.password,
      active: record.active,
      twoFactorSecret: (record as any).twoFactorSecret ?? undefined,
      twoFactorEnabled: (record as any).twoFactorEnabled ?? false,
      permissions: (record as any).permissions ?? [],
    };
  }

  private upsertCache(user: UserEntity) {
    const index = this.users.findIndex((item) => item.id === user.id);
    if (index === -1) {
      this.users.push(user);
    } else {
      this.users[index] = user;
    }
  }

  private normalizeRole(role?: string): Role {
    const fallback: Role = Role.AGENT;
    if (!role) {
      return fallback;
    }
    const formatted = role.toUpperCase() as Role;
    if ((Object.values(Role) as string[]).includes(formatted)) {
      return formatted;
    }
    return fallback;
  }

  private toPublic(user: UserEntity): PublicUser {
    const { password, twoFactorSecret, ...rest } = user;
    return { ...rest, name: `${user.firstName} ${user.lastName}`.trim() };
  }

  findAll(filters: UserFilters = {}): { items: PublicUser[]; total: number; page: number; pageSize: number } {
    const { search, role, status, page = 1, pageSize = 20 } = filters;
    const filtered = this.users
      .filter((user) => {
        if (role && user.role.toLowerCase() !== role.toLowerCase()) return false;
        if (status === 'active' && !user.active) return false;
        if (status === 'inactive' && user.active) return false;
        if (search) {
          const target = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
          if (!target.includes(search.toLowerCase())) return false;
        }
        return true;
      });
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((user) => this.toPublic(user));
    return { items, total, page, pageSize };
  }

  findOne(id: string): PublicUser | undefined {
    const user = this.users.find((item) => item.id === id);
    return user ? this.toPublic(user) : undefined;
  }

  private ensureExists(id: string): UserEntity {
    const user = this.users.find((item) => item.id === id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async create(dto: CreateUserDto, actorId = 'system'): Promise<PublicUser> {
    const password = dto.password ?? generatePassword();
    const record = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: this.normalizeRole(dto.role),
        phone: dto.phone ?? '',
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        password: await bcrypt.hash(password, 10),
      },
    });
    const entity = this.mapRecord(record);
    this.upsertCache(entity);
    this.auditService.record({
      actorId,
      action: 'CREATE_USER',
      entityType: 'user',
      entityId: entity.id,
      details: `${entity.firstName} ${entity.lastName} (${entity.role})`,
    });
    await this.sendWelcomeEmail(entity, password);
    return this.toPublic(entity);
  }

  private async sendWelcomeEmail(user: UserEntity, password: string) {
    const webUrl = process.env.WEB_APP_URL || 'https://app.madyproclean.com';
    const roleLabel: Record<Role, string> = {
      ADMIN: 'administrateur',
      SUPERVISOR: 'superviseur',
      AGENT: 'agent',
    };
    const apkUrl = process.env.APK_DOWNLOAD_URL;
    const apkSection =
      user.role === 'AGENT' && apkUrl
        ? `<p>Téléchargez l'application mobile MadyPro Clean pour pointer vos interventions :<br/><a href="${apkUrl}">${apkUrl}</a></p>`
        : `<p>Accédez à l'espace ${roleLabel[user.role]} :<br/><a href="${webUrl}">${webUrl}</a></p>`;
    try {
      await this.mailer.send(
        user.email,
        'Bienvenue sur MadyPro Clean — vos identifiants de connexion',
        `<p>Bonjour ${user.firstName},</p>
<p>Un compte ${roleLabel[user.role]} a été créé pour vous sur MadyPro Clean.</p>
<p>
  Email : <strong>${user.email}</strong><br/>
  Mot de passe temporaire : <strong>${password}</strong>
</p>
<p>Merci de le changer dès votre première connexion.</p>
${apkSection}`,
      );
    } catch (err) {
      this.logger.warn(`Email de bienvenue non envoyé à ${user.email}: ${(err as Error).message}`);
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId = 'system'): Promise<PublicUser> {
    const user = this.ensureExists(id);
    const data: any = {};
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.email) data.email = dto.email;
    if (dto.role) data.role = this.normalizeRole(dto.role);
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);

    const changedFields = Object.keys(data).filter((k) => k !== 'password');
    const before: Record<string, unknown> = {};
    changedFields.forEach((field) => {
      before[field] = (user as any)[field];
    });

    const record = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });
    const updated = this.mapRecord(record);
    this.upsertCache(updated);
    const after: Record<string, unknown> = {};
    changedFields.forEach((field) => {
      after[field] = (updated as any)[field];
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_USER',
      entityType: 'user',
      entityId: updated.id,
      details: changedFields.join(', ') || undefined,
      before: changedFields.length ? before : undefined,
      after: changedFields.length ? after : undefined,
    });
    return this.toPublic(updated);
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, actorId = 'system'): Promise<PublicUser> {
    this.ensureExists(id);
    const record = await this.prisma.user.update({
      where: { id },
      data: { active: dto.active },
    });
    const updated = this.mapRecord(record);
    this.upsertCache(updated);
    this.auditService.record({
      actorId,
      action: 'UPDATE_USER_STATUS',
      entityType: 'user',
      entityId: updated.id,
      details: dto.active ? 'Réactivé' : 'Désactivé',
    });
    return this.toPublic(updated);
  }

  async resetPassword(id: string, password?: string, actorId = 'system') {
    this.ensureExists(id);
    const nextPassword = password ?? generatePassword();
    const hashed = await bcrypt.hash(nextPassword, 10);
    const record = await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });
    const updated = this.mapRecord(record);
    this.upsertCache(updated);
    this.auditService.record({
      actorId,
      action: 'RESET_USER_PASSWORD',
      entityType: 'user',
      entityId: updated.id,
    });
    return { password: nextPassword };
  }

  findEntityById(id: string): UserEntity {
    return this.ensureExists(id);
  }

  async updatePassword(id: string, newPassword: string) {
    const user = this.ensureExists(id);
    const hashed = await bcrypt.hash(newPassword, 10);
    const record = await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });
    const updated = this.mapRecord(record);
    this.upsertCache(updated);
    return this.toPublic(updated);
  }

  /** Insensible aux espaces autour et à la casse (saisie sur mobile : majuscule automatique, copier-coller). */
  findByEmail(email: string): UserEntity | undefined {
    const typed = email.trim();
    const wanted = typed.toLowerCase();
    return this.users.find((user) => user.email === typed) ?? this.users.find((user) => user.email.toLowerCase() === wanted);
  }

  async setPasswordResetToken(id: string, tokenHash: string | null, expiresAt: Date | null) {
    const record = await this.prisma.user.update({
      where: { id },
      data: { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: expiresAt },
    });
    this.upsertCache(this.mapRecord(record));
  }

  async consumePasswordResetToken(tokenHash: string): Promise<UserEntity | null> {
    const record = await this.prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: { gt: new Date() } },
    });
    return record ? this.mapRecord(record) : null;
  }

  async setPendingTwoFactorSecret(id: string, secret: string) {
    this.ensureExists(id);
    const record = await this.prisma.user.update({ where: { id }, data: { twoFactorSecret: secret } });
    this.upsertCache(this.mapRecord(record));
  }

  async enableTwoFactor(id: string) {
    this.ensureExists(id);
    const record = await this.prisma.user.update({ where: { id }, data: { twoFactorEnabled: true } });
    this.upsertCache(this.mapRecord(record));
  }

  async disableTwoFactor(id: string) {
    this.ensureExists(id);
    const record = await this.prisma.user.update({
      where: { id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    this.upsertCache(this.mapRecord(record));
  }

  async setPermissions(id: string, permissions: string[]) {
    this.ensureExists(id);
    const record = await this.prisma.user.update({ where: { id }, data: { permissions } });
    const updated = this.mapRecord(record);
    this.upsertCache(updated);
    return this.toPublic(updated);
  }
}
