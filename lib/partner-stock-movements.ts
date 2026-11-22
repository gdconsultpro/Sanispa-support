import type { FieldSource } from "./partner-field";

export type FieldStockItem = { id: string; label: string; reference: string; quantity: number };
export type FieldStockUsage = {
  session_id: string;
  stock_id: string;
  label: string;
  reference: string;
  used: number;
  available: number;
};
export const stockMovementLabels = {
  opening: "Stock initial",
  adjustment: "Ajustement de quantité",
  import: "Entrée par import CSV",
  use: "Pièces utilisées",
  return: "Retour au stock",
} as const;
export type StockMovement = {
  id: string;
  stock_id: string;
  category: "spa" | "piece";
  label: string;
  reference: string;
  delta: number;
  quantity_after: number;
  kind: keyof typeof stockMovementLabels;
  created_at: string;
  field_source: FieldSource | null;
  field_visit_id: string | null;
};

export function stockSearchFilter(term: string) {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = '"' + pattern.replace(/[\\"]/g, "\\$&") + '"';
  return `label.ilike.${quoted},reference.ilike.${quoted}`;
}
