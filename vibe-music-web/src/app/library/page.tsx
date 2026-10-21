import { MusicLibrary } from "@/components/music-library";
import { Suspense } from "react";

export default function LibraryPage() {
  return (
    <Suspense fallback={<p role="status">正在加载曲库...</p>}>
      <MusicLibrary />
    </Suspense>
  );
}
