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
