import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SANISPA Diagnostic",
  description: "Pré-diagnostic de pannes de spas avec photos, devis et accompagnement à distance."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
