import type { PartnerLeadBilling } from "@/lib/partner-billing";
import { problemTypes } from "@/lib/questions";
export { partnerLeadStatuses } from "./partner-release";
const descriptionQuestionKeys = [
  "description",
  "pump_details",
  "noise_description",
];
export type PartnerLeadPreview = {
  id: string;
  access: "preview";
  createdAt: string;
  offeredAt?: string | null;
  receivedAt?: string | null;
  charterRequired?: boolean;
  problemType: string;
  problemTypeKey: string;
  department: string | null;
  postalCode: string;
  city: string;
  spaBrand: string | null;
  spaModel: string | null;
  description: string | null;
  previewPhotos?: Array<{ type: string; url: string }>;
  canUnlock: boolean;
  lockedUntil: string | null;
  billing: PartnerLeadBilling;
};
export function sanitizePartnerLead(
  row: any,
  billing: PartnerLeadBilling = {
    paymentRequired: true,
    amount: null,
    currency: "eur",
    reserved: false,
    available: false,
  },
): PartnerLeadPreview {
  const customer = Array.isArray(row.customers)
    ? row.customers[0]
    : row.customers;
  const location = parseLocation(customer?.address, row.department);
  return {
    id: row.id,
    access: "preview",
    createdAt: row.created_at,
    offeredAt: row.partner_released_at || null,
    receivedAt: row.partner_received_at || null,
    problemType:
      problemTypes.find((type) => type.value === row.problem_type)?.label ??
      "Demande technique",
    problemTypeKey: row.problem_type,
    department: row.department ?? null,
    postalCode: location.postalCode,
    city: location.city,
    spaBrand: customer?.spa_brand ?? null,
    spaModel: customer?.spa_model ?? null,
    description:
      row.offer_version === 2 ? (row.preview_description ?? null) : null,
    previewPhotos:
      row.offer_version === 2
        ? (row.preview_photo_paths ?? []).map((path: string) => ({
            type: "Photo validée par SANISPA",
            url: `/api/files/preview?diagnostic=${row.id}&path=${encodeURIComponent(path)}`,
          }))
        : [],
    canUnlock: !isLocked(row.lead_locked_until) && !row.assigned_partner_id,
    lockedUntil: row.lead_locked_until ?? null,
    billing,
  };
}
export type PartnerLeadFull = Omit<
  PartnerLeadPreview,
  "access" | "canUnlock"
> & {
  access: "full";
  dossierReference?: string;
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
  answers: Array<{
    question: string;
    answer: string;
  }>;
  photos: Array<{
    type: string;
    url: string | null;
  }>;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    url: string | null;
  }>;
};
export function sanitizeUnlockedPartnerLead(
  row: any,
  documents: PartnerLeadFull["documents"] = [],
): PartnerLeadFull {
  const customer = Array.isArray(row.customers)
    ? row.customers[0]
    : row.customers;
  const location = parseLocation(customer?.address, row.department);
  const preview = sanitizePartnerLead(row);
  return {
    ...preview,
    access: "full",
    dossierReference: row.public_reference,
    canUnlock: false,
    status: row.status,
    customer: {
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
      postalCode: location.postalCode,
      city: location.city,
    },
    spa: {
      brand: customer?.spa_brand ?? null,
      model: customer?.spa_model ?? null,
      year: customer?.spa_year ?? null,
    },
    answers: (row.diagnostic_answers ?? []).map((answer: any) => ({
      question: answer.question_label ?? "Question",
      answer: answer.answer ?? "",
    })),
    photos: (row.diagnostic_photos ?? []).map((photo: any) => ({
      type: photo.photo_type,
      url: photo.public_url ?? null,
    })),
    documents,
  };
}
export function isLocked(lockedUntil: string | null | undefined) {
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
}
export function parseLocation(
  address: string | null | undefined,
  department: string | null | undefined,
) {
  const fallback = {
    postalCode: department ? `${department}***` : "",
    city: "",
  };
  if (!address) return fallback;
  const parts = address
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  const postalIndex = parts.findIndex((part) => /^\d{5}$/.test(part));
  if (postalIndex === -1) return fallback;
  return {
    postalCode: parts[postalIndex],
    city: parts[postalIndex + 1] ?? "",
  };
}
function pickSafeDescription(
  answers: Array<{
    question_key?: string;
    answer?: string;
  }>,
) {
  const answer = answers.find(
    (item) =>
      item.question_key && descriptionQuestionKeys.includes(item.question_key),
  );
  if (!answer?.answer) return null;
  const normalized = String(answer.answer).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 220
    ? `${normalized.slice(0, 217)}...`
    : normalized;
}
