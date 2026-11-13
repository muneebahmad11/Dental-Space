'use client';
import { usePathname } from 'next/navigation';
import { ClinicSession } from '@/components/live/session';
import { NavProgress } from '@/components/nav-progress';
// The operator console and password pages are not clinic workspaces and never load clinic scope.
export function AppShell({children}:{children:React.ReactNode}){const path=usePathname();return <><NavProgress/>{path.startsWith('/operator')||path.startsWith('/auth/')?children:<ClinicSession>{children}</ClinicSession>}</>;}
