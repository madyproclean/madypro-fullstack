import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { LineItem } from '../../types/quote';
import { computeTotals, emptyLineItem } from '../../utils/lineItems';
import { Button } from '../ui/Button';

type LineItemsEditorProps = {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  disabled?: boolean;
};

export const LineItemsEditor: React.FC<LineItemsEditorProps> = ({ items, onChange, disabled }) => {
  const totals = computeTotals(items);

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="line-items-editor">
      <div className="table-wrapper">
        <table className="table line-items-table" aria-label="lignes du document">
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: '5.5rem' }} />
            <col style={{ width: '7.5rem' }} />
            <col style={{ width: '5.5rem' }} />
            <col style={{ width: '7.5rem' }} />
            {!disabled && <col style={{ width: '2.5rem' }} />}
          </colgroup>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qté</th>
              <th>Prix unit. HT</th>
              <th>TVA %</th>
              <th>Total HT</th>
              {!disabled && <th />}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="text"
                    className="line-items-table__input"
                    value={item.description}
                    disabled={disabled}
                    placeholder="Description de la prestation"
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="line-items-table__input line-items-table__input--number"
                    value={item.quantity}
                    disabled={disabled}
                    onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="line-items-table__input line-items-table__input--number"
                    value={item.unitPriceHT}
                    disabled={disabled}
                    onChange={(e) => updateItem(index, { unitPriceHT: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    className="line-items-table__input line-items-table__input--number"
                    value={item.vatRatePercent}
                    disabled={disabled}
                    onChange={(e) => updateItem(index, { vatRatePercent: Number(e.target.value) })}
                  />
                </td>
                <td className="line-items-table__total">{((item.quantity || 0) * (item.unitPriceHT || 0)).toFixed(2)} €</td>
                {!disabled && (
                  <td className="line-items-table__remove">
                    <Button
                      type="button"
                      variant="ghost"
                      className="btn--compact"
                      icon={Trash2}
                      aria-label="Supprimer la ligne"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <Button type="button" variant="ghost" className="btn--compact" icon={Plus} onClick={() => onChange([...items, emptyLineItem()])}>
          Ajouter une ligne
        </Button>
      )}
      <div className="line-items-editor__totals">
        <span>Total HT : {totals.totalHT.toFixed(2)} €</span>
        <span>TVA : {totals.totalVAT.toFixed(2)} €</span>
        <strong>Total TTC : {totals.totalTTC.toFixed(2)} €</strong>
      </div>
    </div>
  );
};
