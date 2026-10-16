import React, { useState } from 'react';
import { Minus, Plus, History } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { adjustInventoryItem, InventoryMovement, listInventoryMovements } from '../../services/api/inventory.api';
import { InventoryItem } from '../../types/inventory';
import { Button } from '../ui/Button';

type Props = { items: InventoryItem[]; onChange: (item: InventoryItem) => void };

/** Stock d'un site : quantités, seuil d'alerte, réassort / consommation et historique des mouvements. */
export const SiteInventoryPanel: React.FC<Props> = ({ items, onChange }) => {
  const { token, notify } = useAuthContext();
  const [openId, setOpenId] = useState<string | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const adjust = async (item: InventoryItem, delta: number) => {
    if (!token) return;
    setBusyId(item.id);
    try {
      const updated = await adjustInventoryItem(token, item.id, delta, delta > 0 ? 'Réassort' : 'Consommation');
      onChange(updated);
      if (openId === item.id) setMovements(await listInventoryMovements(token, item.id));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ajustement impossible', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const toggleHistory = async (item: InventoryItem) => {
    if (!token) return;
    if (openId === item.id) {
      setOpenId(null);
      return;
    }
    setOpenId(item.id);
    setMovements([]);
    listInventoryMovements(token, item.id).then(setMovements).catch(() => setMovements([]));
  };

  return (
    <div className="panel">
      <h3>Inventaire</h3>
      <p className="card__meta">Quand un produit passe sous son seuil, les superviseurs du site sont prévenus.</p>
      <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
        <table className="table" aria-label="inventaire site">
          <thead>
            <tr>
              <th>Article</th>
              <th>Quantité</th>
              <th>Seuil</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const low = item.quantity <= item.minThreshold;
              return (
                <React.Fragment key={item.id}>
                  <tr>
                    <td>{item.name}</td>
                    <td style={low ? { color: 'var(--color-danger)', fontWeight: 600 } : undefined}>
                      {item.quantity} {item.unit}
                      {low ? ' · à réapprovisionner' : ''}
                    </td>
                    <td>{item.minThreshold}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <Button type="button" variant="ghost" className="btn--compact" icon={Minus} disabled={busyId === item.id || item.quantity === 0} onClick={() => adjust(item, -1)} aria-label={`Retirer un ${item.name}`}>
                          1
                        </Button>
                        <Button type="button" variant="ghost" className="btn--compact" icon={Plus} disabled={busyId === item.id} onClick={() => adjust(item, 1)} aria-label={`Ajouter un ${item.name}`}>
                          1
                        </Button>
                        <Button type="button" variant="ghost" className="btn--compact" icon={History} onClick={() => toggleHistory(item)}>
                          Historique
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {openId === item.id && (
                    <tr>
                      <td colSpan={4}>
                        {movements.length === 0 ? (
                          <span className="card__meta">Aucun mouvement enregistré.</span>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                            {movements.map((m) => (
                              <li key={m.id} style={{ fontSize: '0.9rem' }}>
                                {new Date(m.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} :{' '}
                                {m.delta > 0 ? `+${m.delta}` : m.delta} → {m.quantityAfter}
                                {m.reason ? ` · ${m.reason}` : ''}
                                {m.userName ? ` · ${m.userName}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                  Aucun article enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
