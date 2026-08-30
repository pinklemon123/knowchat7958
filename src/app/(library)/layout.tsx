import type { ReactNode } from "react";
import LibraryShell from "@/components/library-shell";

export default function MatchaLibraryLayout({ children }: { children: ReactNode }) {
  return <LibraryShell>{children}</LibraryShell>;
}
