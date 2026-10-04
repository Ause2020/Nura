import type { Metadata } from "next";
import { JetBrains_Mono, Playfair_Display } from "next/font/google";
import "@fontsource/plus-jakarta-sans/300.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import { AuthRecoveryRedirect } from "@/components/auth/auth-recovery-redirect";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nura — Tu inocuidad, finalmente clara",
  description:
    "Software de inocuidad alimentaria. Plan HACCP, monitoreo de PCC, auditorías, documentos y CAPA en un solo lugar. Hecho por ingenieros de inocuidad, para ingenieros de inocuidad.",
  keywords: [
    "HACCP",
    "inocuidad alimentaria",
    "inocuidad",
    "monitoreo PCC",
    "auditorías",
    "CAPA",
    "documentos controlados",
    "ISO 22000",
    "LATAM",
  ],
  openGraph: {
    title: "Nura — Tu inocuidad, finalmente clara",
    description:
      "HACCP, monitoreo y auditorías. En un solo lugar.",
    url: "https://nurahq.com",
    siteName: "Nura",
    locale: "es_LA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${playfair.variable} ${jetbrains.variable} font-sans antialiased`}>
        <AuthRecoveryRedirect />
        {children}
      </body>
    </html>
  );
}
