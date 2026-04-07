import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Jobbagent.no — jobber før de lyses ut",
  description:
    "Analyser LinkedIn-signaler, nyheter og stillingsannonser (NAV / arbeidsplassen). Få kontaktstrategi og ferdig melding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#0a0a0f] font-sans antialiased text-zinc-100`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
