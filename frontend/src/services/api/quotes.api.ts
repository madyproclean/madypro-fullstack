import { LineItem, Quote, QuoteStatus } from '../../types/quote';
import { apiFetch } from './client';

export type CreateQuotePayload = {
  siteId: string;
  interventionId?: string;
  label: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  notes?: string;
  dueAt?: string;
  documentUrl?: string;
  lineItems: LineItem[];
};

export type UpdateQuotePayload = Partial<Omit<CreateQuotePayload, 'siteId' | 'interventionId'>>;

export async function listQuotes(token: string, siteId?: string) {
  const path = siteId ? `quotes?siteId=${encodeURIComponent(siteId)}` : 'quotes';
  return apiFetch<Quote[]>({ path, token });
}

export async function createQuote(token: string, payload: CreateQuotePayload) {
  return apiFetch<Quote>({
    path: 'quotes',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function updateQuote(token: string, id: string, payload: UpdateQuotePayload) {
  return apiFetch<Quote>({
    path: `quotes/${id}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}

export async function setQuoteStatus(token: string, id: string, status: QuoteStatus) {
  return apiFetch<Quote>({
    path: `quotes/${id}/status`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ status }) },
  });
}

export async function deleteQuote(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `quotes/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}

export async function sendQuote(token: string, id: string) {
  return apiFetch<Quote>({
    path: `quotes/${id}/send`,
    token,
    options: { method: 'POST' },
  });
}

export async function convertQuoteToInvoice(token: string, id: string) {
  return apiFetch<{ id: string; number: string }>({
    path: `quotes/${id}/convert-to-invoice`,
    token,
    options: { method: 'POST' },
  });
}
