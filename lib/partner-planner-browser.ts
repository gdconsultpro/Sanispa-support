import { partnerToken, redirectPartnerAccess } from "./partner-browser";
import { partnerReturnPath } from "./partner-navigation";

export class PlannerRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export async function plannerRequest(url: string, options: { signal?: AbortSignal; payload?: object; photo?: Blob; method?: "DELETE" | "PATCH" } = {}) {
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
  const result = await response.json();
  if (!response.ok) throw new PlannerRequestError(result.error || "Votre planning est temporairement indisponible.", response.status, result.code);
  return result;
}
