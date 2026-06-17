"use client";

import { useMemo, useState } from "react";
import { PartnerAdminItem } from "@/lib/types";

const emptyForm = {
  id: "",
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  postal_code: "",
  city: "",
  departments: ""
};

export function PartnerAdmin({ initialPartners }: { initialPartners: PartnerAdminItem[] }) {
  const [partners, setPartners] = useState(initialPartners);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(form.id);

  const sortedPartners = useMemo(
    () => [...partners].sort((a, b) => Number(b.active) - Number(a.active) || a.company_name.localeCompare(b.company_name)),
    [partners]
  );

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function editPartner(partner: PartnerAdminItem) {
    setMessage("");
    setForm({
      id: partner.id,
      company_name: partner.company_name,
      contact_name: partner.contact_name ?? "",
      email: partner.email,
      phone: partner.phone ?? "",
      address: partner.address ?? "",
      postal_code: partner.postal_code ?? "",
      city: partner.city ?? "",
      departments: partner.departments.join(", ")
    });
  }

  async function savePartner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const body = {
      company_name: form.company_name,
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      address: form.address,
      postal_code: form.postal_code,
      city: form.city,
      departments: form.departments
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    };

    const response = await fetch(isEditing ? `/api/admin/partners/${form.id}` : "/api/admin/partners", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Impossible d'enregistrer le partenaire.");
      return;
    }

    setPartners((current) => {
      if (isEditing) return current.map((partner) => (partner.id === payload.partner.id ? payload.partner : partner));
      return [payload.partner, ...current];
    });
    setForm(emptyForm);
    setMessage(isEditing ? "Partenaire mis à jour." : "Partenaire ajouté.");
  }

  async function togglePartner(partner: PartnerAdminItem) {
    const response = await fetch(`/api/admin/partners/${partner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !partner.active })
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Impossible de modifier le partenaire.");
      return;
    }
    setPartners((current) => current.map((item) => (item.id === partner.id ? payload.partner : item)));
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-sanispa-navy">{isEditing ? "Modifier un partenaire" : "Ajouter un partenaire"}</h2>
        <p className="mt-2 text-sm leading-6 text-sanispa-steel">
          Renseignez les départements couverts, séparés par des virgules. Exemple : 67, 68, 90.
        </p>
        <form onSubmit={savePartner} className="mt-5 grid gap-4 md:grid-cols-2">
          <PartnerInput label="Société" value={form.company_name} onChange={(value) => updateField("company_name", value)} required />
          <PartnerInput label="Contact" value={form.contact_name} onChange={(value) => updateField("contact_name", value)} />
          <PartnerInput label="Email" type="email" value={form.email} onChange={(value) => updateField("email", value)} required />
          <PartnerInput label="Téléphone" value={form.phone} onChange={(value) => updateField("phone", value)} />
          <PartnerInput label="Adresse" value={form.address} onChange={(value) => updateField("address", value)} />
          <PartnerInput label="Code postal" value={form.postal_code} onChange={(value) => updateField("postal_code", value)} />
          <PartnerInput label="Ville" value={form.city} onChange={(value) => updateField("city", value)} />
          <PartnerInput label="Départements" value={form.departments} onChange={(value) => updateField("departments", value)} required />
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button type="submit" disabled={saving} className="focus-ring rounded-md bg-sanispa-navy px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "Enregistrement..." : isEditing ? "Mettre à jour" : "Ajouter le partenaire"}
            </button>
            {isEditing ? (
              <button type="button" onClick={() => setForm(emptyForm)} className="focus-ring rounded-md border border-sanispa-line bg-white px-5 py-3 text-sm font-bold text-sanispa-navy">
                Annuler
              </button>
            ) : null}
          </div>
        </form>
        {message ? <p className="mt-4 rounded-md bg-sanispa-ice p-3 text-sm font-semibold text-sanispa-navy">{message}</p> : null}
      </section>

      <section className="grid gap-3">
        {sortedPartners.length === 0 ? (
          <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">Aucun partenaire enregistré pour le moment.</div>
        ) : null}

        {sortedPartners.map((partner) => (
          <article key={partner.id} className="rounded-md border border-sanispa-line bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sanispa-blue">{partner.active ? "Actif" : "Inactif"}</p>
                <h3 className="mt-1 text-lg font-bold text-sanispa-navy">{partner.company_name}</h3>
                <p className="mt-1 text-sm text-sanispa-steel">{partner.contact_name || "Contact non renseigné"} · {partner.email}</p>
                <p className="mt-1 text-sm text-sanispa-steel">{[partner.postal_code, partner.city].filter(Boolean).join(" ") || "Ville non renseignée"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {partner.departments.map((department) => (
                    <span key={`${partner.id}-${department}`} className="rounded-md bg-sanispa-ice px-3 py-1 text-xs font-bold text-sanispa-navy">
                      {department}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => editPartner(partner)} className="focus-ring rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy">
                  Modifier
                </button>
                <button type="button" onClick={() => togglePartner(partner)} className="focus-ring rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy">
                  {partner.active ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function PartnerInput({
  label,
  value,
  onChange,
  required,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-sanispa-navy">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring min-h-12 rounded-md border border-sanispa-line bg-white px-3 py-2 text-base font-normal text-sanispa-navy"
      />
    </label>
  );
}
