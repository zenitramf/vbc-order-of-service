import type {
  OrderServiceTemplateJson,
  ServiceTypeCard,
  Team,
  TeamAssignment,
  TeamMember,
  TeamSummary,
  TeamTreeNode,
} from "~/lib/order-service-types";

/**
 * Default team hierarchy seeded for the Order of Service. Sub-teams reference
 * their parent by slug so the seed and the in-app tree stay consistent.
 */
export interface SeedTeam {
  id: string;
  name: string;
  parentId?: string;
}

export const DEFAULT_TEAMS: SeedTeam[] = [
  { id: "musicians", name: "Musicians" },
  { id: "singers", name: "Singers" },
  { id: "ushers", name: "Ushers" },
  { id: "counters", name: "Counters", parentId: "ushers" },
  { id: "pastors", name: "Pastors" },
  { id: "senior-pastor", name: "Senior Pastor", parentId: "pastors" },
  { id: "spanish-pastor", name: "Spanish Pastor", parentId: "pastors" },
  { id: "youth-pastor", name: "Youth Pastor", parentId: "pastors" },
  { id: "teachers", name: "Teachers" },
  { id: "childrens-teachers", name: "Childrens", parentId: "teachers" },
  { id: "teens-teachers", name: "Teens", parentId: "teachers" },
  { id: "young-adults-teachers", name: "Young Adults", parentId: "teachers" },
  { id: "song-leaders", name: "Song Leaders" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const isValidEmail = (email: string): boolean =>
  EMAIL_REGEX.test(email.trim());

/**
 * Validate a team member form payload. Returns a list of human readable errors;
 * an empty list means the payload is valid.
 */
export const validateTeamMember = (input: {
  email: string;
  firstName: string;
}): string[] => {
  const errors: string[] = [];

  if (!input.firstName.trim()) {
    errors.push("First name is required.");
  }

  if (input.email.trim() && !isValidEmail(input.email)) {
    errors.push("Email must be a valid email address.");
  }

  return errors;
};

const byName = (first: { name: string }, second: { name: string }): number =>
  first.name.localeCompare(second.name);

/**
 * Build a two-level team hierarchy: top-level teams hold their direct
 * sub-teams. Orphaned sub-teams (missing parent) are surfaced at the top level
 * so they are never hidden from the UI.
 */
export const buildTeamTree = (teams: TeamSummary[]): TeamTreeNode[] => {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const childrenByParent = new Map<string, TeamSummary[]>();
  const roots: TeamSummary[] = [];

  for (const team of teams) {
    if (team.parentTeamId && byId.has(team.parentTeamId)) {
      const siblings = childrenByParent.get(team.parentTeamId) ?? [];
      siblings.push(team);
      childrenByParent.set(team.parentTeamId, siblings);
    } else {
      roots.push(team);
    }
  }

  // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target does not include toSorted.
  return [...roots].sort(byName).map((team) => ({
    ...team,
    children: [...(childrenByParent.get(team.id) ?? [])]
      // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target does not include toSorted.
      .sort(byName)
      .map((child) => ({ ...child, children: [] })),
  }));
};

/**
 * Validate a proposed parent for a team against the two-level hierarchy
 * invariant. Returns a human-readable error, or null when the parent is
 * allowed. Because the tree is only ever two levels deep, requiring the parent
 * to be a root and the team itself to have no children makes cycles impossible
 * without walking the graph.
 */
export const validateTeamParent = (input: {
  id: string;
  parentTeamId: string | null;
  teams: Pick<TeamSummary, "id" | "parentTeamId">[];
}): string | null => {
  const { id, parentTeamId, teams } = input;

  if (!parentTeamId) {
    return null;
  }

  if (parentTeamId === id) {
    return "A team cannot be its own parent team.";
  }

  const parent = teams.find((candidate) => candidate.id === parentTeamId);

  if (!parent) {
    return "Parent team does not exist.";
  }

  if (parent.parentTeamId) {
    return "Teams can only nest one level deep.";
  }

  if (teams.some((candidate) => candidate.parentTeamId === id)) {
    return "A team with sub-teams cannot become a sub-team.";
  }

  return null;
};

/** Resolve the display names of the teams a member belongs to. */
export const memberTeamNames = (
  member: Pick<TeamMember, "teamIds">,
  teamsById: Map<string, Team>
): string[] =>
  member.teamIds
    .map((teamId) => teamsById.get(teamId)?.name)
    .filter((name): name is string => name !== undefined)
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target lacks toSorted.
    .sort((first, second) => first.localeCompare(second));

const uniqueStrings = (values: string[]): string[] => [
  ...new Set(values.filter(Boolean)),
];

/** Minimum members a required team needs before an order can be published. */
export const REQUIRED_TEAM_MINIMUM = 1;

/** Most members a required team can demand before an order can be published. */
export const MAX_REQUIRED_TEAM_COUNT = 10;

/** Clamp a required-member count into the supported 1-10 range. */
export const clampRequiredTeamCount = (count: number): number =>
  Math.min(
    MAX_REQUIRED_TEAM_COUNT,
    Math.max(REQUIRED_TEAM_MINIMUM, Math.round(count))
  );

/**
 * Members a required team needs on a card before an order can be published.
 * Falls back to the minimum of one when the template has not set a count.
 */
export const getRequiredTeamCount = (
  card: ServiceTypeCard,
  teamId: string
): number => {
  const count = card.requiredTeamCounts?.[teamId];

  return count === undefined
    ? REQUIRED_TEAM_MINIMUM
    : clampRequiredTeamCount(count);
};

/**
 * Normalize the team-related fields of a service card so persisted data stays
 * tidy: dedupe team ids, drop optional teams that are also required, and merge
 * duplicate assignments while deduping their members. Empty assignments are
 * kept so a team the planner added to a card survives a save even before any
 * member has been chosen.
 */
export const normalizeServiceCardTeams = (
  card: ServiceTypeCard
): Pick<
  ServiceTypeCard,
  | "optionalTeamIds"
  | "requiredTeamCounts"
  | "requiredTeamIds"
  | "teamAssignments"
> => {
  const requiredTeamIds = uniqueStrings(card.requiredTeamIds ?? []);
  const optionalTeamIds = uniqueStrings(card.optionalTeamIds ?? []).filter(
    (teamId) => !requiredTeamIds.includes(teamId)
  );
  const memberIdsByTeam = new Map<string, string[]>();

  for (const assignment of card.teamAssignments ?? []) {
    const existing = memberIdsByTeam.get(assignment.teamId) ?? [];
    memberIdsByTeam.set(assignment.teamId, [
      ...existing,
      ...assignment.memberIds,
    ]);
  }

  const teamAssignments = [...memberIdsByTeam].map(([teamId, memberIds]) => ({
    memberIds: uniqueStrings(memberIds),
    teamId,
  }));

  // Keep required-member counts only for teams that are still required, and
  // clamp each into the supported range so stray values never persist.
  const requiredTeamCounts: Record<string, number> = {};

  for (const teamId of requiredTeamIds) {
    const count = card.requiredTeamCounts?.[teamId];

    if (count !== undefined && count !== REQUIRED_TEAM_MINIMUM) {
      requiredTeamCounts[teamId] = clampRequiredTeamCount(count);
    }
  }

  return {
    optionalTeamIds,
    requiredTeamCounts,
    requiredTeamIds,
    teamAssignments,
  };
};

/** Whether a team is marked required on a service card. */
export const isTeamRequired = (
  card: ServiceTypeCard,
  teamId: string
): boolean => (card.requiredTeamIds ?? []).includes(teamId);

/** Whether a team is marked optional (template-suggested) on a service card. */
export const isTeamOptional = (
  card: ServiceTypeCard,
  teamId: string
): boolean => (card.optionalTeamIds ?? []).includes(teamId);

/**
 * Whether a team is configured on the template (required or optional) rather
 * than added ad-hoc by the planner. Template teams stay on the card and so are
 * not removable from the order editor.
 */
export const isTeamConfigured = (
  card: ServiceTypeCard,
  teamId: string
): boolean => isTeamRequired(card, teamId) || isTeamOptional(card, teamId);

/**
 * The teams shown for a service card during assignment: every required team
 * and every optional team from the template (always visible, even unstaffed)
 * plus any team the planner has added ad-hoc.
 */
export const getCardTeamIds = (card: ServiceTypeCard): string[] =>
  uniqueStrings([
    ...(card.requiredTeamIds ?? []),
    ...(card.optionalTeamIds ?? []),
    ...(card.teamAssignments ?? []).map((assignment) => assignment.teamId),
  ]);

/** Add an empty assignment for a team if it is not already present. */
export const addTeamAssignment = (
  assignments: TeamAssignment[] | undefined,
  teamId: string
): TeamAssignment[] => {
  const current = assignments ?? [];

  if (current.some((assignment) => assignment.teamId === teamId)) {
    return current;
  }

  return [...current, { memberIds: [], teamId }];
};

/** Remove a team's assignment entirely (used when the planner drops a team). */
export const removeTeamAssignment = (
  assignments: TeamAssignment[] | undefined,
  teamId: string
): TeamAssignment[] =>
  (assignments ?? []).filter((assignment) => assignment.teamId !== teamId);

/**
 * Filter team members by a free-text query matched against their name and
 * email (case-insensitive). An empty query returns the list unchanged.
 */
export const filterTeamMembers = <
  T extends { email: string; firstName: string; lastName: string },
>(
  members: T[],
  query: string
): T[] => {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return members;
  }

  return members.filter((member) =>
    `${member.firstName} ${member.lastName} ${member.email}`
      .toLowerCase()
      .includes(normalized)
  );
};

/** Two-letter initials for an avatar fallback. */
export const getInitials = (firstName: string, lastName: string): string => {
  const initials =
    `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();

  return initials || "?";
};

/** Member ids currently assigned to a team on a given service card. */
export const getAssignmentMemberIds = (
  card: ServiceTypeCard,
  teamId: string
): string[] =>
  card.teamAssignments?.find((assignment) => assignment.teamId === teamId)
    ?.memberIds ?? [];

/** Return a new assignment list with the team set to the given member ids. */
export const setAssignmentMemberIds = (
  assignments: TeamAssignment[] | undefined,
  teamId: string,
  memberIds: string[]
): TeamAssignment[] => {
  const others = (assignments ?? []).filter(
    (assignment) => assignment.teamId !== teamId
  );

  if (memberIds.length === 0) {
    return others;
  }

  return [...others, { memberIds: uniqueStrings(memberIds), teamId }];
};

export interface MissingRequiredTeam {
  cardId: string;
  cardName: string;
  teamId: string;
  teamName: string;
}

/** Count the assigned members of a team, ignoring stale ids when a live
 * membership lookup is supplied. Without the lookup every assigned id counts. */
const countValidAssignedMembers = (
  card: ServiceTypeCard,
  teamId: string,
  membersByTeam?: Map<string, Set<string>>
): number => {
  const assigned = getAssignmentMemberIds(card, teamId);

  if (!membersByTeam) {
    return assigned.length;
  }

  const current = membersByTeam.get(teamId);

  return assigned.filter((memberId) => current?.has(memberId)).length;
};

/**
 * Find every required team on every service card that is not staffed by enough
 * members. Used to gate publishing of an order of service. When
 * `membersByTeam` is supplied, only members who currently belong to the team
 * count toward the requirement, so stale ids left in `order_json` cannot
 * satisfy the gate.
 */
export const findMissingRequiredTeams = (
  order: OrderServiceTemplateJson,
  teamsById: Map<string, Team>,
  membersByTeam?: Map<string, Set<string>>
): MissingRequiredTeam[] => {
  const missing: MissingRequiredTeam[] = [];

  for (const card of order.service_type) {
    for (const teamId of card.requiredTeamIds ?? []) {
      if (
        countValidAssignedMembers(card, teamId, membersByTeam) <
        getRequiredTeamCount(card, teamId)
      ) {
        missing.push({
          cardId: card.id,
          cardName: card.typeName,
          teamId,
          teamName: teamsById.get(teamId)?.name ?? teamId,
        });
      }
    }
  }

  return missing;
};

export const hasMissingRequiredTeams = (
  order: OrderServiceTemplateJson,
  teamsById: Map<string, Team>,
  membersByTeam?: Map<string, Set<string>>
): boolean =>
  findMissingRequiredTeams(order, teamsById, membersByTeam).length > 0;

/**
 * Drop assigned member ids that no longer belong to their team. Returns a
 * cleaned copy of the cards so stale ids never persist into `order_json`.
 */
export const pruneStaleAssignments = (
  order: OrderServiceTemplateJson,
  membersByTeam: Map<string, Set<string>>
): OrderServiceTemplateJson => ({
  ...order,
  service_type: order.service_type.map((card) => {
    if (!card.teamAssignments?.length) {
      return card;
    }

    const teamAssignments = card.teamAssignments.map((assignment) => {
      const current = membersByTeam.get(assignment.teamId);

      return {
        ...assignment,
        memberIds: assignment.memberIds.filter((memberId) =>
          current?.has(memberId)
        ),
      };
    });

    return { ...card, teamAssignments };
  }),
});

export const teamsById = (teams: Team[]): Map<string, Team> =>
  new Map(teams.map((team) => [team.id, team]));
