export const appointmentUnplanReasonKeys = ["client_absent", "no_access", "report_requested", "other"] as const;
export type AppointmentUnplanReason = (typeof appointmentUnplanReasonKeys)[number];

export const appointmentUnplanReasons = {
  client_absent: "Client absent ou injoignable",
  no_access: "Accès impossible",
  report_requested: "Report demandé",
  other: "Autre motif",
} satisfies Record<AppointmentUnplanReason, string>;

export function appointmentUnplanLabel(metadata: { reason?: unknown; note?: unknown } | null | undefined) {
  const reason = metadata?.reason;
  if (typeof reason !== "string" || !Object.hasOwn(appointmentUnplanReasons, reason)) return "";
  const note = typeof metadata?.note === "string" ? metadata.note.trim() : "";
  return appointmentUnplanReasons[reason as AppointmentUnplanReason] + (note ? " · " + note : "");
}

export type AppointmentUnplanning = {
  reason: AppointmentUnplanReason;
  note: string | null;
  starts_at: string;
  ends_at: string;
  unplanned_at: string;
};
