import { describe, expect, it } from "vitest";

import {
  TEAMS_CHANNEL_BODY,
  buildTeamsChannelMessage,
  buildTeamsChannelSubject,
  isValidChannelEmail,
  normalizeChannelEmail,
} from "~/lib/teams-channel";

describe("teams channel post", () => {
  it("builds the channel post subject from the service date", () => {
    expect(buildTeamsChannelSubject("2026-10-11")).toBe(
      "Order of Service for 2026-10-11"
    );
  });

  it("uses the fixed channel post body", () => {
    expect(TEAMS_CHANNEL_BODY).toBe("see attached");
  });

  it("normalizes channel email addresses", () => {
    expect(normalizeChannelEmail("  Channel@Example.com ")).toBe(
      "channel@example.com"
    );
  });

  it("validates channel email addresses", () => {
    expect(isValidChannelEmail("channel@example.com")).toBe(true);
    expect(isValidChannelEmail("  channel@example.com ")).toBe(true);
    expect(isValidChannelEmail("not-an-email")).toBe(false);
    expect(isValidChannelEmail("")).toBe(false);
  });

  it("builds a queue message for the channel email", () => {
    const message = buildTeamsChannelMessage({
      bucket: "vbc-order-of-service-pdfs",
      channelEmail: "Channel@Example.com",
      filename: "oos/order-id/2026-10-11 - Sunday Order.pdf",
      objectKey: "oos/order-id/2026-10-11 - Sunday Order.pdf",
      orderId: "order-id",
      serviceDate: "2026-10-11",
    });

    expect(message).toEqual({
      attachment: {
        bucket: "vbc-order-of-service-pdfs",
        contentType: "application/pdf",
        filename: "oos/order-id/2026-10-11 - Sunday Order.pdf",
        objectKey: "oos/order-id/2026-10-11 - Sunday Order.pdf",
      },
      orderId: "order-id",
      subject: "Order of Service for 2026-10-11",
      text: "see attached",
      to: "channel@example.com",
      type: "teams-channel",
    });
  });
});
