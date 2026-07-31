// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { listPresentationDeck } from "~/lib/announcement-data";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
  SILENCE_PHONE_SLIDE_ID,
} from "~/lib/announcement-types";
import type { PresentationSlide } from "~/lib/announcement-types";
import { presentationAssetUrl } from "~/lib/r2-asset-url";
import { seo } from "~/utils/seo";

/** How long each approved slide stays on screen before advancing. */
const SLIDE_INTERVAL_MS = 20_000;

const slideImageUrl = (slide: PresentationSlide): string => {
  if (slide.kind === "silence_phone" || slide.imageUrl) {
    return slide.imageUrl ?? "";
  }

  return presentationAssetUrl(slide.id);
};

/**
 * Uniform scale so the fixed 1920×1080 stage fills the viewport without
 * distortion (covers the screen; may crop on non-16:9 displays).
 */
const useStageScale = (): number => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const next = Math.max(
        window.innerWidth / ANNOUNCEMENT_WIDTH,
        window.innerHeight / ANNOUNCEMENT_HEIGHT
      );
      setScale(next);
    };

    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, []);

  return scale;
};

/**
 * Production display surface for church screens at 1920×1080.
 * No chrome, captions, or controls — only the approved export images
 * (plus the fixed silence-phone system slide).
 */
const PresentationDeck = () => {
  const slides = Route.useLoaderData();
  const [index, setIndex] = useState(0);
  const scale = useStageScale();

  // Binary public URLs for announcements; absolute URL for system slides.
  const imageUrls = useMemo(
    () => slides.map((slide) => slideImageUrl(slide)),
    [slides]
  );

  useEffect(() => {
    setIndex(0);
  }, [slides]);

  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [slides.length]);

  // Warm the next slide so fades do not flash empty while the network catches up.
  useEffect(() => {
    if (imageUrls.length <= 1) {
      return;
    }

    const nextUrl = imageUrls[(index + 1) % imageUrls.length];

    if (!nextUrl) {
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = nextUrl;
  }, [imageUrls, index]);

  // Lock document to a black full-bleed stage (production displays).
  useEffect(() => {
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyBackground = body.style.backgroundColor;
    const previousHtmlBackground = documentElement.style.backgroundColor;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.backgroundColor = "#000";
    documentElement.style.backgroundColor = "#000";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.backgroundColor = previousBodyBackground;
      documentElement.style.backgroundColor = previousHtmlBackground;
    };
  }, []);

  if (slides.length === 0) {
    return (
      <div
        aria-label="No presentation slides"
        className="fixed inset-0 bg-black"
      />
    );
  }

  return (
    <div aria-live="polite" className="fixed inset-0 overflow-hidden bg-black">
      <div
        className="absolute top-1/2 left-1/2 overflow-hidden"
        style={{
          height: ANNOUNCEMENT_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
          width: ANNOUNCEMENT_WIDTH,
        }}
      >
        {imageUrls.map((url, slideIndex) => {
          const slide = slides[slideIndex];
          const isActive = slideIndex === index;
          const isNext =
            imageUrls.length > 1 &&
            slideIndex === (index + 1) % imageUrls.length;
          const isSilence =
            slide?.kind === "silence_phone" ||
            slide?.id === SILENCE_PHONE_SLIDE_ID;

          return (
            <div
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              key={slide?.id ?? url}
              style={{ opacity: isActive ? 1 : 0 }}
            >
              {url ? (
                <img
                  alt=""
                  className="absolute inset-0 size-full object-fill"
                  decoding="async"
                  draggable={false}
                  fetchPriority={isActive ? "high" : "auto"}
                  height={ANNOUNCEMENT_HEIGHT}
                  loading={isActive || isNext ? "eager" : "lazy"}
                  src={url}
                  width={ANNOUNCEMENT_WIDTH}
                />
              ) : (
                <div className="absolute inset-0 bg-black" />
              )}
              {isSilence ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-16">
                  <p
                    className="text-center font-semibold tracking-wide text-white"
                    style={{ fontSize: 72, lineHeight: 1.2 }}
                  >
                    Please silence your phone
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const Route = createFileRoute("/presentation")({
  component: PresentationDeck,
  head: () => ({
    meta: [
      {
        content: "width=1920, height=1080, initial-scale=1, user-scalable=no",
        name: "viewport",
      },
      ...seo({
        description: "Announcement presentation display (1920×1080).",
        title: "Presentation",
      }),
    ],
  }),
  loader: () => listPresentationDeck(),
});
