import { notFound } from "next/navigation";
import { CatalogueDetail } from "@/components/catalogue-detail";

export default async function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) notFound();
  return <CatalogueDetail kind="playlist" id={Number(id)} />;
}
