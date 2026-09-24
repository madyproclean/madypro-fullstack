import { LineItem } from './quote';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';

export type Invoice = {
  id: string;
  number: string;
  siteId: string;
  site?: { name: string };
  quoteId?: string;
  label: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  notes?: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  amountPaidHT: number;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
  isOverdue: boolean;
};

export type InvoicingKpis = {
  revenueThisMonth: number;
  pendingAmount: number;
  overdueAmount: number;
  conversionRate: number | null;
  quotesThisMonth: number;
};
