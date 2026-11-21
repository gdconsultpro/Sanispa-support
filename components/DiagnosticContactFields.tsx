"use client";

import { Field } from "./Field";
import { contactFields, contactLabels, type ContactField } from "@/lib/diagnostic-contact";
import type { CustomerInfo } from "@/lib/types";

export function DiagnosticContactFields({ draft, onChange, fields = contactFields, moving = false, readOnlyEmail = false }: {
  draft: CustomerInfo;
  onChange: (field: ContactField, value: string) => void;
  fields?: readonly ContactField[];
  moving?: boolean;
  readOnlyEmail?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.filter(field => !moving || field !== "address").map(field => (
        <Field key={field}
          label={moving && (field === "postalCode" || field === "city") ? contactLabels[field] + " d’enlèvement" : contactLabels[field]}
          name={field}
          value={draft[field]}
          onChange={value => onChange(field, value)}
          type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
          autoComplete={field === "email" ? "email" : undefined}
          readOnly={field === "email" && readOnlyEmail}
          required={field !== "address"}
        />
      ))}
    </div>
  );
}
