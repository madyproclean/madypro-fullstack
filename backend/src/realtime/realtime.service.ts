import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { WebhooksService } from '../webhooks/webhooks.service';

/** Périmètre d'un superviseur connecté : `null` = reçoit tout (admin). */
export type ClientScope = { siteIds: Set<string>; agentIds: Set<string> } | null;

type Client = {
  id: string;
  res: Response;
  scope: ClientScope;
};

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private clients = new Set<Client>();

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * `scope` est figé à la connexion : un changement d'affectation de sites est pris en compte à la
   * reconnexion suivante (le client web se reconnecte automatiquement).
   */
  addClient(res: Response, clientId: string, scope: ClientScope = null) {
    const client: Client = { res, id: clientId, scope };
    this.clients.add(client);
    res.on('close', () => {
      this.clients.delete(client);
    });
    this.logger.debug(`Client ${clientId} connected (total ${this.clients.size})`);
    res.write(`event: connected\ndata: "${clientId}"\n\n`);
  }

  /**
   * Un superviseur ne reçoit que les événements de ses sites, ou concernant ses agents / lui-même.
   * Un événement sans aucune de ces informations ne lui est pas envoyé.
   */
  private isVisibleTo(client: Client, payload: any): boolean {
    if (!client.scope) return true;
    const siteId = payload?.siteId;
    if (siteId) return client.scope.siteIds.has(siteId);
    const people = [payload?.userId, payload?.threadUserId, payload?.senderId].filter(Boolean);
    return people.some((id: string) => id === client.id || client.scope!.agentIds.has(id));
  }

  broadcast(event: string, payload: any) {
    const data = JSON.stringify(payload ?? {});
    for (const client of this.clients) {
      if (!this.isVisibleTo(client, payload)) continue;
      client.res.write(`event: ${event}\ndata: ${data}\n\n`);
    }
    this.webhooksService.dispatch(event, payload).catch((error) => {
      this.logger.warn(`Échec dispatch webhooks pour ${event}: ${error.message}`);
    });
  }
}
