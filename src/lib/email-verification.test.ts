import { describe, expect, it } from "vitest";

import { resolveEmailVerifiedAfterEmailUpdate } from "~/lib/email-verification";

describe("resolveEmailVerifiedAfterEmailUpdate", () => {
  it("preserves verification when the email is unchanged", () => {
    expect(
      resolveEmailVerifiedAfterEmailUpdate({
        currentEmail: "member@example.com",
        currentEmailVerified: true,
        nextEmail: "member@example.com",
      })
    ).toBe(true);
  });

  it("keeps unverified unchanged emails unverified", () => {
    expect(
      resolveEmailVerifiedAfterEmailUpdate({
        currentEmail: "member@example.com",
        currentEmailVerified: false,
        nextEmail: "member@example.com",
      })
    ).toBe(false);
  });

  it("clears verification when the email changes", () => {
    expect(
      resolveEmailVerifiedAfterEmailUpdate({
        currentEmail: "old@example.com",
        currentEmailVerified: true,
        nextEmail: "new@example.com",
      })
    ).toBe(false);
  });
});
