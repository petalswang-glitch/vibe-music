"use client";

import Image from "next/image";
import { Disc3, MicVocal } from "lucide-react";
import { useState } from "react";
import { mediaUrl } from "@/lib/media-url";

export function CoverImage({ src, alt, round = false }: { src: string | null; alt: string; round?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const Icon = round ? MicVocal : Disc3;
  const url = mediaUrl(src);
  return <div className={`relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted ${round ? "rounded-full" : "rounded-xl"}`}>
    {url && failedUrl !== url ? <Image src={url} alt={alt} fill unoptimized sizes="(max-width: 768px) 40vw, 200px" className="object-cover" onError={() => setFailedUrl(url)} /> : <Icon aria-hidden="true" className="h-1/3 w-1/3 text-muted-foreground/60" />}
  </div>;
}
