"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "./Button";
import { useClientSession } from "./SessionPrivacy";
import { localDeclarationChanged, readLocalProgress, type LocalDeclarationState } from "@/lib/storage";

export function DeclarationEntry({ home = false }: { home?: boolean }) {
  const pathname = usePathname();
  const email = useClientSession()?.user.email?.toLowerCase();
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    function update(draft: LocalDeclarationState) {
      setHasDraft(Boolean(draft && (!email || !draft.email || draft.email.trim().toLowerCase() === email)));
    }
    function read() {
      update(readLocalProgress()?.draft ?? null);
    }
    function onChange(event: Event) {
      update((event as CustomEvent<LocalDeclarationState>).detail);
    }
    read();
    window.addEventListener(localDeclarationChanged, onChange);
    window.addEventListener("storage", read);
    window.addEventListener("pageshow", read);
    return () => {
      window.removeEventListener(localDeclarationChanged, onChange);
      window.removeEventListener("storage", read);
      window.removeEventListener("pageshow", read);
    };
  }, [email, pathname]);

  const label = hasDraft ? "Reprendre ma déclaration" : "Déclarer une panne";
  const href = hasDraft ? "/reprendre?local=1" : "/diagnostic";
  if (!home) return <Link href={href} className="focus-ring rounded-full bg-sanispa-blue px-4 py-3 text-white">{label}</Link>;
  return <>
    <ButtonLink href={href}>{label}</ButtonLink>
    {hasDraft ? <ButtonLink href="/diagnostic?new=1" variant="secondary">Nouvelle demande</ButtonLink> : null}
  </>;
}
