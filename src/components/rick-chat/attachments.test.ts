import { describe, expect, it } from "vitest";

import {
  attachmentKind,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  validateAttachment,
} from "~/components/rick-chat/attachments";

const meta = (overrides: { name?: string; size?: number; type?: string }) => ({
  name: "photo.jpg",
  size: 1024,
  type: "image/jpeg",
  ...overrides,
});

describe("attachmentKind", () => {
  it("recognises supported media types", () => {
    expect(attachmentKind(meta({ type: "image/jpeg" }))).toBe("image");
    expect(attachmentKind(meta({ type: "image/png" }))).toBe("image");
    expect(attachmentKind(meta({ type: "image/webp" }))).toBe("image");
    expect(attachmentKind(meta({ type: "application/pdf" }))).toBe("pdf");
  });

  it("falls back to the filename extension when the type is missing", () => {
    expect(attachmentKind({ name: "lyrics.PDF", type: "" })).toBe("pdf");
    expect(attachmentKind({ name: "schedule.jpeg", type: "" })).toBe("image");
    expect(attachmentKind({ name: "shot.webp", type: " " })).toBe("image");
  });

  it("rejects unsupported attachments", () => {
    expect(
      attachmentKind(meta({ name: "notes.txt", type: "text/plain" }))
    ).toBe(null);
    expect(attachmentKind(meta({ name: "clip.mp4", type: "video/mp4" }))).toBe(
      null
    );
    expect(attachmentKind(meta({ name: "archive.zip", type: "" }))).toBe(null);
  });
});

describe("validateAttachment", () => {
  it("accepts supported attachments under the limits", () => {
    expect(validateAttachment(meta({}))).toBe("image");
    expect(validateAttachment(meta({ type: "application/pdf" }))).toBe("pdf");
  });

  it("accepts attachments exactly at the limit", () => {
    expect(
      validateAttachment(meta({ size: MAX_IMAGE_BYTES, type: "image/png" }))
    ).toBe("image");
    expect(
      validateAttachment(meta({ size: MAX_PDF_BYTES, type: "application/pdf" }))
    ).toBe("pdf");
  });

  it("rejects unsupported attachments with a friendly message", () => {
    expect(() =>
      validateAttachment(meta({ name: "notes.txt", type: "" }))
    ).toThrow(/"notes.txt" isn't supported/u);
  });

  it("rejects oversized images", () => {
    expect(() =>
      validateAttachment(
        meta({ name: "huge.png", size: MAX_IMAGE_BYTES + 1, type: "image/png" })
      )
    ).toThrow(/"huge.png" is 25\.0 MB\. The limit is 25\.0 MB\./u);
  });

  it("rejects oversized PDFs", () => {
    expect(() =>
      validateAttachment(
        meta({
          name: "big.pdf",
          size: MAX_PDF_BYTES + 1,
          type: "application/pdf",
        })
      )
    ).toThrow(/"big.pdf" is 10\.0 MB\. The limit is 10\.0 MB\./u);
  });
});
