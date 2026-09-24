import { LineItem } from '../types/quote';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Miroir client de documents/line-items.util.ts côté backend — même formule, pour un aperçu
 * en direct avant sauvegarde (le total qui fait foi reste toujours celui renvoyé par l'API). */
export function computeTotals(lineItems: LineItem[]) {
  let totalHT = 0;
  let totalVAT = 0;
  for (const item of lineItems) {
    const lineHT = (item.quantity || 0) * (item.unitPriceHT || 0);
    totalHT += lineHT;
    totalVAT += lineHT * ((item.vatRatePercent || 0) / 100);
  }
  return {
    totalHT: round2(totalHT),
    totalVAT: round2(totalVAT),
    totalTTC: round2(totalHT + totalVAT),
  };
}

export const emptyLineItem = (): LineItem => ({
  description: '',
  quantity: 1,
  unitPriceHT: 0,
  vatRatePercent: 20,
});
