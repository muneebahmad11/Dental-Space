import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { themeInitScript } from "@/components/theme";

// Urbanist: a rounded geometric sans that matches the soft card shapes; self-hosted by next/font, so no outside requests.
const urbanist = Urbanist({ subsets: ["latin", "latin-ext"], variable: "--font-urbanist", display: "swap" });

export const metadata: Metadata = {
  title: "Dentalspace",
  description: "Dental clinic practice management",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (ColorZilla, QuillBot…) add attributes to html/body before React loads; ignore those only.
  return <html lang="en" className={urbanist.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head><body suppressHydrationWarning><AppShell>{children}</AppShell></body></html>;
}
