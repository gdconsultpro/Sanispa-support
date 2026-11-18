import { Camera, LockKeyhole, Waves } from "lucide-react";
import type { ReactNode } from "react";
import type { DemoAction, DemoRole, DemoState } from "@/lib/demo";

export type DemoDocument = "summary" | "report" | "invoice" | "charter" | "manual";
export type DemoContext = {
  state: DemoState;
  act: (action: DemoAction, message?: string) => void;
  go: (role: DemoRole, tab: string) => void;
  showDocument: (kind: DemoDocument) => void;
  notify: (message: string) => void;
};
export const money = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const inputClass = "focus-ring mt-2 min-h-12 w-full min-w-0 rounded-xl border border-sanispa-line bg-white px-3 py-2 text-sm";
export function DemoCard({ title, children, className = "", subtitle }: { title: string; children: ReactNode; className?: string; subtitle?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-sanispa-line bg-white p-5 shadow-sm sm:p-6 ${className}`}><h2 className="text-xl font-bold tracking-tight">{title}</h2>{subtitle ? <p className="mt-2 text-sm leading-6 text-sanispa-steel">{subtitle}</p> : null}<div className="mt-5">{children}</div></section>;
}
export function DemoBadge({ children, amber = false }: { children: ReactNode; amber?: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${amber ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{children}</span>;
}
export function DemoMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-5"><p className="text-sm text-sanispa-steel">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>{detail ? <p className="mt-2 text-xs leading-5 text-sanispa-steel">{detail}</p> : null}</div>;
}
export function DemoSpa({ large = false }: { large?: boolean }) {
  return <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-100 via-emerald-50 to-blue-100 ${large ? "min-h-64" : "min-h-40"}`}><svg viewBox="0 0 360 200" aria-label="Illustration de spa fictif" role="img" className="h-auto w-full max-w-sm p-5"><ellipse cx="180" cy="166" rx="126" ry="15" fill="#bad8de"/><path d="M62 81Q60 68 78 65H286Q303 67 299 82L285 157Q282 169 268 170H91Q76 169 74 157Z" fill="#0a2342"/><path d="M66 82L80 148Q82 159 96 159H265Q278 159 280 147L294 82" fill="#697e8c"/><rect x="57" y="47" width="246" height="60" rx="29" fill="#e9f8f8" stroke="#a4cad3" strokeWidth="5"/><rect x="76" y="58" width="207" height="39" rx="20" fill="#52bed0"/><path d="M93 78Q109 66 128 78T165 78T204 78T250 78" fill="none" stroke="#d5fbff" strokeWidth="4"/><circle cx="111" cy="79" r="4" fill="#f0ffff"/><circle cx="255" cy="72" r="4" fill="#f0ffff"/><rect x="159" y="118" width="43" height="21" rx="6" fill="#0a2342"/><rect x="166" y="123" width="28" height="8" rx="2" fill="#74e0cd"/></svg><span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-sanispa-steel">Illustration · démo</span></div>;
}
export function DemoPhotos({ labels }: { labels: string[] }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{labels.map((label, i) => <div key={label} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-sanispa-line bg-sanispa-ice p-3 text-center"><span className="text-sanispa-blue">{i === 0 ? <Waves aria-hidden="true" size={26} /> : <Camera aria-hidden="true" size={25} />}</span><span className="text-xs font-bold">{label}</span><span className="text-[10px] text-sanispa-steel">Exemple fictif</span></div>)}</div>;
}
export function DemoPremiumGate({ onActivate }: { onActivate: () => void }) {
  return <DemoCard title="Un aperçu du Premium" subtitle="Dans l’application, ce service est réservé à l’abonnement particulier."><div className="flex items-start gap-4 rounded-xl bg-emerald-50 p-4"><LockKeyhole className="shrink-0 text-emerald-700" aria-hidden="true" /><div><p className="font-bold">9,99 € TTC par mois</p><p className="mt-2 text-sm leading-6">IA, carnet, rappels, relevés d’eau, notices et forum. Les rapports et factures d’intervention restent gratuits.</p></div></div><button onClick={onActivate} className="focus-ring mt-5 min-h-12 rounded-xl bg-sanispa-navy px-5 py-3 text-sm font-bold text-white">Activer le Premium en démo</button><p className="mt-3 text-xs text-sanispa-steel">Simulation uniquement : aucun abonnement réel n’est créé.</p></DemoCard>;
}
