import { Anomaly, AnomalyStatus } from '../../types/anomaly';
import { apiFetch } from './client';

export async function listAnomalies(token: string, interventionId: string) {
  const data = await apiFetch<any[]>({
    path: `/anomalies/${interventionId}`,
    token,
  });
  return data.map((item) => {
    const fallbackName = `${item.user?.firstName ?? ''} ${item.user?.lastName ?? ''}`.trim();
    const name = item.user?.name ?? (fallbackName.length ? fallbackName : 'Inconnu');
    return {
      id: item.id,
      interventionId: item.interventionId,
      user: { id: item.userId, name },
      type: item.type,
      title: item.title ?? undefined,
      description: item.description,
      photos: item.photos ?? [],
      status: item.status as AnomalyStatus,
      createdAt: item.createdAt,
    };
  }) as Anomaly[];
}

export async function createAnomaly(
  token: string,
  payload: { interventionId: string; type: string; description: string; title?: string; photos?: string[] },
) {
  return apiFetch<Anomaly>({
    path: '/anomalies',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateAnomalyStatus(token: string, id: string, status: AnomalyStatus) {
  return apiFetch<Anomaly>({
    path: `/anomalies/${id}/status`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  });
}
