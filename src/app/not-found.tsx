import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-5 px-6"><p className="text-sm text-muted-foreground">404</p><h1 className="text-3xl font-semibold">Page not found</h1><p className="text-muted-foreground">This page is unavailable. Return to the clinic home to continue.</p><Button asChild><Link href="/">Back to home</Link></Button></main>;
}
