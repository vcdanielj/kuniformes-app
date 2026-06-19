import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K-Uniformes · Sistema Administrativo",
  description:
    "Sistema administrativo interno para K-Uniformes Venezuela — inventario, ventas, consignación y más.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
