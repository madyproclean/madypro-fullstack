export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export type LineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPriceHT: number;
  vatRatePercent: number;
};

export type Quote = {
  id: string;
  number: string;
  siteId: string;
  site?: { name: string };
  interventionId?: string;
  label: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  notes?: string;
  status: QuoteStatus;
  issuedAt: string;
  dueAt?: string;
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
};
