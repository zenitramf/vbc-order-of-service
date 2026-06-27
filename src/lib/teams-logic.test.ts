import { describe, expect, it } from "vitest";

import type {
  OrderServiceTemplateJson,
  ServiceTypeCard,
  Team,
  TeamSummary,
} from "~/lib/order-service-types";
import {
  DEFAULT_TEAMS,
  buildTeamTree,
  findMissingRequiredTeams,
  getAssignmentMemberIds,
  hasMissingRequiredTeams,
  isValidEmail,
  memberTeamNames,
  normalizeServiceCardTeams,
  setAssignmentMemberIds,
  teamsById,
  validateTeamMember,
} from "~/lib/teams-logic";

const team = (
  id: string,
  name: string,
  parentTeamId?: string
): TeamSummary => ({
  id,
  memberCount: 0,
  name,
  parentTeamId,
});

const card = (overrides: Partial<ServiceTypeCard> = {}): ServiceTypeCard => ({
  activities: [],
  id: "card-1",
  typeName: "Sunday Main Service",
  ...overrides,
});

const order = (cards: ServiceTypeCard[]): OrderServiceTemplateJson => ({
  name: "Sunday Service",
  service_type: cards,
});

describe("DEFAULT_TEAMS", () => {
  it("includes every required top-level and sub team", () => {
    const names = DEFAULT_TEAMS.map((seed) => seed.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "Musicians",
        "Singers",
        "Ushers",
        "Counters",
        "Pastors",
        "Senior Pastor",
        "Spanish Pastor",
        "Youth Pastor",
        "Teachers",
        "Childrens",
        "Teens",
        "Young Adults",
        "Song Leaders",
      ])
    );
  });

  it("only references parents that exist in the seed", () => {
    const ids = new Set(DEFAULT_TEAMS.map((seed) => seed.id));

    for (const seed of DEFAULT_TEAMS) {
      if (seed.parentId) {
        expect(ids.has(seed.parentId)).toBe(true);
      }
    }
  });

  it("nests Counters under Ushers", () => {
    const counters = DEFAULT_TEAMS.find((seed) => seed.id === "counters");

    expect(counters?.parentId).toBe("ushers");
  });
});

describe("isValidEmail", () => {
  it("accepts well formed addresses and trims whitespace", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("  person@example.com  ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("person")).toBe(false);
    expect(isValidEmail("person@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("validateTeamMember", () => {
  it("returns no errors for a valid member", () => {
    expect(validateTeamMember({ email: "a@b.com", firstName: "Ann" })).toEqual(
      []
    );
  });

  it("allows a blank email", () => {
    expect(validateTeamMember({ email: "  ", firstName: "Ann" })).toEqual([]);
  });

  it("requires a first name", () => {
    expect(validateTeamMember({ email: "", firstName: "  " })).toContain(
      "First name is required."
    );
  });

  it("rejects an invalid email", () => {
    expect(validateTeamMember({ email: "nope", firstName: "Ann" })).toContain(
      "Email must be a valid email address."
    );
  });
});

describe("buildTeamTree", () => {
  const teams: TeamSummary[] = [
    team("ushers", "Ushers"),
    team("counters", "Counters", "ushers"),
    team("musicians", "Musicians"),
    team("pastors", "Pastors"),
    team("youth-pastor", "Youth Pastor", "pastors"),
    team("senior-pastor", "Senior Pastor", "pastors"),
  ];

  it("groups sub-teams under their parent, sorted by name", () => {
    const tree = buildTeamTree(teams);
    const pastors = tree.find((node) => node.id === "pastors");

    expect(tree.map((node) => node.name)).toEqual([
      "Musicians",
      "Pastors",
      "Ushers",
    ]);
    expect(pastors?.children.map((child) => child.name)).toEqual([
      "Senior Pastor",
      "Youth Pastor",
    ]);
  });

  it("surfaces orphaned sub-teams at the top level", () => {
    const tree = buildTeamTree([team("orphan", "Orphan", "missing")]);

    expect(tree.map((node) => node.id)).toEqual(["orphan"]);
  });
});

describe("memberTeamNames", () => {
  it("maps ids to names and ignores unknown ids", () => {
    const lookup = teamsById([
      { id: "musicians", name: "Musicians" },
      { id: "singers", name: "Singers" },
    ] as Team[]);

    expect(
      memberTeamNames({ teamIds: ["singers", "musicians", "ghost"] }, lookup)
    ).toEqual(["Musicians", "Singers"]);
  });
});

describe("normalizeServiceCardTeams", () => {
  it("dedupes ids and removes optional teams that are also required", () => {
    const result = normalizeServiceCardTeams(
      card({
        optionalTeamIds: ["singers", "singers", "musicians"],
        requiredTeamIds: ["musicians", "musicians"],
      })
    );

    expect(result.requiredTeamIds).toEqual(["musicians"]);
    expect(result.optionalTeamIds).toEqual(["singers"]);
  });

  it("drops assignments for unknown teams and empty member lists", () => {
    const result = normalizeServiceCardTeams(
      card({
        optionalTeamIds: ["singers"],
        requiredTeamIds: ["musicians"],
        teamAssignments: [
          { memberIds: ["m1", "m1"], teamId: "musicians" },
          { memberIds: [], teamId: "singers" },
          { memberIds: ["x"], teamId: "ghost" },
        ],
      })
    );

    expect(result.teamAssignments).toEqual([
      { memberIds: ["m1"], teamId: "musicians" },
    ]);
  });

  it("defaults missing fields to empty arrays", () => {
    expect(normalizeServiceCardTeams(card())).toEqual({
      optionalTeamIds: [],
      requiredTeamIds: [],
      teamAssignments: [],
    });
  });
});

describe("assignment helpers", () => {
  it("reads member ids for a team", () => {
    const value = card({
      teamAssignments: [{ memberIds: ["m1", "m2"], teamId: "musicians" }],
    });

    expect(getAssignmentMemberIds(value, "musicians")).toEqual(["m1", "m2"]);
    expect(getAssignmentMemberIds(value, "singers")).toEqual([]);
  });

  it("replaces member ids for a team and dedupes", () => {
    const next = setAssignmentMemberIds(
      [{ memberIds: ["old"], teamId: "musicians" }],
      "musicians",
      ["m1", "m1", "m2"]
    );

    expect(next).toEqual([{ memberIds: ["m1", "m2"], teamId: "musicians" }]);
  });

  it("removes the assignment when set to an empty list", () => {
    const next = setAssignmentMemberIds(
      [
        { memberIds: ["m1"], teamId: "musicians" },
        { memberIds: ["m3"], teamId: "singers" },
      ],
      "musicians",
      []
    );

    expect(next).toEqual([{ memberIds: ["m3"], teamId: "singers" }]);
  });

  it("handles an undefined assignment list", () => {
    expect(setAssignmentMemberIds(undefined, "musicians", ["m1"])).toEqual([
      { memberIds: ["m1"], teamId: "musicians" },
    ]);
  });
});

describe("findMissingRequiredTeams", () => {
  const lookup = teamsById([
    { id: "musicians", name: "Musicians" },
    { id: "singers", name: "Singers" },
  ] as Team[]);

  it("reports required teams with no assigned members", () => {
    const missing = findMissingRequiredTeams(
      order([
        card({
          id: "main",
          requiredTeamIds: ["musicians", "singers"],
          teamAssignments: [{ memberIds: ["m1"], teamId: "musicians" }],
        }),
      ]),
      lookup
    );

    expect(missing).toEqual([
      {
        cardId: "main",
        cardName: "Sunday Main Service",
        teamId: "singers",
        teamName: "Singers",
      },
    ]);
  });

  it("treats fully staffed required teams as satisfied", () => {
    const value = order([
      card({
        requiredTeamIds: ["musicians"],
        teamAssignments: [{ memberIds: ["m1"], teamId: "musicians" }],
      }),
    ]);

    expect(findMissingRequiredTeams(value, lookup)).toEqual([]);
    expect(hasMissingRequiredTeams(value, lookup)).toBe(false);
  });

  it("falls back to the team id when the name is unknown", () => {
    const missing = findMissingRequiredTeams(
      order([card({ requiredTeamIds: ["ghost"] })]),
      lookup
    );

    expect(missing[0].teamName).toBe("ghost");
    expect(
      hasMissingRequiredTeams(
        order([card({ requiredTeamIds: ["ghost"] })]),
        lookup
      )
    ).toBe(true);
  });

  it("ignores cards without required teams", () => {
    expect(findMissingRequiredTeams(order([card()]), lookup)).toEqual([]);
  });
});
