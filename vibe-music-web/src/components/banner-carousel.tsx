"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { mediaUrl } from "@/lib/media-url";
import type { Banner } from "@/types/catalogue";

function BannerImage({
  banner,
  active,
  number,
}: {
  banner: Banner;
  active: boolean;
  number: number;
}) {
  const url = mediaUrl(banner.bannerUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return url && failedUrl !== url ? (
    <Image
      src={url}
      alt={`轮播图 ${number}`}
      fill
      unoptimized
      priority={active}
      sizes="(max-width: 768px) 80vw, 600px"
      className="object-cover"
      onError={() => setFailedUrl(url)}
    />
  ) : (
    <span className="flex h-full flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
      <ImageOff size={30} aria-hidden="true" />
      <span className="text-xs">轮播图片暂不可用</span>
    </span>
  );
}

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const count = banners.length;
  const active = count ? index % count : 0;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(media.matches);
    const onVisibility = () => setHidden(document.hidden);
    onMotion();
    onVisibility();
    media.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (count < 2 || paused || hovered || focused || hidden || reducedMotion)
      return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % count),
      4000,
    );
    return () => window.clearInterval(timer);
  }, [count, paused, hovered, focused, hidden, reducedMotion]);
  function move(delta: number) {
    setIndex((value) => (value + delta + count) % count);
  }

  if (!count)
    return (
      <div
        role="status"
        className="flex h-[280px] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground"
      >
        暂无轮播图
      </div>
    );
  return (
    <section
      aria-label="推荐轮播"
      aria-roledescription="轮播"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      className="relative"
    >
      <div className="relative h-[280px] overflow-hidden rounded-xl">
        {banners.map((banner, position) => {
          const selected = position === active;
          const previous = position === (active - 1 + count) % count;
          const next = position === (active + 1) % count;
          const visible = selected || previous || next;
          return (
            <div
              key={banner.bannerId}
              role="group"
              aria-roledescription="幻灯片"
              aria-label={`${position + 1} / ${count}`}
              aria-hidden={!selected}
              className={`absolute inset-y-0 left-1/2 w-[80%] overflow-hidden rounded-xl border bg-muted transition-[transform,opacity] duration-500 motion-reduce:transition-none md:w-[60%] ${selected ? "z-10 opacity-100 shadow-paper-lg" : visible ? "z-0 opacity-60" : "pointer-events-none opacity-0"}`}
              style={{
                transform: selected
                  ? "translateX(-50%) scale(1)"
                  : previous
                    ? "translateX(-112%) scale(.83)"
                    : "translateX(12%) scale(.83)",
              }}
            >
              <BannerImage
                banner={banner}
                active={selected}
                number={position + 1}
              />
              {!selected && visible && (
                <button
                  tabIndex={-1}
                  aria-label={`切换至轮播图 ${position + 1}`}
                  onClick={() => setIndex(position)}
                  className="absolute inset-0"
                />
              )}
            </div>
          );
        })}
        {count > 1 && (
          <>
            <button
              aria-label="上一张轮播图"
              onClick={() => move(-1)}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border bg-background/90 p-2 shadow-paper hover:bg-background"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              aria-label="下一张轮播图"
              onClick={() => move(1)}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border bg-background/90 p-2 shadow-paper hover:bg-background"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <div
            aria-label="选择轮播图"
            className="flex flex-wrap justify-center gap-2"
          >
            {banners.map((banner, position) => (
              <button
                key={banner.bannerId}
                aria-label={`轮播图 ${position + 1}`}
                aria-current={position === active ? "true" : undefined}
                onClick={() => setIndex(position)}
                className="flex h-7 w-6 items-center justify-center rounded focus-visible:outline focus-visible:outline-primary"
              >
                <span
                  className={`h-1 rounded-full ${position === active ? "w-5 bg-primary" : "w-3 bg-muted-foreground/30"}`}
                />
              </button>
            ))}
          </div>
          <button
            aria-label={paused ? "启用轮播自动切换" : "暂停轮播自动切换"}
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        </div>
      )}
    </section>
  );
}
