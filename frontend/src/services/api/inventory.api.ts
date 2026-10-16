import { InventoryItem } from '../../types/inventory';
import { apiFetch } from './client';

export type CreateInventoryItemPayload = {
  siteId: string;
  name: string;
  barcode?: string;
  unit?: string;
  quantity?: number;
  minThreshold?: number;
};

export async function listInventory(token: string, siteId?: string) {
  const path = siteId ? `inventory?siteId=${encodeURIComponent(siteId)}` : 'inventory';
  return apiFetch<InventoryItem[]>({ path, token });
}

export async function listLowStockInventory(token: string) {
  return apiFetch<InventoryItem[]>({ path: 'inventory/low-stock', token });
}

export async function createInventoryItem(token: string, payload: CreateInventoryItemPayload) {
  return apiFetch<InventoryItem>({
    path: 'inventory',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function adjustInventoryItem(token: string, id: string, delta: number, reason?: string) {
  return apiFetch<InventoryItem>({
    path: `inventory/${id}/adjust`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ delta, ...(reason ? { reason } : {}) }) },
  });
}

export type InventoryMovement = {
  id: string;
  delta: number;
  quantityAfter: number;
  reason: string | null;
  userName: string | null;
  createdAt: string;
};

export async function listInventoryMovements(token: string, id: string) {
  return apiFetch<InventoryMovement[]>({ path: `inventory/${id}/movements`, token });
}

export async function deleteInventoryItem(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `inventory/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}
