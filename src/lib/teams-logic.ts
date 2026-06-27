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

/**
 * Normalize the team-related fields of a service card so persisted data stays
 * tidy: dedupe team ids, drop optional teams that are also required, and remove
 * assignments for teams the card no longer references or with no members.
 */
export const normalizeServiceCardTeams = (
  card: ServiceTypeCard
): Pick<
  ServiceTypeCard,
  "optionalTeamIds" | "requiredTeamIds" | "teamAssignments"
> => {
  const requiredTeamIds = uniqueStrings(card.requiredTeamIds ?? []);
  const optionalTeamIds = uniqueStrings(card.optionalTeamIds ?? []).filter(
    (teamId) => !requiredTeamIds.includes(teamId)
  );
  const knownTeamIds = new Set([...requiredTeamIds, ...optionalTeamIds]);
  const teamAssignments = (card.teamAssignments ?? [])
    .filter((assignment) => knownTeamIds.has(assignment.teamId))
    .map((assignment) => ({
      memberIds: uniqueStrings(assignment.memberIds),
      teamId: assignment.teamId,
    }))
    .filter((assignment) => assignment.memberIds.length > 0);

  return { optionalTeamIds, requiredTeamIds, teamAssignments };
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

/**
 * Find every required team on every service card that has no member assigned.
 * Used to gate publishing of an order of service.
 */
export const findMissingRequiredTeams = (
  order: OrderServiceTemplateJson,
  teamsById: Map<string, Team>
): MissingRequiredTeam[] => {
  const missing: MissingRequiredTeam[] = [];

  for (const card of order.service_type) {
    for (const teamId of card.requiredTeamIds ?? []) {
      if (getAssignmentMemberIds(card, teamId).length === 0) {
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
  teamsById: Map<string, Team>
): boolean => findMissingRequiredTeams(order, teamsById).length > 0;

export const teamsById = (teams: Team[]): Map<string, Team> =>
  new Map(teams.map((team) => [team.id, team]));
