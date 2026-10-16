import React from 'react';
import { Button } from './Button';

type RepeatableFieldArrayProps<T> = {
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  addLabel?: string;
  removeLabel?: string;
  emptyMessage?: string;
};

/**
 * Généralise le pattern add/remove-row réimplémenté indépendamment dans
 * InterventionsPage (extra stops), GabaritsPage (stops) et FormsPage (champs).
 */
export function RepeatableFieldArray<T>({
  items,
  onAdd,
  onRemove,
  renderItem,
  addLabel = 'Ajouter',
  removeLabel = 'Retirer',
  emptyMessage,
}: RepeatableFieldArrayProps<T>) {
  return (
    <div className="ui-field-array">
      {items.length === 0 && emptyMessage && <p className="ui-field-array__empty">{emptyMessage}</p>}
      {items.map((item, index) => (
        <div key={index} className="ui-field-array__row">
          <div className="ui-field-array__row-content">{renderItem(item, index)}</div>
          <Button type="button" variant="ghost" className="btn--compact" onClick={() => onRemove(index)}>
            {removeLabel}
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}
