"use client";

import { paymentsPaused } from "@/lib/commercial-mode";
import { useMemo, useState } from "react";
import { PartnerAdminItem } from "@/lib/types";
import { PartnerAccessAdmin } from "@/components/PartnerAccessAdmin";

const emptyForm = {
  id: "",
  company_name: "",
  siret: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  postal_code: "",
  city: "",
  departments: "",
};

const partnerDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

export function PartnerAdmin({
  initialPartners,
}: {
  initialPartners: PartnerAdminItem[];
}) {
  const [partners, setPartners] = useState(initialPartners);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(initialPartners.some(partner => partner.verification_status === "pending"));
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correction, setCorrection] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const isEditing = Boolean(form.id);
  const editingPartner = partners.find((partner) => partner.id === form.id);

  const sortedPartners = useMemo(
    () =>
      [...partners].sort(
        (a, b) =>
          Number(b.verification_status === "pending") - Number(a.verification_status === "pending") || Number(b.active) - Number(a.active) ||
          a.company_name.localeCompare(b.company_name),
      ),
    [partners],
  );

  const pendingCount = partners.filter(partner => partner.verification_status === "pending").length;
  const term = query.trim().toLowerCase();
  const visiblePartners = sortedPartners.filter(partner =>
    (!onlyPending || partner.verification_status === "pending")
    && (!term || [partner.company_name, partner.email, partner.contact_name, partner.city, ...partner.departments].join(" ").toLowerCase().includes(term)
      || partner.siret?.includes(term.replace(/\s/g, ""))));

  function openEditor() {
    setShowEditor(true);
    requestAnimationFrame(() => document.getElementById("partner-editor")?.scrollIntoView({ block: "start" }));
  }

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function editPartner(partner: PartnerAdminItem) {
    setMessage("");
    openEditor();
    setForm({
      id: partner.id,
      company_name: partner.company_name,
      siret: partner.siret ?? "",
      contact_name: partner.contact_name ?? "",
      email: partner.email,
      phone: partner.phone ?? "",
      address: partner.address ?? "",
      postal_code: partner.postal_code ?? "",
      city: partner.city ?? "",
      departments: partner.departments.join(", "),
    });
  }

  async function savePartner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const body = {
      company_name: form.company_name,
      siret: form.siret,
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      address: form.address,
      postal_code: form.postal_code,
      city: form.city,
      departments: form.departments
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    };

    const response = await fetch(
      isEditing ? `/api/admin/partners/${form.id}` : "/api/admin/partners",
      {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Impossible d'enregistrer le partenaire.");
      return;
    }

    setPartners((current) => {
      if (isEditing)
        return current.map((partner) =>
          partner.id === payload.partner.id ? payload.partner : partner,
        );
      return [payload.partner, ...current];
    });
    setForm(emptyForm);
    setShowEditor(false);
    setMessage(isEditing ? "Partenaire mis à jour." : "Partenaire ajouté.");
  }

  async function togglePartner(partner: PartnerAdminItem) {
    const response = await fetch(`/api/admin/partners/${partner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !partner.active }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Impossible de modifier le partenaire.");
      return;
    }
    setPartners((current) =>
      current.map((item) => (item.id === partner.id ? payload.partner : item)),
    );
  }

  async function verifyPartner(partner: PartnerAdminItem) {
    if (saving || !checked || !partner.siret) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partners/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verify: true, expectedSiret: partner.siret }),
      });
      const payload = await response.json();
      if (payload.partner) setPartners(current => current.map(item => item.id === partner.id ? payload.partner : item));
      if (!response.ok) {
        setChecked(false);
        throw new Error(payload.error || "Vérification impossible.");
      }
      setReviewId(null);
      setChecked(false);
      setMessage("Entreprise vérifiée. Vous pouvez désormais la sélectionner pour un dossier.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vérification impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePartner(partner: PartnerAdminItem) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partners/${partner.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        setMessage(payload.error || "Suppression impossible.");
        setDeleteId(null);
        return;
      }
      setPartners(current => current.filter(item => item.id !== partner.id));
      if (form.id === partner.id) {
        setShowEditor(false);
        setForm(emptyForm);
      }
      setReviewId(current => current === partner.id ? null : current);
      setDeleteId(null);
      setMessage(`${partner.company_name} a été supprimé de la liste des partenaires.`);
    } catch {
      setMessage("Connexion interrompue. Réessayez pour confirmer la suppression.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-sanispa-line bg-white p-4">
        <h2 className="font-bold">Vérification des entreprises</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={onlyPending} className="focus-ring min-h-11 rounded-md border px-3 py-2 text-sm font-bold aria-pressed:bg-sanispa-navy aria-pressed:text-white" onClick={() => setOnlyPending(true)}>À vérifier ({pendingCount})</button>
          <button type="button" aria-pressed={!onlyPending} className="focus-ring min-h-11 rounded-md border px-3 py-2 text-sm font-bold aria-pressed:bg-sanispa-navy aria-pressed:text-white" onClick={() => setOnlyPending(false)}>Toutes les entreprises ({partners.length})</button>
          <button type="button" className="focus-ring min-h-11 rounded-md border px-3 py-2 text-sm font-bold" onClick={() => { setForm(emptyForm); openEditor(); }}>Ajouter un partenaire</button>
        </div>
        <label className="mt-4 block text-sm font-bold">Rechercher une entreprise, un SIRET ou un département
          <input className="focus-ring mt-2 block w-full min-w-0 rounded-md border border-sanispa-line px-3 py-2 font-normal" type="search" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </section>
      {message ? <p role="status" className="rounded-md bg-sanispa-ice p-3 text-sm font-semibold">{message}</p> : null}
      {showEditor ? (
      <section id="partner-editor" className="scroll-mt-4 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-sanispa-navy">
          {isEditing ? "Modifier un partenaire" : "Ajouter un partenaire"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-sanispa-steel">
          Renseignez les départements couverts, séparés par des virgules.
          Exemple : 67, 68, 90.
        </p>
        <form onSubmit={savePartner} className="mt-5 grid gap-4 md:grid-cols-2">
          <PartnerInput
            label="Société"
            value={form.company_name}
            onChange={(value) => updateField("company_name", value)}
            required
          />
          <PartnerInput label="SIRET (14 chiffres)" value={form.siret} onChange={value=>updateField("siret",value)} required />
          <PartnerInput
            label="Contact"
            required
            value={form.contact_name}
            onChange={(value) => updateField("contact_name", value)}
          />
          <PartnerInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(value) => updateField("email", value)}
            required
          />
          <PartnerInput
            label="Téléphone"
            required
            value={form.phone}
            onChange={(value) => updateField("phone", value)}
          />
          <PartnerInput
            label="Adresse"
            required
            value={form.address}
            onChange={(value) => updateField("address", value)}
          />
          <PartnerInput
            label="Code postal"
            required
            value={form.postal_code}
            onChange={(value) => updateField("postal_code", value)}
          />
          <PartnerInput
            label="Ville"
            required
            value={form.city}
            onChange={(value) => updateField("city", value)}
          />
          <PartnerInput
            label="Départements"
            value={form.departments}
            onChange={(value) => updateField("departments", value)}
            required
          />
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="focus-ring rounded-md bg-sanispa-navy px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving
                ? "Enregistrement..."
                : isEditing
                  ? "Mettre à jour"
                  : "Ajouter le partenaire"}
            </button>
            {isEditing ? (
              <button
                type="button"
                onClick={() => { setForm(emptyForm); setShowEditor(false); }}
                className="focus-ring rounded-md border border-sanispa-line bg-white px-5 py-3 text-sm font-bold text-sanispa-navy"
              >
                Annuler
              </button>
            ) : null}
          </div>
        </form>
        <p className="mt-4 text-sm text-sanispa-steel">
          {paymentsPaused() ? "Les accès et les dossiers proposés sont actuellement gratuits. " : "Les tarifs dépendent de l’abonnement actif. "} Vérifiez les coordonnées et le SIRET avant de valider une inscription. Chaque transmission reste ensuite à valider dans le dossier client.
        </p>
        {editingPartner ? (
          <PartnerAccessAdmin
            key={`access-${editingPartner.id}`}
            partner={editingPartner}
          />
        ) : (
          <p className="mt-3 text-sm text-sanispa-steel">
            Après l’ajout de l’entreprise, ouvrez « Modifier / Accès » pour
            créer le compte de connexion du contact.
          </p>
        )}

      </section>

      ) : null}

      <section className="grid gap-3">
        {visiblePartners.length === 0 ? (
          <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">
            {term ? "Aucune entreprise ne correspond à cette recherche." : onlyPending ? "Aucune entreprise en attente de vérification." : "Aucun partenaire enregistré."}
          </div>
        ) : null}

        {visiblePartners.map((partner) => (
          <article
            key={partner.id}
            className="rounded-md border border-sanispa-line bg-white p-4 shadow-soft"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sanispa-blue">
                  {partner.active ? "Actif" : "Inactif"}
                </p>
                <span className="mt-2 inline-flex rounded-md bg-sanispa-ice px-2 py-1 text-xs font-bold text-sanispa-navy">
                  {paymentsPaused() ? "Accès gratuit" : "Tarifs selon abonnement actif"}
                </span>
                <p className="mt-2 text-sm font-bold">{partner.verification_status === "pending" ? "À vérifier · Aucun dossier proposé" : partner.verification_status === "verified" ? `Vérifié le ${new Date(partner.verified_at!).toLocaleDateString("fr-FR")}` : "Entreprise déjà enregistrée"}</p>
                <p className="mt-1 text-sm">SIRET : {partner.siret || "Non renseigné"}</p>
                <h3 className="mt-1 text-lg font-bold text-sanispa-navy">
                  {partner.company_name}
                </h3>
                <p className="mt-1 text-sm text-sanispa-steel">
                  {partner.registered_at ? "Inscription le " : "Fiche ajoutée le "}
                  <time dateTime={partner.registered_at ?? partner.created_at}>
                    {partnerDate.format(new Date(partner.registered_at ?? partner.created_at))}
                  </time>
                </p>
                <p className="mt-1 text-sm text-sanispa-steel">
                  {partner.contact_name || "Contact non renseigné"} ·{" "}
                  {partner.email}
                </p>
                <p className="mt-1 text-sm text-sanispa-steel">
                  {[partner.address, partner.postal_code, partner.city]
                    .filter(Boolean)
                    .join(" ") || "Ville non renseignée"}
                </p>
                <p className="mt-1 text-sm">Téléphone : {partner.phone || "Non renseigné"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {partner.departments.map((department) => (
                    <span
                      key={`${partner.id}-${department}`}
                      className="rounded-md bg-sanispa-ice px-3 py-1 text-xs font-bold text-sanispa-navy"
                    >
                      {department}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {partner.verification_status !== "verified" ? <button type="button" disabled={saving || !partner.active} onClick={() => {
                  setReviewId(reviewId === partner.id ? null : partner.id);
                  setChecked(false);
                  setCorrection("");
                  setMessage("");
                }} className="focus-ring rounded-md bg-sanispa-blue px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Examiner les coordonnées et le SIRET</button> : null}
                <button
                  type="button"
                  onClick={() => editPartner(partner)}
                  className="focus-ring rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy"
                >
                  Modifier / Accès
                </button>
                <button
                  type="button"
                  onClick={() => togglePartner(partner)}
                  className="focus-ring rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy"
                >
                  {partner.active ? "Désactiver" : "Réactiver"}
                </button>
                <button
                  type="button"
                  aria-expanded={deleteId === partner.id}
                  aria-controls={deleteId === partner.id ? `supprimer-${partner.id}` : undefined}
                  disabled={saving}
                  onClick={() => {
                    setMessage("");
                    setDeleteId(deleteId === partner.id ? null : partner.id);
                  }}
                  className="focus-ring rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-50"
                >
                  Supprimer le partenaire
                </button>
              </div>
            </div>
            {deleteId === partner.id ? (
              <div id={`supprimer-${partner.id}`} className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <p className="font-bold">Supprimer définitivement {partner.company_name} ?</p>
                <p className="mt-1">La fiche et les accès à cette entreprise seront supprimés.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => void deletePartner(partner)}
                    className="focus-ring min-h-11 rounded-md bg-red-800 px-3 py-2 font-bold text-white disabled:opacity-50">
                    {saving ? "Suppression en cours…" : "Confirmer la suppression"}
                  </button>
                  <button type="button" disabled={saving} onClick={() => setDeleteId(null)}
                    className="focus-ring min-h-11 rounded-md border border-red-200 bg-white px-3 py-2 font-bold disabled:opacity-50">
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}
            {reviewId === partner.id ? (
              <div className="mt-4 grid gap-3 rounded-lg bg-sanispa-ice p-4 text-sm">
                <h4 className="font-bold">Vérification de {partner.company_name}</h4>
                <p>Comparez le SIRET, le nom et l’adresse de l’établissement, puis vérifiez les coordonnées et les départements couverts.</p>
                {partner.siret && /^\d{14}$/.test(partner.siret) ? (
                  <a href={"https://annuaire-entreprises.data.gouv.fr/etablissement/" + partner.siret} target="_blank" rel="noreferrer" className="w-fit font-bold text-sanispa-blue underline">Ouvrir le SIRET dans l’Annuaire des Entreprises ↗</a>
                ) : <p className="font-semibold">Renseignez d’abord le SIRET dans « Modifier / Accès ».</p>}
                <label className="flex items-start gap-2 font-bold">
                  <input type="checkbox" className="mt-1" checked={checked} onChange={event => setChecked(event.target.checked)} />
                  J’ai vérifié l’établissement, ses coordonnées et sa zone d’intervention.
                </label>
                <button type="button" disabled={!checked || saving || !partner.siret}
                  className="focus-ring w-fit rounded-md bg-sanispa-blue px-4 py-3 font-bold text-white disabled:opacity-50" onClick={() => void verifyPartner(partner)}>
                  Confirmer la validation de l’entreprise
                </button>
                <details className="rounded-md border border-sanispa-line bg-white p-3">
                  <summary className="cursor-pointer font-bold">Demander une correction</summary>
                  <label className="mt-2 block">Information à corriger
                    <textarea value={correction} maxLength={1000} onChange={event => setCorrection(event.target.value)} className="mt-1 block w-full rounded-md border border-sanispa-line p-2" />
                  </label>
                  {correction.trim() ? <a className="mt-2 inline-block font-bold underline"
                    href={"mailto:" + encodeURIComponent(partner.email).replace("%40", "@") + "?subject=" + encodeURIComponent("SANISPA — Votre inscription partenaire")
                      + "&body=" + encodeURIComponent("Bonjour,\n\nPour terminer la vérification de votre entreprise, merci de nous préciser :\n" + correction.trim() + "\n\nL’équipe SANISPA")}>
                    Préparer l’e-mail de correction
                  </a> : null}
                </details>
              </div>
            ) : null}
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
  type = "text",
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
