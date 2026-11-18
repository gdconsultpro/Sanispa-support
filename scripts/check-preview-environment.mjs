// Refuse unsafe previews before building. Never log credential values.
if (process.env.VERCEL_ENV === "preview") {
  const expectedRef = "nkfoboqponvropiggndv";
  const fail = (message) => {
    console.error(`SANISPA : prévisualisation refusée — ${message}`);
    process.exit(1);
  };
  let hostname;
  try {
    hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
  } catch {
    fail("URL de recette absente ou invalide.");
  }
  if (hostname !== `${expectedRef}.supabase.co`)
    fail("la base doit être exclusivement celle de recette.");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("clé serveur de recette absente.");
  if (serviceKey.startsWith("ey")) {
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(serviceKey.split(".")[1], "base64url").toString(),
      );
    } catch {
      fail("clé serveur invalide.");
    }
    if (claims.ref !== expectedRef || claims.role !== "service_role")
      fail("clé serveur associée à un autre projet.");
  }
  if (!/^(?:sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || ""))
    fail("Stripe doit être configuré en mode TEST.");
  if (!/^txr_[A-Za-z0-9]+$/.test(process.env.STRIPE_PARTNER_TAX_RATE_ID || ""))
    fail("taux de TVA partenaire de recette absent.");
  console.log("SANISPA : isolation recette et mode Stripe TEST vérifiés.");
}

// Production is a separate build: never publish recipe data or TEST payments.
if (process.env.VERCEL_ENV === "production") {
  const fail = (message) => {
    console.error(`SANISPA : production refusée — ${message}`);
    process.exit(1);
  };
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://rdxkhoajsiytgfikxjkr.supabase.co")
    fail("URL Supabase de production incorrecte.");
  if (process.env.NEXT_PUBLIC_APP_URL !== "https://support.sani-spa.fr")
    fail("URL publique de production incorrecte.");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("clé serveur absente.");
  if (serviceKey.startsWith("ey")) {
    let claims;
    try { claims = JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url").toString()); }
    catch { fail("clé serveur invalide."); }
    if (claims.ref !== "rdxkhoajsiytgfikxjkr" || claims.role !== "service_role")
      fail("clé serveur associée à un autre projet.");
  }
  if (!/^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || ""))
    fail("une clé Stripe LIVE est requise.");
  if (!/^txr_[A-Za-z0-9]+$/.test(process.env.STRIPE_PARTNER_TAX_RATE_ID || ""))
    fail("taux TVA LIVE absent.");
  if (!(process.env.STRIPE_WEBHOOK_SECRET || "").startsWith("whsec_"))
    fail("signature du webhook Stripe absente.");
  for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_NOTIFICATION_EMAIL", "OPENAI_API_KEY"])
    if (!process.env[key]) fail(`configuration ${key} absente.`);
  if ((process.env.CRON_SECRET || "").length < 32) fail("secret des rappels absent ou trop court.");
  console.log("SANISPA : production isolée, Stripe LIVE et services requis configurés.");
}
