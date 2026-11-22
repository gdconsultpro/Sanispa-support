import { partnerToken, redirectPartnerAccess } from "./partner-browser";
import { partnerReturnPath } from "./partner-navigation";

export class PlannerRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

type PlannerRequestOptions = { signal?: AbortSignal; payload?: object; photo?: Blob; method?: "DELETE" | "PATCH" };

async function plannerResponse(url: string, options: PlannerRequestOptions) {
  const next = partnerReturnPath(window.location.pathname + window.location.search);
  const token = await partnerToken(next);
  if (!token || options.signal?.aborted) return null;
  const response = await fetch(url, {
    method: options.method ?? (options.photo ? "PUT" : options.payload ? "POST" : "GET"),
    headers: {
      Authorization: "Bearer " + token,
      ...(options.payload ? { "Content-Type": "application/json" } : options.photo ? { "Content-Type": "image/jpeg" } : {}),
    },
    body: options.photo ?? (options.payload ? JSON.stringify(options.payload) : undefined),
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(20000),
  });
  if (redirectPartnerAccess(response, next)) return null;
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new PlannerRequestError(result.error || "Votre planning est temporairement indisponible.", response.status, result.code);
  }
  return response;
}

export async function plannerRequest(url: string, options: PlannerRequestOptions = {}) {
  const response = await plannerResponse(url, options);
  return response ? response.json() : null;
}

export async function plannerDownload(url: string) {
  const response = await plannerResponse(url, { signal: AbortSignal.timeout(45000) });
  return response ? response.blob() : null;
}
