import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "SANISPA Diagnostic",
  description: "Pré-diagnostic de pannes de spas avec photos, devis et accompagnement à distance.",
  applicationName: "SANISPA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SANISPA",
    statusBarStyle: "default"
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A2342"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
