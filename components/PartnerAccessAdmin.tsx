"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Field } from "@/components/Field";
import type { PartnerAdminItem } from "@/lib/types";
type Access = { user_id: string; contact_name: string | null; email: string; active: boolean; passwordChangeRequired: boolean; role: string };
export function PartnerAccessAdmin({ partner, technicianOnly = false }: { partner: PartnerAdminItem; technicianOnly?: boolean }) {
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [existingMode, setExistingMode] = useState(technicianOnly);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState(technicianOnly ? "" : partner.contact_name || "");
  const [role, setRole] = useState<"owner" | "technician">(technicianOnly ? "technician" : "owner");
  const [email, setEmail] = useState(technicianOnly ? "" : partner.email);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [existing, setExisting] = useState<string | null>(null);
  const [reactivate, setReactivate] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/partners/${partner.id}/access`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Impossible de charger les accès.");
      setAccesses(body.accesses); setLoadError(""); setLoaded(true);
    } catch (error) { setLoadError(error instanceof Error && error.name === "Error" ? error.message : "Chargement des accès interrompu. Réessayez."); }
  }, [partner.id]);
  useEffect(() => { void load(); }, [load]);
  async function save(mode: "create" | "link" | "lookup") {
    if (pending.current) return;
    pending.current = true; setSaving(true); setMessage("");
    try {
      const body = mode === "create" ? { mode, name, email, password, role } : mode === "lookup" ? { mode, name, email } : { mode, name, email, existingUserId: existing, reactivate, role };
      const response = await fetch(`/api/admin/partners/${partner.id}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (result.conflict && result.existingUserId) { setExisting(result.existingUserId); setExistingMode(true); setPassword(""); setMessage(result.message); return; }
      if (technicianOnly && response.status === 404) throw new Error("Aucun compte SANISPA trouvé pour cette adresse.");
      if (!response.ok) throw new Error(result.error || "L’accès n’a pas pu être confirmé.");
      if (!result.ready) throw new Error("L’accès n’a pas pu être confirmé. Vérifiez la liste avant de réessayer.");
      setPassword(""); setExisting(null); setMessage(result.message); await load();
    } catch (error) {
      setMessage(error instanceof Error && error.name === "Error" ? error.message : "Réponse interrompue : vérifiez la liste des accès avant de réessayer. L’opération a peut-être été enregistrée.");
      await load();
    } finally { pending.current = false; setSaving(false); }
  }
  return <section className="mt-6 border-t border-sanispa-line pt-5">
    <h3 className="text-lg font-bold text-sanispa-navy">{technicianOnly ? "Rattacher un technicien" : "Accès à l’espace partenaire"}</h3>
    <p className="mt-2 text-sm text-sanispa-steel">
      <strong>{partner.company_name}</strong> · {technicianOnly ? "Utilisez l’adresse du compte SANISPA du collaborateur." : "Gérez les comptes qui ont accès à cette entreprise."}
    </p>
    {loadError ? <p role="alert" className="mt-3 text-sm text-red-800">{loadError} <button onClick={() => void load()} className="underline">Réessayer</button></p> : !loaded ? <p role="status" className="my-3 text-sm">Chargement des accès enregistrés…</p> : accesses.length ? <ul className="my-3 grid gap-2">{accesses.map(access => <li key={access.user_id} className="rounded-md bg-sanispa-ice p-3 text-sm">
      <strong>{access.contact_name || "Contact partenaire"}</strong> · {access.role === "technician" ? "Technicien" : "Responsable"} · {access.email}<br />
      {access.active ? access.passwordChangeRequired ? "Accès rattaché · mot de passe personnel à choisir" : "Accès rattaché et actif" : "Accès désactivé"}
    </li>)}</ul> : <p className="my-3 text-sm">Aucun accès enregistré pour cette entreprise.</p>}
    <form onSubmit={event => { event.preventDefault(); void save(existing ? "link" : existingMode ? "lookup" : "create"); }} className="mt-4 grid gap-4 sm:grid-cols-2" aria-busy={saving}>
      {!technicianOnly ? <>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Type d’accès<select value={existingMode ? "existing" : "new"} onChange={event => {setExistingMode(event.target.value === "existing");setExisting(null);setPassword("");setMessage("");}} className="focus-ring min-h-12 rounded-md border border-sanispa-line bg-white p-3 font-normal"><option value="new">Créer un nouveau compte</option><option value="existing">Rattacher un compte existant sans changer son mot de passe</option></select></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Rôle du nouvel accès
        <select value={role} onChange={event => setRole(event.target.value === "technician" ? "technician" : "owner")}
          className="focus-ring min-h-12 rounded-md border border-sanispa-line bg-white p-3 font-normal">
          <option value="owner">Responsable</option>
          <option value="technician">Technicien</option>
        </select>
      </label>
      </> : null}
      <Field label={technicianOnly ? "Nom du technicien" : "Nom du contact"} name="partner-contact" value={name} onChange={setName} required maxLength={150} />
      <Field label="Adresse e-mail du compte" name="partner-email" type="email" value={email} onChange={value => { setEmail(value); setExisting(null); setReactivate(false); }} required autoComplete="off" />
      {!existingMode ? <><Field label="Mot de passe provisoire (12 caractères minimum)" name="partner-temporary-password" type={show ? "text" : "password"} value={password} onChange={setPassword} required minLength={12} maxLength={128} autoComplete="new-password" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Afficher le mot de passe provisoire</label></> : existing ? <div className="rounded-md bg-amber-50 p-3 text-sm sm:col-span-2">
        <p>Confirmez l’accès {role === "technician" ? "technicien" : "responsable"} de <strong>{email}</strong> pour <strong>{partner.company_name}</strong>. Le compte garde son mot de passe.</p>
        <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={reactivate} onChange={e => setReactivate(e.target.checked)} />Réactiver aussi son accès à cette entreprise s’il était désactivé</label>
      </div> : <p className="text-sm sm:col-span-2">Vérifiez d’abord cette adresse, puis confirmez le rattachement proposé. Aucun mot de passe ne sera demandé ni remplacé.</p>}
      <button type="submit" disabled={saving || !partner.active} className="focus-ring rounded-md bg-sanispa-navy px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Vérification de l’accès…" : existing ? technicianOnly ? "Confirmer l’accès technicien" : "Confirmer le rattachement du compte existant" : existingMode ? "Vérifier le compte existant" : "Créer le compte et son accès partenaire"}</button>
      {!partner.active ? <p className="text-sm sm:col-span-2">Réactivez l’entreprise avant de créer un accès.</p> : null}
    </form>
    {message ? <p role="status" className="mt-4 rounded-md bg-sanispa-ice p-3 text-sm">{message}</p> : null}
    <p className="mt-3 text-sm text-sanispa-steel">{technicianOnly
      ? "Le responsable de l’entreprise peut ensuite associer le compte à sa ligne dans Planning → Comptes techniciens."
      : "Seuls les nouveaux comptes créés avec un mot de passe provisoire doivent le remplacer lors de leur première connexion."}</p>
  </section>;
}
