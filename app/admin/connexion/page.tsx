"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { StepHeader } from "@/components/StepHeader";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { authHeaders } from "@/lib/storage";

type Factor = { id: string; friendly_name?: string };
export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"checking" | "login" | "enroll" | "verify">("checking");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const openAdmin = useCallback(async () => {
    const response = await fetch("/api/admin/session", { method: "POST", headers: await authHeaders() });
    if (!response.ok) throw new Error((await response.json()).error);
    window.location.replace("/admin");
  }, []);
  const inspect = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) { setMode("login"); return; }
    const response = await fetch("/api/admin/session", { headers: await authHeaders() });
    const result = await response.json();
    if (!response.ok) { setMode("login"); throw new Error(result.error); }
    setEmail(result.email);
    if (!result.mfaRequired) { await openAdmin(); return; }
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) throw listed.error;
    const verified = listed.data.totp.filter(f => f.status === "verified");
    setFactors(verified);
    setFactorId(verified[0]?.id ?? "");
    setMode(verified.length ? "verify" : "enroll");
  }, [openAdmin]);
  useEffect(() => { inspect().catch(e => { setMode("login"); setError(e.message || "Connexion indisponible."); }); }, [inspect]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
      setPassword("");
      if (error) throw new Error("Adresse ou mot de passe incorrect. Vérifiez aussi la confirmation de votre adresse.");
      await inspect();
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion indisponible."); }
    finally { setBusy(false); }
  }
  async function enroll() {
    setBusy(true); setError("");
    try {
      const supabase = getSupabaseBrowser();
      const listed = await supabase.auth.mfa.listFactors();
      if (listed.error) throw listed.error;
      for (const factor of listed.data.all.filter(f => f.factor_type === "totp" && f.status === "unverified")) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "SANISPA Administration" });
      if (error) throw error;
      setFactorId(data.id); setQr(data.totp.qr_code); setMode("verify");
    } catch { setError("Association impossible. Réessayez dans un instant."); }
    finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const supabase = getSupabaseBrowser();
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
      setCode("");
      if (verified.error) throw new Error("Code incorrect ou expiré. Saisissez le nouveau code affiché par votre application.");
      setQr(""); await openAdmin();
    } catch (e) { setError(e instanceof Error ? e.message : "Vérification impossible."); }
    finally { setBusy(false); }
  }
  async function switchAccount() {
    await getSupabaseBrowser().auth.signOut({ scope: "local" });
    setMode("login"); setQr(""); setCode(""); setError("");
  }
  return <AppShell compact>
    <StepHeader eyebrow="Administration" title="Connexion sécurisée" description="L’accès aux dossiers nécessite un compte autorisé et le code de votre application d’authentification." />
    <div className="mx-auto max-w-lg space-y-5 rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
      {mode === "checking" && <p>Vérification de votre session…</p>}
      {mode === "login" && <form onSubmit={login} className="space-y-4">
        <Field label="Adresse e-mail administrateur" name="email" type="email" value={email} onChange={setEmail} required />
        <Field label="Mot de passe" name="password" type="password" value={password} onChange={setPassword} required />
        <Button type="submit" disabled={busy}>{busy ? "Connexion…" : "Continuer"}</Button>
        <Link href="/mot-de-passe-oublie" className="block text-sm font-bold underline">Créer ou réinitialiser mon mot de passe</Link>
      </form>}
      {mode === "enroll" && <div className="space-y-4"><p>Compte autorisé : <strong>{email}</strong></p><p>Associez une application d’authentification sur votre téléphone. Elle générera un code à chaque connexion.</p><Button onClick={enroll} disabled={busy}>Associer mon application</Button></div>}
      {mode === "verify" && <form onSubmit={verify} className="space-y-4">
        <p>Compte autorisé : <strong>{email}</strong></p>
        {qr && <div><p>Scannez ce code avec votre application d’authentification, puis saisissez le code à six chiffres qu’elle affiche.</p>{/* The QR remains in memory and is never logged or saved. */}<Image unoptimized width={240} height={240} src={qr} alt="Code QR pour associer votre application d’authentification" className="mx-auto my-4 h-60 w-60 max-w-full" /></div>}
        {factors.length > 1 && <label className="block">Application<select className="mt-2 w-full rounded-md border p-3" value={factorId} onChange={e => setFactorId(e.target.value)}>{factors.map(f => <option value={f.id} key={f.id}>{f.friendly_name || "Application d’authentification"}</option>)}</select></label>}
        <label className="block font-bold">Code à six chiffres<input className="focus-ring mt-2 block w-full rounded-md border p-3 text-lg" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>
        <Button type="submit" disabled={busy}>{busy ? "Vérification…" : "Ouvrir l’administration"}</Button>
      </form>}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {mode !== "checking" && <button type="button" onClick={switchAccount} className="text-sm underline">Utiliser un autre compte</button>}
      <p className="text-xs text-sanispa-steel">Session administrateur limitée à une heure. En cas de perte de votre téléphone, contactez le responsable du compte SANISPA pour rétablir l’accès.</p>
    </div>
  </AppShell>;
}
