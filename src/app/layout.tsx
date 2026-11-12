import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { themeInitScript } from "@/components/theme";

// Atkinson Hyperlegible: built for character recognition, so names, phone numbers and amounts read correctly at a glance.
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin", "latin-ext"], variable: "--font-atkinson", display: "swap" });

export const metadata: Metadata = {
  title: "Dentalspace",
  description: "Dental clinic practice management",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (ColorZilla, QuillBot…) add attributes to html/body before React loads; ignore those only.
  return <html lang="en" className={atkinson.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head><body suppressHydrationWarning><AppShell>{children}</AppShell></body></html>;
}
