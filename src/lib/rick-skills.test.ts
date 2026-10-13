import { describe, expect, it } from "vitest";

// Rick's skill registry lives in the sidecar Worker; it is plain AI SDK
// tool wiring over the generated manifest, so it can be exercised here.
// oxlint-disable-next-line import/no-relative-parent-imports
import { getRickSkillRegistry } from "../../workers/announcement-image-gen/src/rick-skills";

describe("getRickSkillRegistry", () => {
  it("advertises hymn-lyrics in the catalog prompt", async () => {
    const catalog = await getRickSkillRegistry().systemPrompt();

    expect(catalog).toContain("activate_skill");
    expect(catalog).toContain("hymn-lyrics");
  });

  it("activate_skill returns the hymn-lyrics skill body", async () => {
    const tools = getRickSkillRegistry().tools();
    const activate = tools.activate_skill;

    expect(activate).toBeDefined();
    expect(tools.read_skill_resource).toBeDefined();

    const result = await activate?.execute?.(
      { name: "hymn-lyrics" },
      { context: undefined, messages: [], toolCallId: "test" }
    );

    expect(result).toContain('<skill_content name="hymn-lyrics">');
    expect(result).toContain("written out once only");
    expect(result).toContain("Verse 1");
  });
});
