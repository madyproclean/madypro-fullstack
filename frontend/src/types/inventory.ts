export type InventoryItem = {
  id: string;
  siteId: string;
  name: string;
  barcode?: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; name: string };
};
