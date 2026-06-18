import { problemTypes } from "@/lib/questions";

export const partnerLeadStatuses = ["NEW", "AVAILABLE", "nouvelle"];

const descriptionQuestionKeys = ["description", "pump_details", "noise_description"];

export type PartnerLeadPreview = {
  id: string;
  createdAt: string;
  problemType: string;
  problemTypeKey: string;
  department: string | null;
  postalCode: string;
  city: string;
  spaBrand: string | null;
  spaModel: string | null;
  description: string | null;
};

export function sanitizePartnerLead(row: any): PartnerLeadPreview {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const location = parseLocation(customer?.address, row.department);

  return {
    id: row.id,
    createdAt: row.created_at,
    problemType: problemTypes.find((type) => type.value === row.problem_type)?.label ?? "Demande technique",
    problemTypeKey: row.problem_type,
    department: row.department ?? null,
    postalCode: location.postalCode,
    city: location.city,
    spaBrand: customer?.spa_brand ?? null,
    spaModel: customer?.spa_model ?? null,
    description: pickSafeDescription(row.diagnostic_answers ?? [])
  };
}

function parseLocation(address: string | null | undefined, department: string | null | undefined) {
  const fallback = { postalCode: department ? `${department}***` : "", city: "" };
  if (!address) return fallback;

  const parts = address
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  const postalIndex = parts.findIndex((part) => /^\d{5}$/.test(part));

  if (postalIndex === -1) return fallback;

  return {
    postalCode: parts[postalIndex],
    city: parts[postalIndex + 1] ?? ""
  };
}

function pickSafeDescription(answers: Array<{ question_key?: string; answer?: string }>) {
  const answer = answers.find((item) => item.question_key && descriptionQuestionKeys.includes(item.question_key));
  if (!answer?.answer) return null;

  const normalized = String(answer.answer).replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}
