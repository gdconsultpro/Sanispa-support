export const maxStockCsvBytes = 2 * 1024 * 1024;
export const maxStockCsvRows = 5000;

type StockCsvRow = { category: "piece" | "spa"; label: string; reference: string; quantity: number };
const clean = (value: string) => value.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const columns = {
  category: ["categorie", "category", "type"],
  label: ["designation", "libelle", "label", "nom", "article"],
  reference: ["reference", "ref", "sku"],
  quantity: ["quantite", "qte", "quantity", "stock"],
};

function splitCsv(source: string, delimiter: string) {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let rowLine = 1;
  const finishCell = () => {
    cells.push(value.trim());
    value = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (cells.some(Boolean)) rows.push({ line: rowLine, cells });
    cells = [];
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        if (char === "\n" || (char === "\r" && source[index + 1] !== "\n")) line++;
        value += char;
      }
    } else if (char === delimiter) {
      finishCell();
    } else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && source[index + 1] === "\n") index++;
      rowLine = ++line;
    } else if (char === '"' && !value.trim() && !closed) {
      value = "";
      quoted = true;
    } else if (char === '"' || (closed && char.trim())) {
      throw new Error(`Ligne ${rowLine} · guillemets CSV mal placés.`);
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error(`Ligne ${rowLine} · guillemets CSV non fermés.`);
  finishRow();
  return rows;
}

export function parsePartnerStockCsv(csv: string) {
  const source = csv.replace(/^\uFEFF/, "").trimStart();
  if (source.includes("\uFFFD") || source.includes("\u0000")) throw new Error("Exportez votre fichier en CSV UTF-8.");
  const header = source.split(/\r?\n|\r/, 1)[0];
  const delimiter = header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";
  const [head, ...rows] = splitCsv(source, delimiter);
  if (!head || !rows.length) throw new Error("Le fichier doit contenir un en-tête et au moins un article.");
  if (rows.length > maxStockCsvRows) throw new Error("Le fichier peut contenir jusqu’à 5 000 articles.");
  const titles = head.cells.map(clean);
  const index = (names: string[]) => titles.findIndex(title => names.includes(title));
  const categoryIndex = index(columns.category);
  const labelIndex = index(columns.label);
  const referenceIndex = index(columns.reference);
  const quantityIndex = index(columns.quantity);
  if ([categoryIndex, labelIndex, quantityIndex].includes(-1)) {
    throw new Error("Le fichier doit contenir les colonnes Catégorie, Désignation et Quantité. La Référence est facultative.");
  }
  const articles: StockCsvRow[] = [];
  const errors: string[] = [];
  let invalid = 0;
  for (const { line, cells } of rows) {
    const category = clean(cells[categoryIndex] ?? "");
    const label = cells[labelIndex] ?? "";
    const reference = cells[referenceIndex] ?? "";
    const quantity = cells[quantityIndex] ?? "";
    const isPiece = ["piece", "pieces", "piece detachee", "pieces detachees"].includes(category);
    const isSpa = ["spa", "spas"].includes(category);
    if (cells.length !== head.cells.length || (!isPiece && !isSpa) || !label || label.length > 140 ||
      reference.length > 100 || !/^\d+$/.test(quantity) || Number(quantity) > 1_000_000) {
      invalid++;
      if (errors.length < 8) errors.push(`Ligne ${line} · vérifiez la catégorie, la désignation, la référence et la quantité entière.`);
      continue;
    }
    articles.push({ category: isPiece ? "piece" : "spa", label, reference, quantity: Number(quantity) });
  }
  return { articles, errors, invalid };
}
