"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The product's own photo gallery, straight from the store page, with a
 * zoom lightbox. Every image here was published by the store for this
 * exact product.
 */
export function ProductGallery({
  images,
  alt,
  className,
}: {
  images: string[];
  alt: string;
  className?: string;
}) {
  const list = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (index > list.length - 1) setIndex(0);
  }, [list.length, index]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % list.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + list.length) % list.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom, list.length]);

  if (!list.length) return null;

  const current = list[Math.min(index, list.length - 1)];

  return (
    <div className={className}>
      {/* main image */}
      <div className="group relative overflow-hidden rounded-2xl border border-hairline bg-subtle">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full cursor-zoom-in"
          aria-label="Zoom image"
        >
          <div className="relative aspect-square w-full">
            <Image
              src={current}
              alt={alt}
              fill
              sizes="(max-width: 640px) 100vw, 420px"
              className="object-contain p-4"
              unoptimized
            />
          </div>
        </button>

        {list.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
              className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-hairline bg-card/90 text-headline shadow-card transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % list.length)}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-hairline bg-card/90 text-headline shadow-card transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setZoom(true)}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-hairline bg-card/90 text-headline shadow-card"
          aria-label="Expand image"
        >
          <Expand className="h-3.5 w-3.5" />
        </button>

        {list.length > 1 ? (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white">
            {index + 1} / {list.length}
          </div>
        ) : null}
      </div>

      {/* thumbnails */}
      {list.length > 1 ? (
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 bg-subtle transition-colors",
                i === index
                  ? "border-emerald-500"
                  : "border-hairline hover:border-emuted",
              )}
              aria-label={`Image ${i + 1}`}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="56px"
                className="object-contain p-1"
                unoptimized
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* lightbox */}
      {zoom ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {list.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => (i - 1 + list.length) % list.length);
                }}
                className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => (i + 1) % list.length);
                }}
                className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}

          <div
            className="relative max-h-[88vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={current}
              alt={alt}
              width={1200}
              height={1200}
              className="mx-auto max-h-[88vh] w-auto object-contain"
              unoptimized
            />
            {list.length > 1 ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {list.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={cn(
                      "relative h-14 w-14 overflow-hidden rounded-lg border-2",
                      i === index ? "border-emerald-500" : "border-white/20",
                    )}
                    aria-label={`Image ${i + 1}`}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-contain p-1"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
