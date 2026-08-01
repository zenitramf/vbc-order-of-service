// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { listPresentationDeck } from "~/lib/announcement-data";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import type { PresentationSlide } from "~/lib/announcement-types";
import { presentationAssetUrl } from "~/lib/r2-asset-url";
import { seo } from "~/utils/seo";

/** How long each image slide stays on screen before advancing. */
const SLIDE_INTERVAL_MS = 20_000;

const slideMediaUrl = (slide: PresentationSlide): string =>
  // Announcement exports and silence-phone media share this public proxy.
  presentationAssetUrl(slide.id);

const isVideoSlide = (slide: PresentationSlide | undefined): boolean =>
  slide?.mediaKind === "video";

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
 * No chrome, captions, or controls — only approved export images and the
 * silence-phone system slide (image at 20s, video advances on ended).
 */
const PresentationDeck = () => {
  const slides = Route.useLoaderData();
  const [index, setIndex] = useState(0);
  const scale = useStageScale();
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  const mediaUrls = useMemo(
    () => slides.map((slide) => slideMediaUrl(slide)),
    [slides]
  );

  useEffect(() => {
    setIndex(0);
  }, [slides]);

  // Pause inactive videos so only the active slide produces frames.
  useEffect(() => {
    for (const [slideIndex, video] of videoRefs.current) {
      if (slideIndex === index) {
        continue;
      }

      video.pause();
    }
  }, [index]);

  // Image slides: fixed 20s dwell. Video slides: play + advance on `ended`.
  useEffect(() => {
    if (slides.length === 0) {
      return;
    }

    const active = slides[index];
    const slideCount = slides.length;

    if (isVideoSlide(active)) {
      const video = videoRefs.current.get(index);

      if (!video) {
        return;
      }

      video.currentTime = 0;

      const playActive = async () => {
        try {
          await video.play();
        } catch {
          // Autoplay can fail if not muted; silence videos are always muted.
        }
      };

      void playActive();
      return;
    }

    // Lone image stays put; multi-slide deck advances every 20s.
    if (slideCount <= 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % slideCount);
    }, SLIDE_INTERVAL_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [index, slides]);

  // Warm the next image so fades do not flash empty while the network catches up.
  useEffect(() => {
    if (mediaUrls.length <= 1) {
      return;
    }

    const nextIndex = (index + 1) % mediaUrls.length;
    const nextSlide = slides[nextIndex];
    const nextUrl = mediaUrls[nextIndex];

    if (!nextUrl || isVideoSlide(nextSlide)) {
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = nextUrl;
  }, [mediaUrls, index, slides]);

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
        {mediaUrls.map((url, slideIndex) => {
          const slide = slides[slideIndex];
          const isActive = slideIndex === index;
          const isNext =
            mediaUrls.length > 1 &&
            slideIndex === (index + 1) % mediaUrls.length;
          const video = isVideoSlide(slide);

          return (
            <div
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              key={slide?.id ?? url}
              style={{ opacity: isActive ? 1 : 0 }}
            >
              {url && video ? (
                <video
                  autoPlay={isActive}
                  className="absolute inset-0 size-full object-fill"
                  // Solo video loops in place; multi-slide advances on ended.
                  loop={slides.length <= 1}
                  muted
                  onEnded={() => {
                    if (isActive && slides.length > 1) {
                      setIndex((current) => (current + 1) % slides.length);
                    }
                  }}
                  onLoadedData={() => {
                    if (!isActive) {
                      return;
                    }

                    const element = videoRefs.current.get(slideIndex);

                    if (!element) {
                      return;
                    }

                    const playLoaded = async () => {
                      try {
                        await element.play();
                      } catch {
                        // muted autoplay should succeed on kiosk displays
                      }
                    };

                    void playLoaded();
                  }}
                  playsInline
                  preload={isActive || isNext ? "auto" : "metadata"}
                  ref={(element) => {
                    if (element) {
                      videoRefs.current.set(slideIndex, element);
                    } else {
                      videoRefs.current.delete(slideIndex);
                    }
                  }}
                  src={url}
                />
              ) : null}
              {url && !video ? (
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
              ) : null}
              {url ? null : <div className="absolute inset-0 bg-black" />}
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
