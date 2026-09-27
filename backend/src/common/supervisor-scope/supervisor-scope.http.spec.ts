import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { SupervisorScopeService } from './supervisor-scope.service';
import { UsersController } from '../../users/users.controller';
import { UsersService } from '../../users/users.service';
import { SitesController } from '../../sites/sites.controller';
import { SitesService } from '../../sites/sites.service';
import { InterventionsController } from '../../interventions/interventions.controller';
import { InterventionsService } from '../../interventions/interventions.service';
import { ApprovalsService } from '../../approvals/approvals.service';
import { AttendanceController } from '../../attendance/attendance.controller';
import { AttendanceService } from '../../attendance/attendance.service';
import { NotificationsController } from '../../notifications/notifications.controller';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditController } from '../../audit/audit.controller';
import { AuditService } from '../../audit/audit.service';
import { QuotesController } from '../../quotes/quotes.controller';
import { QuotesService } from '../../quotes/quotes.service';

/**
 * Tests HTTP du périmètre superviseur : l'application Nest réelle (routes, gardes, validation),
 * base simulée. Jeu de données : le superviseur `sup-1` a la charge de `site-a` où travaille
 * `agent-1` ; `site-z` et `agent-9` appartiennent à un autre superviseur.
 */
describe('Périmètre superviseur (HTTP)', () => {
  const USERS: Record<string, { sub: string; role: string }> = {
    'sup-1': { sub: 'sup-1', role: 'SUPERVISOR' },
    'admin-1': { sub: 'admin-1', role: 'ADMIN' },
    'agent-1': { sub: 'agent-1', role: 'AGENT' },
  };
  const ACCOUNTS: Record<string, { id: string; role: string }> = {
    'admin-1': { id: 'admin-1', role: 'ADMIN' },
    'sup-2': { id: 'sup-2', role: 'SUPERVISOR' },
    'agent-1': { id: 'agent-1', role: 'AGENT' },
    'agent-9': { id: 'agent-9', role: 'AGENT' },
    'agent-new': { id: 'agent-new', role: 'AGENT' },
  };
  const INTERVENTION_SITES: Record<string, string> = { 'int-a': 'site-a', 'int-z': 'site-z' };

  let app: INestApplication;
  const prisma = {
    siteSupervisor: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(where.userId === 'sup-1' ? [{ siteId: 'site-a' }] : []),
      ),
    },
    interventionAssignment: {
      findMany: jest.fn(() => Promise.resolve([{ userId: 'agent-1' }])),
      // agent-9 a déjà travaillé ailleurs ; agent-new n'a jamais été affecté.
      count: jest.fn(({ where }: any) => Promise.resolve(where.userId === 'agent-new' ? 0 : 3)),
    },
    intervention: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(INTERVENTION_SITES[where.id] ? { siteId: INTERVENTION_SITES[where.id] } : null),
      ),
    },
  };
  const usersService = {
    findAll: jest.fn(() => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    findOne: jest.fn((id: string) => ACCOUNTS[id]),
    create: jest.fn((dto: any) => ({ id: 'created', ...dto })),
    update: jest.fn((id: string) => ({ id })),
    updateStatus: jest.fn((id: string) => ({ id })),
    resetPassword: jest.fn(() => ({ password: 'x' })),
  };
  const sitesService = {
    findAll: jest.fn(() => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    findOne: jest.fn((id: string) => ({ id, supervisorIds: id === 'site-a' ? ['sup-1'] : ['sup-2'] })),
    update: jest.fn((id: string) => ({ id })),
    create: jest.fn(() => ({ id: 'new' })),
    getQrCode: jest.fn((id: string) => ({ id })),
  };
  const interventionsService = {
    list: jest.fn(() => ({ items: [], total: 0 })),
    findOne: jest.fn((id: string) => ({ id, siteId: INTERVENTION_SITES[id] })),
    getPlanning: jest.fn(() => []),
  };
  const approvals = { createRequest: jest.fn(() => ({ id: 'req-1' })) };
  const attendanceService = { getLiveMap: jest.fn(() => []), list: jest.fn(() => ({ items: [] })) };
  const notificationsService = { send: jest.fn(() => ({ id: 'n-1' })), feed: jest.fn(() => []) };
  const auditService = { list: jest.fn(() => ({ items: [] })) };
  const quotesService = { findAll: jest.fn(() => []) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        UsersController,
        SitesController,
        InterventionsController,
        AttendanceController,
        NotificationsController,
        AuditController,
        QuotesController,
      ],
      providers: [
        SupervisorScopeService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: SitesService, useValue: sitesService },
        { provide: InterventionsService, useValue: interventionsService },
        { provide: ApprovalsService, useValue: approvals },
        { provide: AttendanceService, useValue: attendanceService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AuditService, useValue: auditService },
        { provide: QuotesService, useValue: quotesService },
      ],
    })
      // L'utilisateur « connecté » est choisi par l'en-tête x-test-user (le JWT est testé ailleurs).
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = USERS[req.headers['x-test-user']];
          return !!req.user;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-test-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-test-user', user),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-test-user', user),
  });
  const sup = as('sup-1');

  describe('comptes (point 1)', () => {
    const agent = { firstName: 'A', lastName: 'B', email: 'a@b.fr', role: 'AGENT' };

    it('crée un compte agent mais jamais un compte administrateur ou superviseur', async () => {
      await sup.post('/users').send(agent).expect(201);
      await sup.post('/users').send({ ...agent, role: 'ADMIN' }).expect(403);
      await sup.post('/users').send({ ...agent, role: 'SUPERVISOR' }).expect(403);
      expect(usersService.create).toHaveBeenCalledTimes(1);
    });

    it("réinitialise le mot de passe d'un agent de son équipe, pas celui d'un admin ni d'un autre agent", async () => {
      await sup.post('/users/agent-1/reset-password').send({}).expect(201);
      await sup.post('/users/admin-1/reset-password').send({}).expect(403);
      await sup.post('/users/agent-9/reset-password').send({}).expect(403);
      expect(usersService.resetPassword).toHaveBeenCalledTimes(1);
    });

    it("finalise un agent jamais affecté (qu'il vient de créer)", async () => {
      await sup.patch('/users/agent-new/status').send({ active: false }).expect(200);
    });

    it("ne promeut jamais un agent et ne modifie pas un autre superviseur", async () => {
      await sup.patch('/users/agent-1').send({ role: 'ADMIN' }).expect(403);
      await sup.patch('/users/sup-2').send({ firstName: 'X' }).expect(403);
      await sup.patch('/users/agent-1').send({ firstName: 'X' }).expect(200);
    });

    it('ne voit que des comptes agents', async () => {
      const res = await sup.get('/users?role=ADMIN').expect(200);
      expect(res.body.items).toEqual([]);
      expect(usersService.findAll).not.toHaveBeenCalled();
      await sup.get('/users').expect(200);
      expect(usersService.findAll).toHaveBeenCalledWith(expect.objectContaining({ role: 'AGENT' }));
      await sup.get('/users/admin-1').expect(403);
      await sup.get('/users/agent-1').expect(200);
    });

    it("laisse l'admin gérer tous les comptes", async () => {
      await as('admin-1').post('/users').send({ ...agent, role: 'ADMIN' }).expect(201);
      await as('admin-1').post('/users/admin-1/reset-password').send({}).expect(201);
    });
  });

  describe('sites (points 2 à 4)', () => {
    it('liste uniquement ses sites', async () => {
      await sup.get('/sites').expect(200);
      expect(sitesService.findAll).toHaveBeenCalledWith(expect.objectContaining({ siteIds: ['site-a'] }));
      await as('admin-1').get('/sites').expect(200);
      expect(sitesService.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ siteIds: null }));
    });

    it("lit et modifie son site, refuse celui d'un autre", async () => {
      await sup.get('/sites/site-a/qr-code').expect(200);
      await sup.get('/sites/site-z/qr-code').expect(403);
      await sup.patch('/sites/site-a').send({ name: 'Nouveau nom' }).expect(200);
      await sup.patch('/sites/site-z').send({ name: 'Nouveau nom' }).expect(403);
      expect(sitesService.update).toHaveBeenCalledTimes(1);
    });

    it("ne change pas les superviseurs d'un site", async () => {
      await sup.patch('/sites/site-a').send({ supervisorIds: ['sup-1', 'sup-2'] }).expect(403);
      await sup.patch('/sites/site-a').send({ supervisorIds: ['sup-1'] }).expect(200);
    });

    it("ne crée pas de site (réservé à l'admin)", async () => {
      await sup.post('/sites').send({ name: 'S', address: 'A' }).expect(403);
      await as('admin-1').post('/sites').send({ name: 'S', address: 'A' }).expect(201);
    });
  });

  describe('interventions (points 2 et 3)', () => {
    it('filtre la liste et le planning sur ses sites', async () => {
      await sup.get('/interventions').expect(200);
      expect(interventionsService.list).toHaveBeenCalledWith(expect.objectContaining({ siteIds: ['site-a'] }));
      await sup.get('/interventions/planning?startDate=2026-09-01&endDate=2026-09-07').expect(200);
      expect(interventionsService.getPlanning).toHaveBeenCalledWith(expect.objectContaining({ siteIds: ['site-a'] }));
    });

    it("ouvre une intervention de son site, refuse celle d'un autre", async () => {
      await sup.get('/interventions/int-a').expect(200);
      await sup.get('/interventions/int-z').expect(403);
      await as('admin-1').get('/interventions/int-z').expect(200);
    });

    it('demande une création sur son site, jamais sur un site hors périmètre', async () => {
      const body = { type: 'REGULAR', date: '2026-10-01', startTime: '08:00', endTime: '10:00', agentIds: [] };
      await sup.post('/interventions').send({ ...body, siteId: 'site-z' }).expect(403);
      expect(approvals.createRequest).not.toHaveBeenCalled();
      await sup.post('/interventions').send({ ...body, siteId: 'site-a' }).expect(201);
      expect(approvals.createRequest).toHaveBeenCalledTimes(1);
    });

    it("n'annule pas une intervention d'un autre site", async () => {
      await sup.post('/interventions/int-z/cancel').send({ observation: 'x' }).expect(403);
      await sup.post('/interventions/int-a/cancel').send({ observation: 'x' }).expect(201);
    });

    it("limite toujours un agent à ses propres interventions", async () => {
      await as('agent-1').get('/interventions?agentId=agent-9').expect(200);
      expect(interventionsService.list).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agent-1' }));
    });
  });

  describe('carte temps réel', () => {
    it('ne montre que les agents de ses sites', async () => {
      await sup.get('/attendance/live-map').expect(200);
      expect(attendanceService.getLiveMap).toHaveBeenCalledWith(['site-a']);
    });
  });

  describe('notifications', () => {
    it("écrit à son équipe mais pas à toute l'entreprise", async () => {
      await sup
        .post('/notifications')
        .send({ title: 'T', message: 'M', audience: 'SITE_AGENTS', targetId: 'site-a' })
        .expect(201);
      await sup
        .post('/notifications')
        .send({ title: 'T', message: 'M', audience: 'SITE_AGENTS', targetId: 'site-z' })
        .expect(403);
      await sup.post('/notifications').send({ title: 'T', message: 'M', audience: 'ALL_AGENTS' }).expect(403);
      expect(notificationsService.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("réservé à l'administrateur (point 4)", () => {
    it("refuse journal d'activité et devis au superviseur", async () => {
      await sup.get('/audit').expect(403);
      await sup.get('/quotes').expect(403);
      await as('admin-1').get('/quotes').expect(200);
    });
  });
});
