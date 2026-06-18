import { problemTypes } from "@/lib/questions";

export const partnerLeadStatuses = ["NEW", "AVAILABLE", "nouvelle"];

const descriptionQuestionKeys = ["description", "pump_details", "noise_description"];

export type PartnerLeadPreview = {
  id: string;
  access: "preview";
  createdAt: string;
  problemType: string;
  problemTypeKey: string;
  department: string | null;
  postalCode: string;
  city: string;
  spaBrand: string | null;
  spaModel: string | null;
  description: string | null;
  canUnlock: boolean;
  lockedUntil: string | null;
};

export function sanitizePartnerLead(row: any): PartnerLeadPreview {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const location = parseLocation(customer?.address, row.department);

  return {
    id: row.id,
    access: "preview",
    createdAt: row.created_at,
    problemType: problemTypes.find((type) => type.value === row.problem_type)?.label ?? "Demande technique",
    problemTypeKey: row.problem_type,
    department: row.department ?? null,
    postalCode: location.postalCode,
    city: location.city,
    spaBrand: customer?.spa_brand ?? null,
    spaModel: customer?.spa_model ?? null,
    description: pickSafeDescription(row.diagnostic_answers ?? []),
    canUnlock: !isLocked(row.lead_locked_until) && !row.assigned_partner_id,
    lockedUntil: row.lead_locked_until ?? null
  };
}

export type PartnerLeadFull = Omit<PartnerLeadPreview, "access" | "canUnlock"> & {
  access: "full";
  canUnlock: false;
  status: string;
  customer: {
    name: string;
    phone: string;
    email: string;
    address: string;
    postalCode: string;
    city: string;
  };
  spa: {
    brand: string | null;
    model: string | null;
    year: string | null;
  };
  answers: Array<{ question: string; answer: string }>;
  photos: Array<{ type: string; url: string | null }>;
  documents: Array<{ id: string; name: string; type: string; url: string | null }>;
};

export function sanitizeUnlockedPartnerLead(row: any, documents: PartnerLeadFull["documents"] = []): PartnerLeadFull {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const location = parseLocation(customer?.address, row.department);
  const preview = sanitizePartnerLead(row);

  return {
    ...preview,
    access: "full",
    canUnlock: false,
    status: row.status,
    customer: {
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
      postalCode: location.postalCode,
      city: location.city
    },
    spa: {
      brand: customer?.spa_brand ?? null,
      model: customer?.spa_model ?? null,
      year: customer?.spa_year ?? null
    },
    answers: (row.diagnostic_answers ?? []).map((answer: any) => ({
      question: answer.question_label ?? "Question",
      answer: answer.answer ?? ""
    })),
    photos: (row.diagnostic_photos ?? []).map((photo: any) => ({
      type: photo.photo_type,
      url: photo.public_url ?? null
    })),
    documents
  };
}

export function isLocked(lockedUntil: string | null | undefined) {
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
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
