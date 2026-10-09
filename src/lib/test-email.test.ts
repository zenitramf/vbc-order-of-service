import { describe, expect, it } from "vitest";

import { buildTestEmailMessage } from "~/lib/test-email";

describe("test email message", () => {
  it("builds a password-mode message", () => {
    const message = buildTestEmailMessage("2026-10-09T21:30:00Z", "password");

    expect(message.subject).toBe("Test email from Order of Service");
    expect(message.text).toContain("2026-10-09T21:30:00Z");
    expect(message.text).toContain("SMTP authentication mode: password.");
  });

  it("labels the oauth2 mode", () => {
    const message = buildTestEmailMessage("2026-10-09T21:30:00Z", "oauth2");

    expect(message.text).toContain("SMTP authentication mode: OAuth 2.0.");
  });
});
