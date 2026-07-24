import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaInstaller } from "@/components/PwaInstaller";

export const metadata: Metadata = {
  title: "K-Uniformes · Sistema Administrativo",
  description:
    "Sistema administrativo interno para K-Uniformes Venezuela — inventario, ventas, consignación y más.",
  applicationName: "K-Uniformes",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "K-Uniformes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#101014",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaInstaller />
      </body>
    </html>
  );
}
