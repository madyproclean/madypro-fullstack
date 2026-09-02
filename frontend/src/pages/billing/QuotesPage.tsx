import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check, X, Trash2, Download, Send, FileOutput } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { Quote, QuoteStatus } from '../../types/quote';
import {
  listQuotes,
  createQuote,
  setQuoteStatus,
  deleteQuote,
  sendQuote,
  convertQuoteToInvoice,
  CreateQuotePayload,
} from '../../services/api/quotes.api';
import { listSites } from '../../services/api/sites.api';
import { Site } from '../../types/site';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { LineItemsEditor } from '../../components/billing/LineItemsEditor';
import { emptyLineItem } from '../../utils/lineItems';
import { formatDateTime } from '../../utils/datetime';
import { openPdfInNewTab } from '../../utils/downloadPdf';

const STATUS_OPTIONS: { value: QuoteStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous statuts' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'SENT', label: 'Envoyé' },
  { value: 'ACCEPTED', label: 'Accepté' },
  { value: 'REJECTED', label: 'Refusé' },
  { value: 'CANCELLED', label: 'Annulé' },
];

const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  ACCEPTED: 'Accepté',
  REJECTED: 'Refusé',
  CANCELLED: 'Annulé',
};

const defaultForm: CreateQuotePayload = {
  siteId: '',
  label: '',
  clientName: '',
  clientAddress: '',
  clientEmail: '',
  dueAt: '',
  lineItems: [emptyLineItem()],
};

export const QuotesPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ siteId: string; status: QuoteStatus | 'all' }>({ siteId: 'all', status: 'all' });
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<CreateQuotePayload>(defaultForm);
  const [creating, setCreating] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listQuotes(token, filters.siteId !== 'all' ? filters.siteId : undefined)
      .then(setQuotes)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les devis', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, filters.siteId]);

  useEffect(() => {
    if (!token) return;
    listSites(token, { pageSize: 200 })
      .then((data) => setSites(data.items))
      .catch(() => setSites([]));
  }, [token]);

  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => filters.status === 'all' || quote.status === filters.status),
    [quotes, filters.status],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const validLines = form.lineItems.filter((l) => l.description.trim());
    if (!token || !form.siteId || !form.label.trim() || !form.clientName.trim() || !validLines.length) {
      notify('Site, libellé, client et au moins une ligne sont requis', 'error');
      return;
    }
    setCreating(true);
    try {
      await createQuote(token, { ...form, label: form.label.trim(), dueAt: form.dueAt || undefined, lineItems: validLines });
      notify('Devis créé');
      setForm(defaultForm);
      setFormVisible(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error');
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (quote: Quote, status: QuoteStatus) => {
    if (!token) return;
    try {
      await setQuoteStatus(token, quote.id, status);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'error');
    }
  };

  const removeQuote = async (quote: Quote) => {
    if (!token) return;
    try {
      await deleteQuote(token, quote.id);
      notify('Devis supprimé');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  };

  const downloadPdf = async (quote: Quote) => {
    if (!token) return;
    try {
      await openPdfInNewTab(token, `quotes/${quote.id}/pdf`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Téléchargement du PDF impossible', 'error');
    }
  };

  const emailQuote = async (quote: Quote) => {
    if (!token) return;
    if (!quote.clientEmail) {
      notify('Aucun email client renseigné sur ce devis', 'error');
      return;
    }
    try {
      await sendQuote(token, quote.id);
      notify('Devis envoyé par email');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Envoi de l'email impossible", 'error');
    }
  };

  const convertToInvoice = async (quote: Quote) => {
    if (!token) return;
    try {
      const invoice = await convertQuoteToInvoice(token, quote.id);
      notify(`Facture ${invoice.number} créée`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Conversion impossible', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Devis & facturation</span>
        <h2>Devis clients</h2>
        <p>Suivez vos devis du brouillon jusqu’à l’acceptation.</p>
        <Button type="button" icon={Plus} onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? 'Fermer' : 'Nouveau devis'}
        </Button>
      </div>

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
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as QuoteStatus | 'all' }))}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {formVisible && (
        <form className="form-card form-card--wide" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
          <Select
            id="quoteSite"
            label="Site"
            options={sites.map((site) => ({ value: site.id, label: site.name }))}
            value={form.siteId}
            onChange={(event) => setForm((prev) => ({ ...prev, siteId: event.target.value }))}
          />
          <Input
            id="quoteLabel"
            label="Libellé"
            placeholder="Nettoyage de fin de chantier"
            value={form.label}
            onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
          />
          <div className="form-row">
            <Input
              id="quoteClientName"
              label="Client (raison sociale)"
              placeholder="SARL Exemple"
              value={form.clientName}
              onChange={(event) => setForm((prev) => ({ ...prev, clientName: event.target.value }))}
            />
            <Input
              id="quoteClientEmail"
              label="Email client"
              type="email"
              placeholder="contact@client.fr"
              value={form.clientEmail}
              onChange={(event) => setForm((prev) => ({ ...prev, clientEmail: event.target.value }))}
            />
          </div>
          <Input
            id="quoteClientAddress"
            label="Adresse de facturation client"
            value={form.clientAddress}
            onChange={(event) => setForm((prev) => ({ ...prev, clientAddress: event.target.value }))}
          />
          <Input
            id="quoteDueAt"
            label="Échéance"
            type="date"
            value={form.dueAt}
            onChange={(event) => setForm((prev) => ({ ...prev, dueAt: event.target.value }))}
          />

          <p className="card__meta" style={{ marginTop: '0.5rem' }}>
            Lignes
          </p>
          <LineItemsEditor items={form.lineItems} onChange={(lineItems) => setForm((prev) => ({ ...prev, lineItems }))} />

          <div className="form-actions">
            <Button type="submit" icon={Plus} loading={creating}>
              Créer le devis
            </Button>
          </div>
        </form>
      )}

      <section className="panel">
        <h3>Devis</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : filteredQuotes.length === 0 ? (
          <p className="card__meta">Aucun devis.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="devis">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Site</th>
                  <th>Libellé</th>
                  <th>Total TTC</th>
                  <th>Statut</th>
                  <th>Échéance</th>
                  <th>Émis le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>{quote.number}</td>
                    <td>{quote.clientName}</td>
                    <td>{quote.site?.name ?? quote.siteId}</td>
                    <td>{quote.label}</td>
                    <td>{quote.totalTTC.toFixed(2)} €</td>
                    <td>
                      <span
                        className={`status-chip ${
                          quote.status === 'ACCEPTED'
                            ? 'status-chip--success'
                            : quote.status === 'REJECTED' || quote.status === 'CANCELLED'
                            ? 'status-chip--info'
                            : 'status-chip--warning'
                        }`}
                      >
                        {STATUS_LABELS[quote.status]}
                      </span>
                    </td>
                    <td>{quote.dueAt ? quote.dueAt.slice(0, 10) : '—'}</td>
                    <td>{formatDateTime(quote.issuedAt)}</td>
                    <td>
                      <div className="table-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Download}
                          onClick={() => downloadPdf(quote)}
                        >
                          PDF
                        </Button>
                        {quote.status === 'DRAFT' && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              className="btn--compact"
                              icon={Send}
                              onClick={() => emailQuote(quote)}
                            >
                              Envoyer par email
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="btn--compact"
                              icon={Check}
                              onClick={() => changeStatus(quote, 'SENT')}
                            >
                              Marquer envoyé
                            </Button>
                          </>
                        )}
                        {quote.status === 'ACCEPTED' && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="btn--compact"
                            icon={FileOutput}
                            onClick={() => convertToInvoice(quote)}
                          >
                            Convertir en facture
                          </Button>
                        )}
                        {quote.status === 'SENT' && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              className="btn--compact"
                              icon={Check}
                              onClick={() => changeStatus(quote, 'ACCEPTED')}
                            >
                              Accepté
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="btn--compact"
                              icon={X}
                              onClick={() => changeStatus(quote, 'REJECTED')}
                            >
                              Refusé
                            </Button>
                          </>
                        )}
                        {quote.status !== 'CANCELLED' && quote.status !== 'ACCEPTED' && quote.status !== 'REJECTED' && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="btn--compact"
                            icon={X}
                            onClick={() => changeStatus(quote, 'CANCELLED')}
                          >
                            Annuler
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Trash2}
                          onClick={() => removeQuote(quote)}
                        >
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
    </div>
  );
};
