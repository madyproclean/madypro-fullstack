import React, { useEffect, useMemo, useState } from 'react';
import { Download, Send, X, Trash2, CreditCard, FileText } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { Invoice, InvoiceStatus, InvoicingKpis } from '../../types/invoice';
import {
  listInvoices,
  setInvoiceStatus,
  sendInvoice,
  deleteInvoice,
  recordInvoicePayment,
  draftInvoiceFromMissions,
} from '../../services/api/invoices.api';
import { listSites } from '../../services/api/sites.api';
import { Site } from '../../types/site';
import { getInvoicingReport } from '../../services/api/reports.api';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { formatDateTime } from '../../utils/datetime';
import { openPdfInNewTab } from '../../utils/downloadPdf';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { Wallet, Clock3, AlertTriangle, TrendingUp } from 'lucide-react';

const STATUS_OPTIONS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous statuts' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'SENT', label: 'Envoyée' },
  { value: 'PAID', label: 'Payée' },
  { value: 'CANCELLED', label: 'Annulée' },
];

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
};

export const InvoicesPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [kpis, setKpis] = useState<InvoicingKpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ siteId: string; status: InvoiceStatus | 'all' }>({
    siteId: 'all',
    status: 'all',
  });
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amountPaidHT: '', paymentMethod: '' });
  const [recordingPayment, setRecordingPayment] = useState(false);
  const previousMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [draft, setDraft] = useState({ siteId: '', month: previousMonth });
  const [drafting, setDrafting] = useState(false);

  /** Prépare la facture du mois en brouillon, à relire avant envoi. */
  const prepareMonthlyInvoice = async () => {
    if (!token || !draft.siteId) return;
    setDrafting(true);
    try {
      const invoice = await draftInvoiceFromMissions(token, draft.siteId, draft.month);
      notify(`Brouillon ${invoice.number} créé : relisez les prix avant de l’envoyer`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Préparation impossible', 'error');
    } finally {
      setDrafting(false);
    }
  };

  const load = () => {
    if (!token) return;
    setLoading(true);
    listInvoices(token, filters.siteId !== 'all' ? filters.siteId : undefined)
      .then(setInvoices)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les factures', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, filters.siteId]);

  useEffect(() => {
    if (!token) return;
    listSites(token, { pageSize: 200 })
      .then((data) => setSites(data.items))
      .catch(() => setSites([]));
    getInvoicingReport(token)
      .then(setKpis)
      .catch(() => setKpis(null));
  }, [token]);

  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => filters.status === 'all' || invoice.status === filters.status),
    [invoices, filters.status],
  );

  const refreshKpis = () => {
    if (!token) return;
    getInvoicingReport(token)
      .then(setKpis)
      .catch(() => undefined);
  };

  const downloadPdf = async (invoice: Invoice) => {
    if (!token) return;
    try {
      await openPdfInNewTab(token, `invoices/${invoice.id}/pdf`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Téléchargement du PDF impossible', 'error');
    }
  };

  const emailInvoice = async (invoice: Invoice) => {
    if (!token) return;
    if (!invoice.clientEmail) {
      notify('Aucun email client renseigné sur cette facture', 'error');
      return;
    }
    try {
      await sendInvoice(token, invoice.id);
      notify('Facture envoyée par email');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Envoi de l'email impossible", 'error');
    }
  };

  const cancelInvoice = async (invoice: Invoice) => {
    if (!token) return;
    try {
      await setInvoiceStatus(token, invoice.id, 'CANCELLED');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Annulation impossible', 'error');
    }
  };

  const removeInvoice = async (invoice: Invoice) => {
    if (!token) return;
    try {
      await deleteInvoice(token, invoice.id);
      notify('Facture supprimée');
      load();
      refreshKpis();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  };

  const openPaymentModal = (invoice: Invoice) => {
    setPaymentTarget(invoice);
    setPaymentForm({ amountPaidHT: String(invoice.amountPaidHT || invoice.totalTTC), paymentMethod: invoice.paymentMethod ?? '' });
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !paymentTarget) return;
    const amount = Number(paymentForm.amountPaidHT);
    if (!Number.isFinite(amount) || amount < 0) {
      notify('Montant invalide', 'error');
      return;
    }
    setRecordingPayment(true);
    try {
      await recordInvoicePayment(token, paymentTarget.id, {
        amountPaidHT: amount,
        paymentMethod: paymentForm.paymentMethod || undefined,
      });
      notify('Paiement enregistré');
      setPaymentTarget(null);
      load();
      refreshKpis();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Enregistrement du paiement impossible', 'error');
    } finally {
      setRecordingPayment(false);
    }
  };

  return (
    <div>
      <PageHeader title="Factures clients" subtitle="Suivez vos factures, relances et encaissements." />

      <div className="panel" style={{ margin: '1rem 0', display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <strong>Préparer la facture du mois</strong>
          <p className="card__meta" style={{ margin: '0.25rem 0 0' }}>
            Une ligne par prestation, avec le nombre de passages réalisés et le prix du passage du site. Créée en brouillon.
          </p>
        </div>
        <label className="filter-field">
          Site
          <select value={draft.siteId} onChange={(e) => setDraft((d) => ({ ...d, siteId: e.target.value }))}>
            <option value="">Choisir…</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          Mois
          <input type="month" value={draft.month} onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))} />
        </label>
        <Button type="button" icon={FileText} loading={drafting} disabled={!draft.siteId || !draft.month} onClick={prepareMonthlyInvoice}>
          Préparer le brouillon
        </Button>
      </div>

      {kpis && (
        <div className="page-grid" style={{ marginBottom: '1.5rem' }}>
          <StatCard icon={Wallet} badgeTone="blue" value={`${kpis.revenueThisMonth.toFixed(2)} €`} label="CA facturé (mois)" />
          <StatCard icon={Clock3} badgeTone="yellow" value={`${kpis.pendingAmount.toFixed(2)} €`} label="En attente" />
          <StatCard icon={AlertTriangle} badgeTone="red" value={`${kpis.overdueAmount.toFixed(2)} €`} label="En retard" />
          <StatCard
            icon={TrendingUp}
            badgeTone="green"
            value={kpis.conversionRate === null ? '—' : `${kpis.conversionRate}%`}
            label="Taux de conversion devis"
          />
        </div>
      )}

      <div className="filter-grid" role="search">
        <label className="filter-field filter-card">
          Site
          <select value={filters.siteId} onChange={(event) => setFilters((prev) => ({ ...prev, siteId: event.target.value }))}>
            <option value="all">Tous les sites</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-card">
          Statut
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as InvoiceStatus | 'all' }))}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="panel">
        <h3>Factures</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : filteredInvoices.length === 0 ? (
          <p className="card__meta">Aucune facture.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="factures">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Site</th>
                  <th>Libellé</th>
                  <th>Total TTC</th>
                  <th>Payé</th>
                  <th>Statut</th>
                  <th>Échéance</th>
                  <th>Émise le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{invoice.clientName}</td>
                    <td>{invoice.site?.name ?? invoice.siteId}</td>
                    <td>{invoice.label}</td>
                    <td>{invoice.totalTTC.toFixed(2)} €</td>
                    <td>{invoice.amountPaidHT.toFixed(2)} €</td>
                    <td>
                      <Badge
                        tone={
                          invoice.status === 'PAID'
                            ? 'success'
                            : invoice.isOverdue
                            ? 'danger'
                            : invoice.status === 'CANCELLED'
                            ? 'info'
                            : 'warning'
                        }
                      >
                        {invoice.isOverdue ? 'En retard' : STATUS_LABELS[invoice.status]}
                      </Badge>
                    </td>
                    <td>{invoice.dueAt ? invoice.dueAt.slice(0, 10) : '—'}</td>
                    <td>{formatDateTime(invoice.issuedAt)}</td>
                    <td>
                      <div className="table-actions">
                        <Button type="button" variant="ghost" className="btn--compact" icon={Download} onClick={() => downloadPdf(invoice)}>
                          PDF
                        </Button>
                        {invoice.status === 'DRAFT' && (
                          <Button type="button" variant="ghost" className="btn--compact" icon={Send} onClick={() => emailInvoice(invoice)}>
                            Envoyer par email
                          </Button>
                        )}
                        {(invoice.status === 'SENT' || invoice.status === 'DRAFT') && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="btn--compact"
                            icon={CreditCard}
                            onClick={() => openPaymentModal(invoice)}
                          >
                            Paiement
                          </Button>
                        )}
                        {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && (
                          <Button type="button" variant="ghost" className="btn--compact" icon={X} onClick={() => cancelInvoice(invoice)}>
                            Annuler
                          </Button>
                        )}
                        <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeInvoice(invoice)}>
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)} maxWidth={420} labelledBy="payment-modal-title">
        <form onSubmit={submitPayment}>
          <ModalHeader
            eyebrow="Facturation"
            title={`Paiement — ${paymentTarget?.number ?? ''}`}
            titleId="payment-modal-title"
            onClose={() => setPaymentTarget(null)}
          />
          <ModalBody>
            <p className="card__meta">Total TTC dû : {paymentTarget?.totalTTC.toFixed(2)} €</p>
            <Input
              id="paymentAmount"
              label="Montant réglé (€)"
              type="number"
              min={0}
              step="0.01"
              value={paymentForm.amountPaidHT}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, amountPaidHT: event.target.value }))}
            />
            <Input
              id="paymentMethod"
              label="Moyen de paiement"
              placeholder="Virement, chèque, CB..."
              value={paymentForm.paymentMethod}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
            />
          </ModalBody>
          <ModalFooter>
            <Button type="submit" icon={CreditCard} loading={recordingPayment}>
              Enregistrer le paiement
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
};
