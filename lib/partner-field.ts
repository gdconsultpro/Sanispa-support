import type { PartnerClientSpa } from "./partner-planner";
import type { FieldPhotoKind, FieldReportDetails, FieldTemplate } from "./partner-field-forms";
import type { PartnerWorkStatus } from "./partner-workspace";

export type FieldSource = "private" | "sanispa";
export type FieldReport = {
  id: string; performed_at: string; findings: string; actions: string; next_steps: string;
  submitted_at: string; client_validated_at?: string | null;
  details?: FieldReportDetails | null;
};
export type FieldPhoto = { id: string; url: string; kind: FieldPhotoKind };
export type PreviousFieldReport = Pick<FieldReport, "id" | "performed_at" | "findings" | "actions" | "next_steps" | "details"> & {
  source: FieldSource;
  visitId: string;
};
export type FieldVisit = {
  title: string;
  reference?: string;
  description: string;
  customer: { name: string; phone?: string | null; address?: string | null; clientId?: string | null };
  appointment: { starts_at: string; ends_at: string } | null;
  workStatus: PartnerWorkStatus;
  spaId: string | null;
  spas: PartnerClientSpa[];
  declaredSpa?: string;
  session: { id: string; started_at: string; submitted_at: string | null } | null;
  photos: FieldPhoto[];
  reports: FieldReport[];
  reportTemplate?: FieldTemplate | null;
  previousReport?: PreviousFieldReport | null;
  canStart: boolean;
  canValidate: boolean;
  canEditSpa: boolean;
  version?: string;
};
