import type {
  OrderRoster,
  OrderServiceTemplateJson,
  RosterCard,
  RosterMember,
  RosterTeam,
  ServiceTypeCard,
  TeamMemberSummary,
  TeamSummary,
} from "~/lib/order-service-types";
import {
  getAssignmentMemberIds,
  getCardTeamIds,
  getRequiredTeamCount,
  isTeamRequired,
} from "~/lib/teams-logic";

type RosterMemberSource = Pick<
  TeamMemberSummary,
  "firstName" | "id" | "lastName"
>;

const byMemberName = (first: RosterMember, second: RosterMember): number =>
  first.lastName.localeCompare(second.lastName) ||
  first.firstName.localeCompare(second.firstName);

/**
 * Required teams first so understaffed must-fill teams are seen before
 * optional ones, then alphabetical so Ushers, Counters, and Lead Counters
 * always appear in the same place.
 */
const byRosterTeam = (first: RosterTeam, second: RosterTeam): number =>
  Number(second.required) - Number(first.required) ||
  first.teamName.localeCompare(second.teamName);

const buildCardRoster = (
  card: ServiceTypeCard,
  teamsById: Map<string, TeamSummary>,
  membersById: Map<string, RosterMemberSource>
): RosterCard | null => {
  const teamIds = getCardTeamIds(card);

  if (teamIds.length === 0) {
    return null;
  }

  const teams = teamIds.map((teamId): RosterTeam => {
    const team = teamsById.get(teamId);
    const members = getAssignmentMemberIds(card, teamId)
      .map((memberId) => membersById.get(memberId))
      .filter((member): member is RosterMemberSource => member !== undefined)
      .map((member) => ({
        firstName: member.firstName,
        id: member.id,
        lastName: member.lastName,
      }))
      // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target lacks toSorted.
      .sort(byMemberName);
    const required = isTeamRequired(card, teamId);
    const requiredCount = getRequiredTeamCount(card, teamId);

    return {
      assignedCount: members.length,
      members,
      missingCount: required ? Math.max(0, requiredCount - members.length) : 0,
      ...(team?.parentName ? { parentName: team.parentName } : {}),
      required,
      requiredCount,
      teamId,
      teamName: team?.name ?? teamId,
    };
  });

  return {
    cardId: card.id,
    cardName: card.typeName,
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target lacks toSorted.
    teams: teams.sort(byRosterTeam),
  };
};

/**
 * Build the at-a-glance roster for an order: who serves on each team of each
 * service card, by name, plus the gaps that still block publishing. Pure and
 * shared by the dashboard, month planner, and order page so every surface
 * answers "who are the ushers and counters?" the same way.
 */
export const buildOrderRoster = (
  order: OrderServiceTemplateJson,
  teams: readonly TeamSummary[],
  members: readonly RosterMemberSource[]
): OrderRoster => {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const membersById = new Map(members.map((member) => [member.id, member]));
  const cards = order.service_type
    .map((card) => buildCardRoster(card, teamsById, membersById))
    .filter((rosterCard): rosterCard is RosterCard => rosterCard !== null);

  return {
    cards,
    hasTeams: cards.length > 0,
    missingHymnCount: order.service_type.reduce(
      (count, card) =>
        count +
        card.activities.filter(
          (activity) => activity.activityType === "hymn" && !activity.hymnId
        ).length,
      0
    ),
    missingRequiredCount: cards.reduce(
      (count, rosterCard) =>
        count + rosterCard.teams.filter((team) => team.missingCount > 0).length,
      0
    ),
  };
};
