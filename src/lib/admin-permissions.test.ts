import { describe, expect, it } from "vitest";

import { PERMISSION_RESOURCES } from "~/lib/admin-permissions";

describe("PERMISSION_RESOURCES", () => {
  it("no longer offers the removed announcements and library resources", () => {
    const keys = PERMISSION_RESOURCES.map((resource) => resource.key);

    expect(keys).not.toContain("announcements");
    expect(keys).not.toContain("library");
  });

  it("still offers the active portal resources", () => {
    const keys = PERMISSION_RESOURCES.map((resource) => resource.key);

    expect(keys).toContain("orders");
    expect(keys).toContain("hymns");
    expect(keys).toContain("teams");
  });
});
