import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteSite, listSites } from '../../services/api/sites.api';
import { Site } from '../../types/site';
import { Button } from '../../components/ui/Button';
import { useAuthContext } from '../../context/AuthContext';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';

type SitesTableProps = {
  /** Notifie le parent à chaque chargement — utile pour des stats agrégées (ex. portefeuille). */
  onLoaded?: (sites: Site[], total: number) => void;
};

/**
 * Liste des sites (pagination, actions) — utilisée à la fois par SitesListPage
 * (aucun modal ouvert) et SiteFormPage (affichée en fond derrière le modal de
 * création/édition), pour que la liste reste visible au lieu de disparaître
 * quand on navigue vers /sites/new ou /sites/:id/edit.
 */
export const SitesTable: React.FC<SitesTableProps> = ({ onLoaded }) => {
  const { token, notify } = useAuthContext();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Veuillez vous reconnecter pour afficher les sites.');
      return;
    }
    setLoading(true);
    listSites(token, { page, pageSize })
      .then((sitePage) => {
        const siteItems = Array.isArray((sitePage as any)?.items)
          ? (sitePage as any).items
          : Array.isArray(sitePage as any)
          ? (sitePage as any)
          : [];
        const totalCount = (sitePage as any)?.total ?? siteItems.length;
        setSites(siteItems);
        setTotal(totalCount);
        setError(null);
        onLoaded?.(siteItems, totalCount);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les sites.';
        setError(message);
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, notify, page]);

  const handleDelete = async (site: Site) => {
    if (!token) {
      notify('Session expirée : veuillez vous reconnecter.', 'error');
      return;
    }
    const confirmed = window.confirm(`Supprimer le site « ${site.name} » ?`);
    if (!confirmed) return;
    try {
      await deleteSite(token, site.id);
      setSites((prev) => prev.filter((item) => item.id !== site.id));
      notify('Site supprimé', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Suppression impossible.';
      setError(message);
      notify(message, 'error');
    }
  };

  return (
    <div>
      {error && <p className="form-error">{error}</p>}
      <div className="pagination">
        <Button type="button" variant="ghost" icon={ChevronLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Précédent
        </Button>
        <span className="card__meta">Page {page}</span>
        <Button
          type="button"
          variant="ghost"
          icon={ChevronRight}
          iconPosition="right"
          onClick={() => {
            const maxPage = Math.ceil(total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= total}
        >
          Suivant
        </Button>
        <span className="card__meta">{total} résultats</span>
      </div>
      {loading ? (
        <p>Chargement des sites...</p>
      ) : (
        <div className="card">
          <div className="table">
            <div className="table-head">
              <div>Nom</div>
              <div>Adresse</div>
              <div>Statut</div>
              <div>Actions</div>
            </div>
            <div className="table-body">
              {sites.map((site) => (
                <div className="table-row" key={site.id}>
                  <div>{site.name}</div>
                  <div>{site.address}</div>
                  <div>
                    <span className={`tag ${site.active ? 'tag--success' : 'tag--muted'}`}>
                      {site.active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div className="table-actions">
                    <Link to={`/supervision/sites/${site.id}`} className="btn btn--ghost btn--compact">
                      Fiche complète
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      className="btn--compact"
                      icon={Pencil}
                      onClick={() => navigate(`/sites/${site.id}/edit`)}
                    >
                      Éditer
                    </Button>
                    <Button
                      className="btn--ghost btn--compact"
                      icon={Trash2}
                      onClick={() => handleDelete(site)}
                      type="button"
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
