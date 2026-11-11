import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Dental Clinic",
  description: "Dental clinic practice management",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (ColorZilla, QuillBot…) add attributes to html/body before React loads; ignore those only.
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning><AppShell>{children}</AppShell></body></html>;
}
