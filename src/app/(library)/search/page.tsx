import LibraryBrowser from "@/components/library-browser";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const { q = "" } = await searchParams; return <LibraryBrowser mode="search" initialQuery={q} />; }
