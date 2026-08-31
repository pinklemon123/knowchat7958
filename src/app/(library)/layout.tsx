import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LibraryShell from "@/components/library-shell";
import { LIBRARY_SESSION_COOKIE, verifyLibrarySessionToken } from "@/lib/library-auth";

export default async function MatchaLibraryLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const authenticated = await verifyLibrarySessionToken(cookieStore.get(LIBRARY_SESSION_COOKIE)?.value);
  if (!authenticated) redirect("/login");
  return <LibraryShell>{children}</LibraryShell>;
}
