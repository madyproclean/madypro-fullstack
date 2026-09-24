import { LineItem } from '../../types/quote';
import { Invoice, InvoiceStatus } from '../../types/invoice';
import { apiFetch } from './client';

export type CreateInvoicePayload = {
  siteId: string;
  quoteId?: string;
  label: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  notes?: string;
  dueAt?: string;
  lineItems: LineItem[];
};

export type UpdateInvoicePayload = Partial<Omit<CreateInvoicePayload, 'siteId' | 'quoteId'>>;

export async function listInvoices(token: string, siteId?: string) {
  const path = siteId ? `invoices?siteId=${encodeURIComponent(siteId)}` : 'invoices';
  return apiFetch<Invoice[]>({ path, token });
}

export async function createInvoice(token: string, payload: CreateInvoicePayload) {
  return apiFetch<Invoice>({
    path: 'invoices',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function updateInvoice(token: string, id: string, payload: UpdateInvoicePayload) {
  return apiFetch<Invoice>({
    path: `invoices/${id}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}

export async function setInvoiceStatus(token: string, id: string, status: InvoiceStatus) {
  return apiFetch<Invoice>({
    path: `invoices/${id}/status`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ status }) },
  });
}

export async function sendInvoice(token: string, id: string) {
  return apiFetch<Invoice>({
    path: `invoices/${id}/send`,
    token,
    options: { method: 'POST' },
  });
}

export async function recordInvoicePayment(
  token: string,
  id: string,
  payload: { amountPaidHT: number; paymentMethod?: string; paidAt?: string },
) {
  return apiFetch<Invoice>({
    path: `invoices/${id}/payment`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}

export async function deleteInvoice(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `invoices/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}
