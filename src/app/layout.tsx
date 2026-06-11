import type { Metadata } from "next";
import { Jost } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

const jost = Jost({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Driven Talent — Workforce Solutions",
  description:
    "Driven Talent is a California staffing operation pairing handpicked talent with clients in hospitality, healthcare, warehouse, and manufacturing.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={jost.variable}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
