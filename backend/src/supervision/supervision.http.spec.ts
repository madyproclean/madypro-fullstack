import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';
import { SupervisionInsightsService } from './supervision-insights.service';
import { SupervisionDirectoryService } from './supervision-directory.service';
import { ChatController } from '../chat/chat.controller';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * Routes de la tablette superviseur : pour chacune, un cas autorisé et un cas refusé, sur
 * l'application Nest réelle (routes, gardes, services) et une base simulée. Jeu de données :
 * `sup-1` a la charge de `site-a` où travaille `agent-1` ; `site-z` et `agent-9` sont à un autre.
 */
describe('Routes de la tablette superviseur (HTTP)', () => {
  const USERS: Record<string, { sub: string; role: string }> = {
    'sup-1': { sub: 'sup-1', role: 'SUPERVISOR' },
    'sup-empty': { sub: 'sup-empty', role: 'SUPERVISOR' },
    'admin-1': { sub: 'admin-1', role: 'ADMIN' },
    'agent-1': { sub: 'agent-1', role: 'AGENT' },
  };
  const agentRecord = (id: string) => ({
    id,
    firstName: 'Agent',
    lastName: id,
    phone: null,
    email: `${id}@x.test`,
    active: true,
    role: 'AGENT',
    certifications: [],
  });

  let app: INestApplication;
  const prisma = {
    siteSupervisor: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(where.userId === 'sup-1' ? [{ siteId: 'site-a' }] : [])),
    },
    interventionAssignment: {
      // Périmètre : agent-1 a déjà travaillé sur site-a.
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(where?.intervention?.siteId?.in?.includes('site-a') && !where.userId ? [{ userId: 'agent-1' }] : []),
      ),
    },
    intervention: {
      findMany: jest.fn((_args: any) => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    user: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(['agent-1', 'agent-9'].filter((id) => !where.id || where.id.in.includes(id)).map(agentRecord)),
      ),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(agentRecord(where.id))),
    },
    absence: { findMany: jest.fn(() => Promise.resolve([])) },
    certification: { groupBy: jest.fn(() => Promise.resolve([])) },
    site: {
      count: jest.fn(() => Promise.resolve(2)),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve({ id: where.id, name: where.id, address: '1 rue', categories: [], latitude: null, longitude: null }),
      ),
    },
    anomaly: { findMany: jest.fn(() => Promise.resolve([])) },
    chatMessage: {
      findMany: jest.fn(() => Promise.resolve([])),
      findFirst: jest.fn(() => Promise.resolve(null)),
      count: jest.fn(() => Promise.resolve(0)),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'm-1', ...data })),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
  const settings = { getSettings: () => ({ attendanceRules: { toleranceMinutes: 10 } }) };
  const usersService = {
    findAll: jest.fn(() => ({ items: [{ id: 'agent-1', name: 'Agent 1' }, { id: 'agent-9', name: 'Agent 9' }] })),
    findOne: jest.fn((id: string) => ({ id, name: id })),
  };
  const notifications = { send: jest.fn(), notifyAgentSupervisors: jest.fn() };
  const realtime = { broadcast: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupervisionController, ChatController],
      providers: [
        SupervisionService,
        SupervisionDirectoryService,
        SupervisionInsightsService,
        ChatService,
        SupervisorScopeService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: UsersService, useValue: usersService },
        { provide: NotificationsService, useValue: notifications },
        { provide: RealtimeService, useValue: realtime },
      ],
    })
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

  describe('GET /supervision/today', () => {
    it('répond au superviseur, sur ses seuls sites', async () => {
      const res = await sup.get('/supervision/today').expect(200);
      expect(res.body.siteCount).toBe(1);
      expect(prisma.intervention.findMany.mock.calls[0][0].where.siteId).toEqual({ in: ['site-a'] });
    });
    it('refuse un agent', () => as('agent-1').get('/supervision/today').expect(403));
  });

  describe('GET /supervision/agents', () => {
    it('ne liste que les agents de ses sites', async () => {
      const res = await sup.get('/supervision/agents').expect(200);
      expect(res.body.map((a: any) => a.id)).toEqual(['agent-1']);
    });
    it("renvoie une équipe vide à un superviseur sans site", async () => {
      const res = await as('sup-empty').get('/supervision/agents').expect(200);
      expect(res.body).toEqual([]);
    });
    it('refuse un agent', () => as('agent-1').get('/supervision/agents').expect(403));
  });

  describe('GET /supervision/agents/:id', () => {
    it('ouvre la fiche d’un agent de son équipe', () => sup.get('/supervision/agents/agent-1').expect(200));
    it('refuse la fiche d’un agent d’un autre superviseur', () => sup.get('/supervision/agents/agent-9').expect(403));
  });

  describe('GET /supervision/sites/:id', () => {
    it('ouvre la fiche de son site', async () => {
      const res = await sup.get('/supervision/sites/site-a').expect(200);
      expect(res.body.id).toBe('site-a');
    });
    it('refuse la fiche du site d’un autre', () => sup.get('/supervision/sites/site-z').expect(403));
  });

  describe('messagerie', () => {
    it('liste seulement les discussions de son équipe', async () => {
      prisma.chatMessage.findFirst.mockResolvedValue({ createdAt: new Date() } as any);
      const res = await sup.get('/chat/threads').expect(200);
      expect(res.body.map((t: any) => t.agent.id)).toEqual(['agent-1']);
    });
    it('lit la discussion d’un agent de son équipe, pas celle d’un autre', async () => {
      await sup.get('/chat/threads/agent-1').expect(200);
      await sup.get('/chat/threads/agent-9').expect(403);
    });
    it('écrit à son agent, jamais à un agent hors périmètre', async () => {
      await sup.post('/chat/threads/agent-1/messages').send({ body: 'Bonjour' }).expect(201);
      await sup.post('/chat/threads/agent-9/messages').send({ body: 'Bonjour' }).expect(403);
      expect(prisma.chatMessage.create).toHaveBeenCalledTimes(1);
    });
    it('marque lue la discussion de son agent seulement', async () => {
      await sup.patch('/chat/threads/agent-1/read').expect(200);
      await sup.patch('/chat/threads/agent-9/read').expect(403);
    });
    it("l'admin voit toutes les fiches", () => as('admin-1').get('/supervision/agents/agent-9').expect(200));
  });
});
