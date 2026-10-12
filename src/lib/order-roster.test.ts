import { describe, expect, it } from "vitest";

import { buildOrderRoster } from "~/lib/order-roster";
import type {
  OrderServiceTemplateJson,
  ServiceTypeCard,
  TeamMemberSummary,
  TeamSummary,
} from "~/lib/order-service-types";

const team = (id: string, name: string, parentName?: string): TeamSummary => ({
  id,
  memberCount: 0,
  name,
  ...(parentName ? { parentName } : {}),
});

const member = (
  id: string,
  firstName: string,
  lastName: string
): TeamMemberSummary => ({
  email: "",
  firstName,
  id,
  lastName,
  notes: "",
  phone: "",
  teamIds: [],
  teamNames: [],
});

const TEAMS: TeamSummary[] = [
  team("ushers", "Ushers"),
  team("counters", "Counters", "Ushers"),
  team("lead-counters", "Lead Counters", "Ushers"),
  team("song-leaders", "Song Leaders"),
];

const MEMBERS: TeamMemberSummary[] = [
  member("m1", "John", "Smith"),
  member("m2", "Jane", "Doe"),
  member("m3", "Bob", "Adams"),
];

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

describe("buildOrderRoster", () => {
  it("names who serves on each team of each card", () => {
    const roster = buildOrderRoster(
      order([
        card({
          requiredTeamIds: ["ushers", "counters"],
          teamAssignments: [
            { memberIds: ["m1", "m2"], teamId: "ushers" },
            { memberIds: ["m3"], teamId: "counters" },
          ],
        }),
      ]),
      TEAMS,
      MEMBERS
    );

    expect(roster.hasTeams).toBe(true);
    expect(roster.cards).toHaveLength(1);
    expect(roster.cards[0]?.cardName).toBe("Sunday Main Service");
    expect(
      roster.cards[0]?.teams.map((entry) => [
        entry.teamName,
        entry.members.map((person) => person.id),
      ])
    ).toEqual([
      ["Counters", ["m3"]],
      ["Ushers", ["m2", "m1"]],
    ]);
    expect(roster.missingRequiredCount).toBe(0);
  });

  it("puts required teams first and keeps sub-team parent context", () => {
    const roster = buildOrderRoster(
      order([
        card({
          optionalTeamIds: ["song-leaders"],
          requiredTeamIds: ["lead-counters"],
          teamAssignments: [{ memberIds: ["m2"], teamId: "lead-counters" }],
        }),
      ]),
      TEAMS,
      MEMBERS
    );

    const [first, second] = roster.cards[0]?.teams ?? [];
    expect(first?.teamName).toBe("Lead Counters");
    expect(first?.parentName).toBe("Ushers");
    expect(first?.required).toBe(true);
    expect(second?.teamName).toBe("Song Leaders");
    expect(second?.required).toBe(false);
  });

  it("reports the shortfall for understaffed required teams", () => {
    const roster = buildOrderRoster(
      order([
        card({
          requiredTeamCounts: { ushers: 2 },
          requiredTeamIds: ["ushers", "counters"],
          teamAssignments: [{ memberIds: ["m1"], teamId: "ushers" }],
        }),
      ]),
      TEAMS,
      MEMBERS
    );

    const ushers = roster.cards[0]?.teams.find(
      (entry) => entry.teamId === "ushers"
    );
    const counters = roster.cards[0]?.teams.find(
      (entry) => entry.teamId === "counters"
    );
    expect(ushers?.missingCount).toBe(1);
    expect(counters?.missingCount).toBe(1);
    expect(roster.missingRequiredCount).toBe(2);
  });

  it("includes ad-hoc assigned teams that the template did not configure", () => {
    const roster = buildOrderRoster(
      order([
        card({
          teamAssignments: [{ memberIds: ["m1"], teamId: "song-leaders" }],
        }),
      ]),
      TEAMS,
      MEMBERS
    );

    expect(roster.cards[0]?.teams.map((entry) => entry.teamId)).toEqual([
      "song-leaders",
    ]);
  });

  it("sorts members by last name and ignores stale member ids", () => {
    const roster = buildOrderRoster(
      order([
        card({
          requiredTeamIds: ["ushers"],
          teamAssignments: [
            { memberIds: ["m1", "gone", "m3"], teamId: "ushers" },
          ],
        }),
      ]),
      TEAMS,
      MEMBERS
    );

    const ushers = roster.cards[0]?.teams[0];
    expect(ushers?.members.map((person) => person.id)).toEqual(["m3", "m1"]);
    expect(ushers?.assignedCount).toBe(2);
  });

  it("counts hymn activities that still need a selection", () => {
    const roster = buildOrderRoster(
      order([
        card({
          activities: [
            { activityName: "Hymn", activityType: "hymn", id: "a1" },
            {
              activityName: "Hymn",
              activityType: "hymn",
              hymnId: "h1",
              id: "a2",
            },
            { activityName: "Prayer", activityType: "prayer", id: "a3" },
          ],
        }),
      ]),
      TEAMS,
      MEMBERS
    );

    expect(roster.missingHymnCount).toBe(1);
  });

  it("omits cards without teams and reports an empty roster", () => {
    const roster = buildOrderRoster(
      order([
        card({ id: "empty" }),
        card({ id: "staffed", requiredTeamIds: ["ushers"] }),
      ]),
      TEAMS,
      MEMBERS
    );

    expect(roster.cards.map((entry) => entry.cardId)).toEqual(["staffed"]);

    const empty = buildOrderRoster(order([card()]), TEAMS, MEMBERS);
    expect(empty.hasTeams).toBe(false);
    expect(empty.cards).toEqual([]);
  });
});
