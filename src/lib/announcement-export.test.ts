import { describe, expect, it } from "vitest";

import {
  announcementJpegCaptureOptions,
  htmlToImageResourceCacheKey,
} from "~/lib/announcement-export";
import { r2AssetUrl } from "~/lib/r2-asset-url";

describe("announcementJpegCaptureOptions", () => {
  it("keys html-to-image cache by the full asset URL", () => {
    expect(announcementJpegCaptureOptions.includeQueryParams).toBe(true);
  });

  it("does not collide two /api/r2-asset backgrounds", () => {
    const first = r2AssetUrl("announcements/a/backgrounds/v1.jpg");
    const second = r2AssetUrl("announcements/b/backgrounds/v2.jpg");

    expect(htmlToImageResourceCacheKey(first, false)).toBe(
      htmlToImageResourceCacheKey(second, false)
    );
    expect(htmlToImageResourceCacheKey(first)).not.toBe(
      htmlToImageResourceCacheKey(second)
    );
    expect(htmlToImageResourceCacheKey(first)).toBe(first);
    expect(htmlToImageResourceCacheKey(second)).toBe(second);
  });
});
