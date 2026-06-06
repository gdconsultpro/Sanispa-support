import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({ href, label = "Retour" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-sanispa-blue focus-ring">
      <ArrowLeft size={18} aria-hidden="true" />
      {label}
    </Link>
  );
}
