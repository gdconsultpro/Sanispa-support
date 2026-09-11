"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { partnerDispatchLabels, type PartnerDispatchDecision } from "@/lib/partner-release";
import { statusLabel } from "@/lib/display-labels";

export type AdminRequestItem = {
  id: string;
  shortId: string;
  clientName: string;
  subject: string;
  createdAt: string;
  status: string;
  dispatchDecision?: PartnerDispatchDecision | null;
  dueAt: string | null;
  overdue: boolean;
  panels: { diagnostic: ReactNode; documents: ReactNode; followup: ReactNode; history: ReactNode };
};

const tabs = [
  { key: "diagnostic", label: "Diagnostic" },
  { key: "documents", label: "Photos et documents" },
  { key: "followup", label: "Suivi" },
  { key: "history", label: "Historique" }
] as const;

type TabKey = (typeof tabs)[number]["key"];

function dateLabel(value: string, withTime = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date non disponible";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
    timeZone: "Europe/Paris"
  }).format(date);
}

export function AdminRequests({ items }: { items: AdminRequestItem[] }) {
  const id = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("diagnostic");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollRef = useRef({ x: 0, y: 0 });
  const focusRestoreVersion = useRef(0);
  const selected = items.find(item => item.id === selectedId);
  const selectedPresent = Boolean(selected);

  useEffect(() => {
    if (selectedId && !selectedPresent) {
      setNotice("Le dossier ne figure plus dans la liste avec les filtres actuels. La liste a été actualisée.");
      setSelectedId(null);
    }
  }, [selectedId, selectedPresent]);

  useEffect(() => {
    if (!selectedId || !selectedPresent) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const listTitle = listTitleRef.current;
    focusRestoreVersion.current += 1;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    dialog.showModal();
    titleRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      const position = scrollRef.current;
      const restoreVersion = ++focusRestoreVersion.current;
      requestAnimationFrame(() => {
        if (restoreVersion !== focusRestoreVersion.current || dialog.open) return;
        const target = triggerRef.current?.isConnected ? triggerRef.current : listTitle;
        target?.focus({ preventScroll: true });
        window.scrollTo({ left: position.x, top: position.y, behavior: "auto" });
      });
    };
  }, [selectedId, selectedPresent]);

  useEffect(() => {
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  }, [selectedId, activeTab]);

  function openRequest(itemId: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    scrollRef.current = { x: window.scrollX, y: window.scrollY };
    setNotice("");
    setActiveTab("diagnostic");
    setSelectedId(itemId);
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabs[next].key);
    tabRefs.current[next]?.focus({ preventScroll: true });
  }

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, object, embed, audio[controls], video[controls], [contenteditable="true"], [tabindex]'
    )).filter(element => element.tabIndex >= 0 && !element.matches(":disabled") &&
      !element.closest("[hidden], [inert]") && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden" && getComputedStyle(element).visibility !== "collapse");
    const first = controls[0];
    const last = controls[controls.length - 1];
    const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
    if (!first || !last) {
      event.preventDefault();
      titleRef.current?.focus({ preventScroll: true });
    } else if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeIndex === controls.length - 1 || activeIndex === -1)) {
      event.preventDefault();
      first.focus();
    }
  }

  return <section aria-labelledby={`${id}-list-title`} className="min-w-0">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={`${id}-list-title`} ref={listTitleRef} tabIndex={-1} className="text-sm font-bold text-sanispa-navy outline-none">
        {items.length} {items.length === 1 ? "demande affichée" : "demandes affichées"}
      </h2>
      <p className="hidden text-xs text-sanispa-steel sm:block">Ouvrez une demande pour consulter et traiter son dossier.</p>
    </div>
    {notice ? <p className="mb-3 rounded-md border border-sanispa-line bg-sanispa-ice p-3 text-sm text-sanispa-steel" role="status">{notice}</p> : null}
    {items.length > 0 ? <div className="overflow-hidden rounded-md border border-sanispa-line bg-white shadow-soft">
      <div aria-hidden="true" className="hidden grid-cols-[90px_minmax(0,1fr)_95px_130px_140px_60px] gap-4 border-b border-sanispa-line bg-sanispa-ice px-4 py-3 text-xs font-bold uppercase tracking-wide text-sanispa-steel lg:grid">
        <span>Demande</span><span>Client · Motif</span><span>Date</span><span>Statut</span><span>Échéance</span><span />
      </div>
      <ul className="divide-y divide-sanispa-line">
        {items.map(item => <li key={item.id} id={`dossier-${item.id}`} className="min-w-0">
          <button type="button" onClick={event => openRequest(item.id, event.currentTarget)}
            aria-label={`Ouvrir la demande ${item.shortId} de ${item.clientName} : ${item.subject}`}
            aria-haspopup="dialog"
            className="group grid w-full min-w-0 grid-cols-2 gap-x-3 gap-y-3 p-4 text-left text-sm transition hover:bg-sanispa-ice focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sanispa-blue lg:grid-cols-[90px_minmax(0,1fr)_95px_130px_140px_60px] lg:items-center lg:gap-4">
            <span className="whitespace-nowrap text-xs font-bold tracking-wide text-sanispa-blue">N° {item.shortId}</span>
            <span className="col-span-2 row-start-2 min-w-0 lg:col-span-1 lg:row-auto">
              <span className="block break-words text-base font-bold leading-snug text-sanispa-navy">{item.clientName}</span>
              <span className="mt-1 line-clamp-2 break-words leading-snug text-sanispa-steel">{item.subject}</span>
              {item.dispatchDecision?<span className={`mt-2 inline-block rounded px-2 py-1 text-xs font-bold ${item.dispatchDecision==="pending"?"bg-amber-100 text-amber-900":"bg-sanispa-ice text-sanispa-navy"}`}>Diffusion : {partnerDispatchLabels[item.dispatchDecision]}</span>:null}
            </span>
            <time dateTime={item.createdAt} className="col-start-2 row-start-1 text-right text-xs text-sanispa-steel lg:col-auto lg:row-auto lg:text-left">{dateLabel(item.createdAt)}</time>
            <span className="col-start-1 row-start-3 min-w-0 self-start lg:col-auto lg:row-auto lg:self-auto"><span className="inline-block max-w-full break-words rounded-md bg-sanispa-ice px-2 py-1 text-xs font-bold leading-relaxed text-sanispa-navy group-hover:bg-white">{statusLabel(item.status)}</span></span>
            <span className={`col-span-2 row-start-4 min-w-0 text-left text-xs lg:col-span-1 lg:row-auto ${item.dueAt ? "block" : "hidden lg:block"} ${item.overdue ? "font-bold text-amber-800" : "text-sanispa-steel"}`}>
              {item.dueAt ? <><span className="block lg:sr-only">Échéance</span><time dateTime={item.dueAt}>{dateLabel(item.dueAt, true)}</time>{item.overdue ? <span className="mt-1 block">À traiter</span> : null}</> : <span className="hidden lg:inline">—</span>}
            </span>
            <span aria-hidden="true" className="col-start-2 row-start-3 justify-self-end self-center font-bold text-sanispa-blue lg:col-auto lg:row-auto">Ouvrir <span className="lg:hidden">→</span></span>
          </button>
        </li>)}
      </ul>
    </div> : null}

    <dialog ref={dialogRef} aria-labelledby={`${id}-detail-title`} aria-describedby={`${id}-detail-subject`}
      onKeyDown={keepFocusInside}
      onCancel={event => { event.preventDefault(); setSelectedId(null); }}
      onClose={event => { if (!event.currentTarget.open) setSelectedId(null); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setSelectedId(null);
      }}
      className="admin-request-dialog m-0 h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 bg-white p-0 text-sanispa-navy shadow-xl sm:m-auto sm:h-[min(90dvh,900px)] sm:max-h-[90dvh] sm:w-[calc(100vw-3rem)] sm:max-w-5xl sm:rounded-xl">
      {selected ? <div key={selected.id} className="flex h-full min-h-0 flex-col">
        <header className="relative shrink-0 border-b border-sanispa-line bg-white px-4 py-4 pr-28 sm:px-6 sm:py-5 sm:pr-32">
          <p className="text-xs font-bold uppercase tracking-wide text-sanispa-blue">Demande n° {selected.shortId}</p>
          <h2 id={`${id}-detail-title`} ref={titleRef} tabIndex={-1} className="mt-1 break-words text-xl font-bold leading-tight outline-none sm:text-2xl">{selected.clientName}</h2>
          <p id={`${id}-detail-subject`} className="mt-2 line-clamp-3 break-words text-sm leading-snug text-sanispa-steel">{selected.subject}</p>
          <span className="mt-2 inline-block rounded-md bg-sanispa-ice px-2 py-1 text-xs font-bold">{statusLabel(selected.status)}</span>
          {selected.dispatchDecision?<span className="ml-2 mt-2 inline-block rounded-md bg-amber-50 px-2 py-1 text-xs font-bold">Diffusion : {partnerDispatchLabels[selected.dispatchDecision]}</span>:null}
          <button type="button" onClick={() => setSelectedId(null)} aria-label="Fermer le dossier"
            className="focus-ring absolute right-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold hover:bg-sanispa-ice sm:right-5 sm:top-5">
            Fermer <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </header>
        <div role="tablist" aria-label="Rubriques du dossier" className="grid shrink-0 grid-cols-2 gap-1 border-b border-sanispa-line bg-sanispa-ice p-2 sm:grid-cols-4 sm:px-5">
          {tabs.map((tab, index) => <button key={tab.key} type="button" role="tab"
            ref={element => { tabRefs.current[index] = element; }}
            id={`${id}-tab-${tab.key}`} aria-selected={activeTab === tab.key} aria-controls={`${id}-panel-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            onClick={() => setActiveTab(tab.key)} onKeyDown={event => navigateTabs(event, index)}
            className={`focus-ring min-h-11 rounded-md px-2 py-2 text-sm font-bold transition ${activeTab === tab.key ? "bg-sanispa-navy text-white" : "text-sanispa-steel hover:bg-white hover:text-sanispa-navy"}`}>
            {tab.label}
          </button>)}
        </div>
        <div ref={panelScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-4 sm:p-6">
          {tabs.map(tab => <div key={tab.key} role="tabpanel" id={`${id}-panel-${tab.key}`}
            aria-labelledby={`${id}-tab-${tab.key}`} hidden={activeTab !== tab.key} tabIndex={0}
            className="min-w-0 break-words rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sanispa-blue">
            {selected.panels[tab.key]}
          </div>)}
        </div>
      </div> : null}
    </dialog>
    <style jsx>{`
      .admin-request-dialog::backdrop { background: rgba(15, 35, 53, .58); }
    `}</style>
  </section>;
}
