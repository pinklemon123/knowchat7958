import LibraryBrowser from "@/components/library-browser";
export default async function FileLibraryPage({ searchParams }: { searchParams: Promise<{ collection?: string }> }) {
  const { collection } = await searchParams;
  return <LibraryBrowser mode="library" initialCollectionId={collection} />;
}
