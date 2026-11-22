import { adminClientsPath, adminDirectoryTab, adminDossierId, adminDossierSection, adminLoginPath } from "@/lib/admin-navigation";
import { adminInboxFlags, adminInboxViews, adminInboxView } from "@/lib/admin-inbox";
import { loadAdminPartnerApprovalEmails } from "@/lib/admin-partner-approval-email";
import { interventionSummaryFields } from "@/lib/admin-intervention-summary";
import { partnerDispatchDecision } from "@/lib/partner-release";
import { AdminRequests } from "@/components/AdminRequests";
import { diagnosticPanels } from "@/components/AdminDiagnosticPanels";
import { hasOverdueAction, loadAdminDossierDetails } from "@/lib/admin-dossier";
import { adminRequestSubject } from "@/lib/admin-presentation";
import { RetryNotifications } from "@/components/SavActions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSignOut } from "@/components/AdminSignOut";
import { administrator } from "@/lib/admin-auth";
import { statusLabel } from "@/lib/display-labels";
import { protectedPhotos } from "@/lib/photos";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PartnerAdmin } from "@/components/PartnerAdmin";
import { AdminClientAccounts } from "@/components/AdminClientAccounts";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdminDiagnostic, AdminClientAccount, PartnerAdminItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: {
    searchParams?: Promise<{
        archived?: string;
        tab?: string;
        q?: string;
        status?: string;
        actions?: string;
        diffusion?: string;
        inbox?: string;
        dossier?: string;
        section?: string;
        page?: string;
    }>;
}) {
    const params = await searchParams;
    const initialDossier = adminDossierId(params?.dossier);
    const initialSection = adminDossierSection(params?.section);
    const context = await administrator(await headers())
        .catch(() => redirect(adminLoginPath(initialDossier, initialSection, params?.tab)));
    const tab = adminDirectoryTab(params?.tab) ?? "diagnostics";
    const clientQuery = typeof params?.q === "string" ? params.q.trim().slice(0, 150) : "";
    const clientPage = typeof params?.page === "string" && /^\d{1,5}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
    const dispatchFilter = ["pending","internal","released","legacy"].includes(params?.diffusion || "") ? params!.diffusion! : "";
    const dueOnly = params?.actions === "due";
    const showArchived = !dueOnly && params?.archived === "1";
    const [{ diagnostics, error }, { partners, error: partnerError }, clients] = await Promise.all([
        tab === "diagnostics" ? loadDiagnostics(showArchived, params?.q, params?.status, dueOnly, dispatchFilter) : { diagnostics: [], error: null },
        tab === "partners" ? loadPartners(context.supabase) : { partners: [], error: null },
        tab === "clients" ? context.supabase.rpc("list_admin_customer_accounts", {
            p_actor: context.user.id, p_search: clientQuery, p_page: clientPage,
        }) : null,
    ]);
    const clientDirectory = clients?.data as { total: number; accounts: AdminClientAccount[] } | undefined;
    const pinnedResult = tab === "diagnostics" && initialDossier && !diagnostics.some(dossier => dossier.id === initialDossier)
        ? await loadDiagnostics(false, undefined, undefined, false, "", initialDossier) : null;
    const pinned = pinnedResult?.diagnostics[0];
    const requestedDossier = pinned ?? diagnostics.find(dossier => dossier.id === initialDossier);
    const details = tab === "diagnostics" && (diagnostics.length || pinned)
        ? await loadAdminDossierDetails(getSupabaseAdmin(), pinned ? [...diagnostics, pinned] : diagnostics) : new Map();
    const now = Date.now();
    const inbox = showArchived ? "all" : adminInboxView(params?.inbox);
    const entries = diagnostics.map(diagnostic => ({
        diagnostic,
        flags: adminInboxFlags(diagnostic, details.get(diagnostic.id)?.activity || [], now),
    }));
    const visible = entries.filter(entry => entry.flags[inbox]);
    if (inbox === "due") visible.sort((a, b) => Date.parse(a.diagnostic.next_action_at!) - Date.parse(b.diagnostic.next_action_at!));
    function inboxUrl(view: string) {
        const query = new URLSearchParams();
        if (params?.q) query.set("q", params.q);
        if (params?.status) query.set("status", params.status);
        if (dispatchFilter) query.set("diffusion", dispatchFilter);
        if (view !== "all") query.set("inbox", view);
        return query.size ? "/admin?" + query.toString() : "/admin";
    }
    function toRequestItem(diagnostic: AdminDiagnostic) {
        const activity = details.get(diagnostic.id);
        const flags = adminInboxFlags(diagnostic, activity?.activity || [], now);
        return {
            id: diagnostic.id,
            shortId: diagnostic.public_reference || "Référence en cours",
            clientName: diagnostic.customers?.name || "Client non renseigné",
            subject: adminRequestSubject(diagnostic),
            createdAt: diagnostic.created_at,
            status: diagnostic.status,
            archived: Boolean(diagnostic.archived_at),
            dispatchDecision: partnerDispatchDecision(diagnostic),
            dispatchProgress: diagnostic.assigned_partner_id ? "Pris en charge" : flags.declined ? "Partenaire indisponible · à réattribuer"
                : flags.waiting ? "Proposée · réponse attendue" : null,
            dueAt: diagnostic.next_action_state === "pending" ? diagnostic.next_action_at : null,
            nextAction: diagnostic.next_action_state === "pending" ? diagnostic.next_action_text : null,
            overdue: flags.due,
            panels: diagnosticPanels(diagnostic, activity),
        };
    }
    function viewUrl(archived: boolean) {
        const query = new URLSearchParams();
        if (params?.q) query.set("q", params.q);
        if (params?.status) query.set("status", params.status);
        if (dispatchFilter) query.set("diffusion",dispatchFilter);
        if (archived) query.set("archived", "1");
        else if (dueOnly) query.set("actions", "due");
        return query.size ? `/admin?${query}` : "/admin";
    }
    const navClass = (active: boolean) => `focus-ring inline-flex min-h-11 items-center rounded-md border px-4 py-2 text-sm font-bold ${active ? "border-sanispa-blue bg-white text-sanispa-navy" : "border-sanispa-line text-sanispa-steel hover:bg-white"}`;
    return <AppShell compact>
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sanispa-blue">Administration</p>
        <h1 className="mt-1 text-2xl font-bold text-sanispa-navy sm:text-3xl">{tab === "clients" ? "Comptes clients" : tab === "partners" ? "Partenaires techniques" : "Demandes SANISPA"}</h1>
        <p className="mt-2 text-sm text-sanispa-steel">{tab === "partners"
            ? "Gérez les entreprises partenaires, leurs accès, leurs départements couverts et la facturation des leads."
            : tab === "clients" ? "Retrouvez les comptes particuliers et gérez leurs accès."
            : "Repérez le client et le motif, puis ouvrez le dossier pour le consulter ou le traiter."}</p>
      </header>
      <AdminSignOut />
      <nav aria-label="Rubriques de l’administration" className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin" aria-current={tab === "diagnostics" ? "page" : undefined} className={navClass(tab === "diagnostics")}>Demandes</Link>
        <Link href="/admin?tab=partners" aria-current={tab === "partners" ? "page" : undefined} className={navClass(tab === "partners")}>Partenaires</Link>
        <Link href={adminClientsPath} aria-current={tab === "clients" ? "page" : undefined} className={navClass(tab === "clients")}>Clients</Link>
        <Link href="/admin/interventions" className={navClass(false)}>Interventions</Link>
        <Link href="/admin/visio" className={navClass(false)}>Visios et assistance</Link>
        <Link href="/admin/premium" className={navClass(false)}>Premium et coût IA</Link>
        <Link href="/admin/forum" className={navClass(false)}>Forum Premium</Link>
      </nav>
      {tab === "clients" ? clientDirectory && !clients?.error ? (
        <AdminClientAccounts accounts={clientDirectory.accounts} total={clientDirectory.total}
          page={clientPage} query={clientQuery} now={now} />
      ) : <p role="alert" className="rounded-md border border-red-200 bg-white p-4 text-sm">Les comptes clients sont temporairement indisponibles.</p>
      : tab === "partners" ? <>
        {partnerError ? <div className="mb-5 rounded-md border border-sanispa-line bg-white p-5 text-sm leading-6 text-sanispa-steel">
          <p className="font-bold text-sanispa-navy">Tables partenaires non configurées.</p><p className="mt-2">{partnerError}</p>
        </div> : null}
        <PartnerAdmin initialPartners={partners}/>
      </> : <>
        {error ? <div role="alert" className="mb-4 rounded-md border border-red-200 bg-white p-4 text-sm text-sanispa-steel">
          <p className="font-bold text-sanispa-navy">Le chargement des demandes a échoué.</p><p className="mt-2">{error}</p>
        </div> : null}
        {!showArchived && !error ? <nav aria-label="Boîte de réception" className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {adminInboxViews.map(([value, label]) => <Link key={value} href={inboxUrl(value)}
            aria-current={inbox === value && !dueOnly ? "page" : undefined}
            className={navClass(inbox === value && !dueOnly)}>
            <span>{label} <strong className="ml-1">{entries.filter(entry => entry.flags[value]).length}</strong></span>
          </Link>)}
        </nav> : null}
        {initialDossier && pinnedResult && !pinned ? <p role="status" className="mb-4 rounded-md bg-amber-50 p-3">{pinnedResult.error ? "Le dossier demandé n’a pas pu être chargé. Réessayez." : "Le dossier demandé est introuvable."}</p> : null}
        <section aria-label="Recherche et filtres des demandes" className="mb-5 rounded-lg border border-sanispa-line bg-sanispa-ice p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Demandes actives ou archivées" className="flex gap-2">
              <Link href={viewUrl(false)} aria-current={!showArchived ? "page" : undefined} className={navClass(!showArchived)}>Actives</Link>
              <Link href={viewUrl(true)} aria-current={showArchived ? "page" : undefined} className={navClass(showArchived)}>Archivées</Link>
            </nav>
            <details className="min-w-0 text-sm text-sanispa-steel">
              <summary className="focus-ring cursor-pointer rounded py-2 font-semibold">Notifications</summary>
              <div className="mt-2"><RetryNotifications /></div>
            </details>
          </div>
          <form key={`${showArchived}:${params?.q ?? ""}:${params?.status ?? ""}:${dueOnly}:${dispatchFilter}`} className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <input type="hidden" name="archived" value={showArchived ? "1" : "0"}/>
            {inbox !== "all" ? <input type="hidden" name="inbox" value={inbox} /> : null}
            <input aria-label="Rechercher un client ou un dossier" name="q" defaultValue={params?.q} placeholder="Nom, e-mail, téléphone ou dossier" className="focus-ring min-h-11 min-w-0 w-full rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm"/>
            <select aria-label="Filtrer par statut" name="status" defaultValue={params?.status || ""} className="focus-ring min-h-11 min-w-0 w-full rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm">
              <option value="">Tous les statuts</option>{["AVAILABLE", "ASSIGNED", "WATER_ANALYSIS", "en analyse", "devis envoyé", "RDV demandé", "terminé", "CLOSED"].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select aria-label="Filtrer les prochaines actions" name="actions" defaultValue={dueOnly ? "due" : ""} className="focus-ring min-h-11 min-w-0 w-full rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm">
              <option value="">Toutes les échéances</option><option value="due">Actions échues · dossiers actifs</option>
            </select>
            <select aria-label="Filtrer la décision de diffusion" name="diffusion" defaultValue={dispatchFilter} className="focus-ring min-h-11 min-w-0 w-full rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm">
              <option value="">Toutes les diffusions</option><option value="pending">Diffusion · À valider</option><option value="internal">Conservés chez SANISPA</option><option value="released">Transmis au partenaire</option><option value="legacy">Acquisitions antérieures</option>
            </select>
            <button className="focus-ring min-h-11 rounded-md bg-sanispa-blue px-4 py-2 text-sm font-bold text-white hover:bg-sanispa-navy">Rechercher</button>
          </form>
          {dueOnly ? <p className="mt-3 text-xs text-sanispa-steel">Actions à traiter dont l’échéance est atteinte, sur les dossiers non archivés et non terminés.</p> : null}
        </section>
        {!error ? <AdminRequests key={[showArchived, params?.q, params?.status, dueOnly, dispatchFilter, inbox].join(":")}
          initialDossier={initialDossier} initialSection={initialSection} canArchive={!showArchived}
          pinnedItem={requestedDossier && !visible.some(entry => entry.diagnostic.id === requestedDossier.id) ? toRequestItem(requestedDossier) : undefined}
          items={visible.map(({ diagnostic }) => toRequestItem(diagnostic))}
        /> : null}
        {!visible.length && !error ? <p className="rounded-md border border-sanispa-line bg-white p-5 text-sm text-sanispa-steel">
          {inbox !== "all" ? "Aucun dossier dans cette vue." : params?.q || params?.status || dueOnly || dispatchFilter ? "Aucun dossier ne correspond à ces filtres." : showArchived ? "Aucune demande archivée." : "Aucune demande active enregistrée pour le moment."}
        </p> : null}
      </>}
    </AppShell>;
}
async function loadDiagnostics(showArchived: boolean, q?: string, status?: string, dueOnly = false, dispatchFilter = "", dossierId?: string): Promise<{
    diagnostics: AdminDiagnostic[];
    error: string | null;
}> {
    try {
        const supabase = getSupabaseAdmin();
        const now = new Date().toISOString();
        const pageQuery = () => supabase
            .from("diagnostics")
            .select(`
        id,
        public_reference,
        created_at,
        status,
        request_type,
        department,
        matched_partner_ids,
        partner_released_at,
        partner_kept_at,
        assigned_partner_id,
        assigned_at,
        problem_type,
        choice,
        payment_status,
        customer_email_status,
        customer_email_error,
        archived_at,
        internal_notes,
        user_id,
        next_action_text,
        next_action_at,
        next_action_state,
        next_action_version,
        customers (
          name,
          phone,
          email,
          address,
          spa_brand,
          spa_model
        ),
        diagnostic_answers (
          question_key,
          question_label,
          answer
        ),
        diagnostic_photos (
          photo_type,
          storage_path,
          public_url
        ),
        ${interventionSummaryFields}
      `)
            .eq("invoices.document_type", "Facture d’intervention")
            .in("invoices.issued_by", ["partner", "sanispa"])
            .order("created_at", { ascending: false }).order("id", { ascending: false });
        const data = [];
        for (let offset = 0; ; offset += 500) {
            let query = dossierId ? pageQuery().eq("id", dossierId) : pageQuery().filter("archived_at", showArchived ? "not.is" : "is", null);
            if (status) query = query.eq("status", status);
            if (dueOnly) query = query.eq("next_action_state", "pending").lte("next_action_at", now)
                .neq("status", "terminé").neq("status", "CLOSED");
            const { data: page, error } = await query.range(offset, offset + 499);
            if (error) throw error;
            data.push(...(page ?? []));
            if (!page || page.length < 500) break;
        }
        const [partners, leadPurchases] = await Promise.all([
            loadPartnerNameMap(supabase),
            loadLeadPurchaseMap(supabase),
        ]);
        const diagnostics = (data ?? []).map((item) => ({
            ...item,
            customers: Array.isArray(item.customers) ? item.customers[0] ?? null : item.customers,
            matched_partners: (item.matched_partner_ids ?? []).map((id: string) => partners.get(id)).filter(Boolean),
            assigned_partner: item.assigned_partner_id ? partners.get(item.assigned_partner_id) ?? item.assigned_partner_id : null,
            lead_purchase: leadPurchases.get(item.id) ?? null
        })) as unknown as AdminDiagnostic[];
        const filtered = diagnostics.filter(d => (!dispatchFilter || partnerDispatchDecision(d) === dispatchFilter) && (!dueOnly || hasOverdueAction(d)) && (!status || d.status === status) && (!q || [d.id, d.public_reference, d.customers?.name, d.customers?.email, d.customers?.phone].join(" ").toLowerCase().includes(q.toLowerCase())));
        for (const diagnostic of filtered)
            diagnostic.diagnostic_photos = await protectedPhotos(supabase, diagnostic.diagnostic_photos);
        return { diagnostics: filtered, error: null };
    }
    catch (error) {
        return { diagnostics: [], error: error instanceof Error ? error.message : "Erreur de chargement." };
    }
}
async function loadPartners(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<{
    partners: PartnerAdminItem[];
    error: string | null;
}> {
    try {
        const { data, error } = await supabase
            .from("partners")
            .select("*, partner_departments(department)")
            .order("company_name", { ascending: true });
        if (error)
            throw error;
        const approvalEmails = await loadAdminPartnerApprovalEmails(supabase,
            (data ?? []).filter(partner => partner.verification_status === "verified").map(partner => partner.id));
        const partners = (data ?? []).map((partner) => ({
            ...partner,
            approval_email: approvalEmails ? approvalEmails.get(partner.id) ?? null : undefined,
            departments: (partner.partner_departments ?? []).map((row: {
                department: string;
            }) => row.department).sort()
        })) as PartnerAdminItem[];
        return { partners, error: null };
    }
    catch (error) {
        return { partners: [], error: error instanceof Error ? error.message : "Erreur de chargement des partenaires." };
    }
}
async function loadPartnerNameMap(supabase: any) {
    const { data } = await supabase.from("partners").select("id, company_name");
    return new Map((data ?? []).map((partner: {
        id: string;
        company_name: string;
    }) => [partner.id, partner.company_name]));
}
async function loadLeadPurchaseMap(supabase: any) {
    const { data } = await supabase
        .from("lead_purchases")
        .select("request_id, status, paid_at, stripe_checkout_session_id")
        .order("purchased_at", { ascending: false });
    const purchases = new Map();
    for (const purchase of data ?? []) {
        const priority = (state: string) => ["paid", "granted"].includes(state) ? 2 : state === "pending" ? 1 : 0;
        if (!purchases.has(purchase.request_id) || priority(purchase.status) > priority(purchases.get(purchase.request_id).status)) {
            purchases.set(purchase.request_id, purchase);
        }
    }
    return purchases;
}
