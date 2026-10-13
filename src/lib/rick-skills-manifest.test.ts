import { describe, expect, it } from "vitest";

// The generator is the shared source of truth for parsing SKILL.md files;
// this test fails whenever a SKILL.md changes without regenerating.
// oxlint-disable-next-line import/no-relative-parent-imports
import { buildRickSkillsManifest } from "../../scripts/generate-rick-skills-manifest.mjs";
// oxlint-disable-next-line import/no-relative-parent-imports
import { rickSkillsManifest } from "../../workers/announcement-image-gen/src/rick-skills-manifest";

describe("rickSkillsManifest", () => {
  it("matches the SKILL.md sources (run pnpm generate:rick-skills)", () => {
    expect(rickSkillsManifest).toEqual(buildRickSkillsManifest());
  });

  it("ships the hymn-lyrics skill with the chorus-once rule", () => {
    const skill = rickSkillsManifest.skills.find(
      (entry) => entry.name === "hymn-lyrics"
    );

    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/lyrics/iu);
    expect(skill?.body).toContain("written out once only");
    expect(skill?.body).toContain("Verse 1");
    expect(skill?.body).toContain("Chorus");
  });
});
