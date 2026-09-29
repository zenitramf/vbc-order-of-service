import { describe, expect, it } from "vitest";

import {
  buildPasswordResetEmail,
  PASSWORD_RESET_SUBJECT,
} from "~/lib/user-onboarding";

const RESET_URL = "https://example.com/api/auth/reset-password/token";

describe("buildPasswordResetEmail", () => {
  it("greets the user by first name and includes the url", () => {
    const email = buildPasswordResetEmail(
      { firstName: "Ada", name: "Ada Lovelace" },
      RESET_URL
    );

    expect(email.subject).toBe(PASSWORD_RESET_SUBJECT);
    expect(email.text).toContain("Hi Ada,");
    expect(email.text).toContain(RESET_URL);
  });

  it("falls back to the display name when no first name is set", () => {
    const email = buildPasswordResetEmail({ name: "Grace Hopper" }, RESET_URL);

    expect(email.text).toContain("Hi Grace Hopper,");
  });

  it("falls back to a generic greeting for users without names", () => {
    const email = buildPasswordResetEmail({}, RESET_URL);

    expect(email.text).toContain("Hi there,");
  });
});
