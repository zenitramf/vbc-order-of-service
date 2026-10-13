/**
 * Rick's bundled Agent Skills.
 *
 * Skills live as SKILL.md files under `src/skills/<name>/` and are baked
 * into this Worker through the generated manifest (see
 * `rick-skills-manifest.ts` and `scripts/generate-rick-skills-manifest.mjs`).
 *
 * Why not `SkillRegistry` from `agents/skills` directly: that module's
 * top level imports the experimental skill-script runner, which needs the
 * optional peers `just-bash` and `@cloudflare/codemode` — neither is
 * installed, and installing both just to serve instruction-only skills
 * would bloat this deliberately slim Worker and break both bundlers
 * (verified: `pnpm build` fails on the missing `just-bash` exports).
 * So this module mirrors the observable `SkillRegistry` contract for
 * manifest-sourced, script-free skills — same catalog prompt, same
 * `activate_skill` / `read_skill_resource` tool names, descriptions, and
 * `<skill_content>` wrapping — over the exact `SkillManifest` shape
 * `agents/skills` defines. Swapping in the real `SkillRegistry` later
 * (e.g. if skill scripts are ever wanted) is a change to this file only.
 *
 * Skills are instructions for the model, never enforcement: anything that
 * must *always* hold (like the hymn lyrics layout) is enforced in portal
 * code, not here.
 */
import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

import { rickSkillsManifest } from "./rick-skills-manifest";

export interface RickSkillRegistry {
  /** Catalog prompt for the system prompt, or null when no skills exist. */
  systemPrompt: () => Promise<string | null>;
  tools: () => ToolSet;
}

type SkillEntry = (typeof rickSkillsManifest.skills)[number];

const wrapSkillContent = (skill: SkillEntry): string =>
  [
    `<skill_content name="${skill.name}">`,
    skill.body.trim(),
    "",
    "</skill_content>",
  ].join("\n");

const createRickSkillRegistry = (): RickSkillRegistry => {
  const { skills } = rickSkillsManifest;
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const names = skills.map((skill) => skill.name);

  return {
    systemPrompt: () =>
      Promise.resolve(
        names.length
          ? [
              "Available skills. When a task matches a skill, use activate_skill with its name before proceeding.",
              "",
              ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
            ].join("\n")
          : null
      ),
    tools: () => {
      const tools: ToolSet = {};

      if (!names.length) {
        return tools;
      }

      const nameSchema = z.enum(names as [string, ...string[]]);

      tools.activate_skill = tool({
        description:
          "Activate a skill by name. Use this when the user's task matches one of the available skills.",
        execute: ({ name }) => {
          const skill = byName.get(name);

          return skill
            ? [
                wrapSkillContent(skill),
                "",
                "Bundled resources:",
                "No bundled resources.",
              ].join("\n")
            : `Skill not found: ${name}`;
        },
        inputSchema: z.object({ name: nameSchema }),
      });
      tools.read_skill_resource = tool({
        description:
          "Read a bundled resource from an available skill by relative path. Pass name and path, or use a qualified path like skill-name/references/file.md.",
        execute: ({ name, path }) => {
          const skillName = name ?? path.split("/")[0] ?? "";
          const resourcePath = name ? path : path.split("/").slice(1).join("/");
          const resource = byName
            .get(skillName)
            ?.resources?.find((entry) => entry.path === resourcePath);

          return resource
            ? resource.content
            : `Resource not found: ${skillName}/${resourcePath}`;
        },
        inputSchema: z.object({
          name: nameSchema.optional(),
          path: z.string().min(1),
        }),
      });

      return tools;
    },
  };
};

let registry: RickSkillRegistry | null = null;

/** Rick's shared skill registry, built once per isolate. */
export const getRickSkillRegistry = (): RickSkillRegistry => {
  registry ??= createRickSkillRegistry();

  return registry;
};
