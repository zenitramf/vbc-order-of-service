/**
 * Plain-English summaries of what a Rick tool call will do, shown on the
 * in-chat approval card instead of the raw JSON arguments.
 *
 * The summary is derived from the actual tool input, so it cannot drift from
 * what will really run. IDs are only ever shown shortened, and when an
 * earlier tool result in the same chat named the record (see
 * `collectRickEntityNames`), the summary uses that name.
 */

export interface RickToolSummary {
  destructive: boolean;
  details: string[];
  headline: string;
}

type RecordLike = Record<string, unknown>;
type Names = ReadonlyMap<string, string> | undefined;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MAX_DETAIL_LINES = 10;
const MAX_LONG_TEXT = 80;
const CANNOT_BE_UNDONE = "This cannot be undone.";

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): RecordLike => (isRecord(value) ? value : {});

const stringField = (record: RecordLike, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

/** Like `stringField`, but also accepts numbers (e.g. a hymn number). */
const textField = (record: RecordLike, key: string): string | undefined => {
  const value = record[key];

  if (typeof value === "number") {
    return String(value);
  }

  return stringField(record, key);
};

const recordField = (
  record: RecordLike,
  key: string
): RecordLike | undefined => {
  const value = record[key];
  return isRecord(value) ? value : undefined;
};

const arrayField = (record: RecordLike, key: string): unknown[] => {
  const value = record[key];
  return Array.isArray(value) ? value : [];
};

const quote = (value: string): string => `“${value}”`;

const plural = (count: number, singular: string): string =>
  `${count} ${count === 1 ? singular : `${singular}s`}`;

const shortId = (id: string): string =>
  id.length <= 12 ? id : `${id.slice(0, 8)}…`;

const DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/u;
const MONTH_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})$/u;

const parseDate = (value: string): Date | undefined => {
  const match = DATE_PATTERN.exec(value);

  if (!match?.groups) {
    return undefined;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const date = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isRealDate ? date : undefined;
};

/** "2026-10-19" → "Mon, Oct 19, 2026" (service dates are plain calendar days). */
const formatServiceDate = (value: string | undefined): string | undefined => {
  const date = value ? parseDate(value) : undefined;

  return date
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        weekday: "short",
        year: "numeric",
      }).format(date)
    : undefined;
};

/** "2026-10-19" → "Oct 19, 2026". */
const formatShortDate = (value: string | undefined): string | undefined => {
  const date = value ? parseDate(value) : undefined;

  return date
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      }).format(date)
    : undefined;
};

/** "2026-10" → "October 2026". */
const formatMonth = (value: string | undefined): string | undefined => {
  const match = value ? MONTH_PATTERN.exec(value) : null;

  if (!match?.groups) {
    return undefined;
  }

  const month = Number(match.groups.month);

  if (month < 1 || month > 12) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(Number(match.groups.year), month - 1, 1)));
};

/** "musicKey" / "service_date" → "Music key" / "Service date". */
const humanizeKey = (key: string): string => {
  const words = key
    .replaceAll("_", " ")
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .toLowerCase()
    .trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

const capitalize = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const resolveName = (
  id: string | undefined,
  names: Names
): string | undefined => (id ? names?.get(id) : undefined);

/** A fallback detail line for a record we could not name from the chat. */
const unknownIdDetail = (
  label: string,
  id: string | undefined,
  names: Names
): string | undefined =>
  id && !resolveName(id, names) ? `${label} ID: ${shortId(id)}` : undefined;

const pushDefined = (details: string[], line: string | undefined): void => {
  if (line) {
    details.push(line);
  }
};

/** One line per service card: its name, its activities, and its staffing. */
const summarizeCards = (cards: unknown[], names: Names): string[] => {
  const lines: string[] = [];

  for (const card of cards.map((entry) => asRecord(entry))) {
    const typeName = stringField(card, "typeName") ?? "Section";
    const activities = arrayField(card, "activities").map((entry) => {
      const activity = asRecord(entry);
      return (
        stringField(activity, "activityName") ??
        humanizeKey(stringField(activity, "activityType") ?? "activity")
      );
    });

    let line = activities.length
      ? `${typeName}: ${activities.join(", ")}`
      : `${typeName}: no activities yet`;

    const counts = recordField(card, "requiredTeamCounts") ?? {};
    const required = arrayField(card, "requiredTeamIds")
      .filter((id): id is string => typeof id === "string")
      .map((teamId) => {
        const teamName = resolveName(teamId, names) ?? shortId(teamId);
        const count = counts[teamId];
        return typeof count === "number" && count > 1
          ? `${teamName} ×${count}`
          : teamName;
      });

    if (required.length) {
      line += ` · Needs ${required.join(", ")}`;
    }

    const assigned = new Set<string>();

    for (const assignment of arrayField(card, "teamAssignments")) {
      for (const memberId of arrayField(asRecord(assignment), "memberIds")) {
        if (typeof memberId === "string") {
          assigned.add(memberId);
        }
      }
    }

    if (assigned.size) {
      line += ` · ${plural(assigned.size, "member")} assigned`;
    }

    lines.push(line);
  }

  if (lines.length > MAX_DETAIL_LINES) {
    return [
      ...lines.slice(0, MAX_DETAIL_LINES),
      `…and ${plural(lines.length - MAX_DETAIL_LINES, "more section")}`,
    ];
  }

  return lines;
};

const DATE_LIKE_KEY = /date|played/iu;

const genericStringDetail = (
  key: string,
  value: string,
  names: Names
): string => {
  const label = humanizeKey(key.replace(/Ids$/u, "").replace(/Id$/u, ""));
  const isIdKey = key === "id" || key.endsWith("Id");
  const resolved = isIdKey ? resolveName(value, names) : undefined;

  if (resolved) {
    return `${label}: ${quote(resolved)}`;
  }

  if (isIdKey) {
    return `${label} ID: ${shortId(value)}`;
  }

  const date = DATE_LIKE_KEY.test(key) ? formatServiceDate(value) : undefined;

  if (date) {
    return `${label}: ${date}`;
  }

  return value.length > MAX_LONG_TEXT
    ? `${label}: ${value.length} characters`
    : `${label}: ${value}`;
};

const namedArrayItem = (item: unknown, names: Names): string | undefined => {
  if (typeof item === "string") {
    return resolveName(item, names);
  }

  const record = asRecord(item);
  return (
    stringField(record, "name") ??
    stringField(record, "title") ??
    stringField(record, "activityName") ??
    stringField(record, "typeName")
  );
};

const genericArrayDetail = (
  label: string,
  value: unknown[],
  names: Names
): string => {
  const namedItems = value
    .map((item) => namedArrayItem(item, names))
    .filter((item): item is string => item !== undefined);

  if (namedItems.length === value.length && namedItems.length > 0) {
    const shown = namedItems.slice(0, 6).join(", ");
    return `${label}: ${shown}${namedItems.length > 6 ? ", …" : ""}`;
  }

  return `${label}: ${plural(value.length, "item")}`;
};

const genericScalarDetail = (
  label: string,
  value: boolean | number
): string => {
  if (typeof value === "boolean") {
    return `${label}: ${value ? "Yes" : "No"}`;
  }

  return `${label}: ${value}`;
};

/** Readable fallback lines for any tool input we do not know specifically. */
const genericDetails = (
  record: RecordLike,
  names: Names,
  depth = 0
): string[] => {
  const details: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const label = humanizeKey(key.replace(/Ids$/u, "").replace(/Id$/u, ""));

    if (typeof value === "string") {
      details.push(genericStringDetail(key, value, names));
    } else if (typeof value === "number" || typeof value === "boolean") {
      details.push(genericScalarDetail(label, value));
    } else if (Array.isArray(value)) {
      details.push(genericArrayDetail(label, value, names));
    } else if (isRecord(value) && depth === 0) {
      for (const line of genericDetails(value, names, depth + 1)) {
        details.push(`${label} — ${line}`);
      }
    }
  }

  return details.slice(0, MAX_DETAIL_LINES);
};

type ToolSummarizer = (record: RecordLike, names: Names) => RickToolSummary;

const summary = (
  headline: string,
  details: string[] = [],
  destructive = false
): RickToolSummary => ({ destructive, details, headline });

const deleteSummary = (
  record: RecordLike,
  names: Names,
  noun: string,
  article: "a" | "an",
  extra?: string
): RickToolSummary => {
  const id = stringField(record, "id");
  const name = resolveName(id, names);
  const details: string[] = [];

  pushDefined(details, unknownIdDetail(capitalize(noun), id, names));
  details.push(extra ? `${extra} ${CANNOT_BE_UNDONE}` : CANNOT_BE_UNDONE);

  return summary(
    name ? `Delete the ${noun} ${quote(name)}` : `Delete ${article} ${noun}`,
    details,
    true
  );
};

const isDryRun = (record: RecordLike): boolean =>
  record.dry_run === true || record.dryRun === true;

const createOrderSummary: ToolSummarizer = (record, names) => {
  const title = stringField(record, "title");
  const date = formatServiceDate(stringField(record, "serviceDate"));
  const templateId = stringField(record, "templateId");
  const templateName = resolveName(templateId, names);
  const details: string[] = [];

  if (templateName) {
    details.push(`From the template ${quote(templateName)}`);
  } else {
    pushDefined(details, unknownIdDetail("Template", templateId, names));
  }

  return summary(
    `Create a new order${title ? `, ${quote(title)}` : ""}${date ? `, for ${date}` : ""}`,
    details
  );
};

const saveOrderSummary: ToolSummarizer = (record, names) => {
  const title = stringField(record, "title");
  const date = formatServiceDate(stringField(record, "serviceDate"));
  const order = recordField(record, "order");
  const details = order
    ? summarizeCards(arrayField(order, "service_type"), names)
    : [];

  if (!title) {
    pushDefined(
      details,
      unknownIdDetail("Order", stringField(record, "id"), names)
    );
  }

  return summary(
    `Save changes to the order${title ? ` ${quote(title)}` : ""}${date ? ` for ${date}` : ""}`,
    details
  );
};

const publishOrderSummary: ToolSummarizer = (record, names) => {
  const id = stringField(record, "id");
  const name = resolveName(id, names);
  const details: string[] = [];

  pushDefined(details, unknownIdDetail("Order", id, names));

  return isDryRun(record)
    ? summary(
        `Preview publishing the order${name ? ` ${quote(name)}` : ""} — nothing will be published`,
        details
      )
    : summary(
        `Publish the order${name ? ` ${quote(name)}` : ""} and render its PDF`,
        details
      );
};

const sendOrderEmailSummary: ToolSummarizer = (record, names) => {
  const id = stringField(record, "orderId") ?? stringField(record, "id");
  const name = resolveName(id, names);
  const details: string[] = [];

  pushDefined(details, unknownIdDetail("Order", id, names));

  return isDryRun(record)
    ? summary(
        `Preview emailing the order${name ? ` ${quote(name)}` : ""} — no email will be sent`,
        details
      )
    : summary(
        `Email the published order${name ? ` ${quote(name)}` : ""} to the configured recipients`,
        details
      );
};

const saveTemplateSummary: ToolSummarizer = (record, names) => {
  const template = recordField(record, "template");
  const name =
    stringField(record, "name") ??
    (template ? stringField(template, "name") : undefined) ??
    resolveName(stringField(record, "id"), names);
  const details = template
    ? summarizeCards(arrayField(template, "service_type"), names)
    : [];

  return summary(
    stringField(record, "id")
      ? `Save changes to the template${name ? ` ${quote(name)}` : ""}`
      : `Create a new template${name ? `, ${quote(name)}` : ""}`,
    details
  );
};

const planMonthSummary: ToolSummarizer = (record) => {
  const month = formatMonth(stringField(record, "month"));

  return summary(
    month
      ? `Create the missing orders for ${month}`
      : "Create the missing orders for a month",
    [
      "Uses your Month Planner settings — orders that already exist are kept as they are.",
    ]
  );
};

const saveHymnSummary: ToolSummarizer = (record, names) => {
  const name = stringField(record, "name");
  const hymnNumber = textField(record, "hymnNumber");
  const musicKey = stringField(record, "musicKey");
  const language = stringField(record, "language");
  const details: string[] = [];
  const facts = [
    hymnNumber ? `Number ${hymnNumber}` : undefined,
    musicKey ? `Key of ${musicKey}` : undefined,
    language ? capitalize(language) : undefined,
  ].filter((fact): fact is string => fact !== undefined);

  if (facts.length) {
    details.push(facts.join(" · "));
  }

  const lastPlayed = formatShortDate(stringField(record, "lastPlayed"));

  if (lastPlayed) {
    details.push(`Last played ${lastPlayed}`);
  }

  const lyrics = stringField(record, "lyricsMarkdown");

  if (lyrics) {
    details.push(`Lyrics included (${plural(lyrics.length, "character")})`);
  }

  const source = resolveName(stringField(record, "sourceId"), names);

  if (source) {
    details.push(`Source: ${quote(source)}`);
  }

  return summary(
    stringField(record, "id")
      ? `Save changes to the hymn${name ? ` ${quote(name)}` : ""}`
      : `Add a new hymn${name ? `, ${quote(name)}` : ""}`,
    details
  );
};

const updateHymnSummary: ToolSummarizer = (record, names) => {
  const id = stringField(record, "id");
  const name = resolveName(id, names);
  const details: string[] = [];
  const key = stringField(record, "key");
  const lyrics = stringField(record, "lyrics");

  if (key) {
    details.push(`Change the key to ${key}`);
  }

  if (lyrics) {
    details.push(`Replace the lyrics (${plural(lyrics.length, "character")})`);
  }

  pushDefined(details, unknownIdDetail("Hymn", id, names));

  return summary(`Update the hymn${name ? ` ${quote(name)}` : ""}`, details);
};

const saveTeamSummary: ToolSummarizer = (record, names) => {
  const name = stringField(record, "name");
  const parent = resolveName(stringField(record, "parentTeamId"), names);
  const details: string[] = [];

  if (parent) {
    details.push(`Under ${quote(parent)}`);
  }

  return summary(
    stringField(record, "id")
      ? `Save changes to the team${name ? ` ${quote(name)}` : ""}`
      : `Create a new team${name ? `, ${quote(name)}` : ""}`,
    details
  );
};

const saveTeamMemberSummary: ToolSummarizer = (record, names) => {
  const firstName = stringField(record, "firstName");
  const lastName = stringField(record, "lastName");
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const details: string[] = [];
  const contact = [stringField(record, "email"), stringField(record, "phone")]
    .filter(Boolean)
    .join(" · ");

  if (contact) {
    details.push(contact);
  }

  const teamIds = arrayField(record, "teamIds").filter(
    (id): id is string => typeof id === "string"
  );
  const teamNames = teamIds
    .map((id) => resolveName(id, names))
    .filter((team): team is string => team !== undefined);

  if (teamIds.length) {
    details.push(
      teamNames.length === teamIds.length
        ? `Teams: ${teamNames.join(", ")}`
        : `Belongs to ${plural(teamIds.length, "team")}`
    );
  }

  return summary(
    stringField(record, "id")
      ? `Save changes to ${fullName ? quote(fullName) : "a team member"}`
      : `Add a new team member${fullName ? `, ${quote(fullName)}` : ""}`,
    details
  );
};

const membershipSummary =
  (verb: "Add" | "Remove", preposition: "from" | "to"): ToolSummarizer =>
  (record, names) => {
    const memberId = stringField(record, "memberId");
    const teamId = stringField(record, "teamId");
    const member = resolveName(memberId, names);
    const team = resolveName(teamId, names);
    const details: string[] = [];

    pushDefined(details, unknownIdDetail("Member", memberId, names));
    pushDefined(details, unknownIdDetail("Team", teamId, names));

    return summary(
      `${verb} ${member ? quote(member) : "a member"} ${preposition} ${team ? quote(team) : "a team"}`,
      details
    );
  };

const saveMonthScheduleSummary: ToolSummarizer = (record, names) => {
  const team = resolveName(stringField(record, "teamId"), names);
  const assignments = arrayField(record, "assignments");
  const members = new Set<string>();
  const orders = new Set<string>();

  for (const entry of assignments) {
    const assignment = asRecord(entry);
    const orderId = stringField(assignment, "orderId");

    if (orderId) {
      orders.add(orderId);
    }

    for (const memberId of arrayField(assignment, "memberIds")) {
      if (typeof memberId === "string") {
        members.add(memberId);
      }
    }
  }

  const details: string[] = [];

  if (assignments.length) {
    details.push(
      `${plural(members.size, "member")} assigned across ${plural(orders.size, "order")} (${plural(assignments.length, "assignment")})`
    );
  }

  return summary(
    `Save staffing assignments for ${team ? quote(team) : "a team"}`,
    details
  );
};

const weekdayName = (value: unknown): string | undefined =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < WEEKDAY_NAMES.length
    ? WEEKDAY_NAMES[value]
    : undefined;

const saveMonthPlanningSettingsSummary: ToolSummarizer = (record, names) => {
  const details = arrayField(record, "prepopulateDays").map((entry) => {
    const day = asRecord(entry);
    const weekday = weekdayName(day.weekday);
    const title = stringField(day, "defaultTitle");
    const template = resolveName(stringField(day, "templateId"), names);

    return `${weekday ? `${weekday}s` : "A weekday"}: ${title ? quote(title) : "an order"}${template ? ` from ${quote(template)}` : ""}`;
  });

  return summary("Save the Month Planner settings", details);
};

const TOOL_SUMMARIZERS: Record<string, ToolSummarizer> = {
  add_member_to_team: membershipSummary("Add", "to"),
  create_order: createOrderSummary,
  delete_hymn: (record, names) => deleteSummary(record, names, "hymn", "a"),
  delete_order: (record, names) =>
    deleteSummary(
      record,
      names,
      "order",
      "an",
      "This also removes its hymn-play records."
    ),
  delete_team: (record, names) => deleteSummary(record, names, "team", "a"),
  delete_team_member: (record, names) =>
    deleteSummary(record, names, "team member", "a"),
  delete_template: (record, names) =>
    deleteSummary(record, names, "template", "a"),
  plan_month: planMonthSummary,
  publish_order: publishOrderSummary,
  remove_member_from_team: membershipSummary("Remove", "from"),
  save_hymn: saveHymnSummary,
  save_month_planning_settings: saveMonthPlanningSettingsSummary,
  save_month_schedule: saveMonthScheduleSummary,
  save_order: saveOrderSummary,
  save_team: saveTeamSummary,
  save_team_member: saveTeamMemberSummary,
  save_template: saveTemplateSummary,
  send_order_email: sendOrderEmailSummary,
  update_hymn: updateHymnSummary,
  update_order: saveOrderSummary,
};

export const describeRickToolCall = (
  toolName: string,
  input: unknown,
  names?: ReadonlyMap<string, string>
): RickToolSummary => {
  const record = asRecord(input);
  const summarize = TOOL_SUMMARIZERS[toolName];

  return summarize
    ? summarize(record, names)
    : summary(humanizeKey(toolName), genericDetails(record, names));
};

const labelForRecord = (record: RecordLike): string | undefined => {
  const firstName = stringField(record, "firstName");
  const lastName = stringField(record, "lastName");

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  const title = stringField(record, "title");

  if (title) {
    const date = formatShortDate(stringField(record, "serviceDate"));
    return date ? `${title} (${date})` : title;
  }

  const name = stringField(record, "name");

  if (name) {
    const hymnNumber = textField(record, "hymnNumber");
    return hymnNumber ? `${name} (#${hymnNumber})` : name;
  }

  return stringField(record, "activityName") ?? stringField(record, "typeName");
};

/**
 * Collect `id → display name` pairs from earlier tool results in the chat,
 * so ID-only calls (deletes, publishes, membership changes) can still name
 * the record they act on.
 */
export const collectRickEntityNames = (
  values: Iterable<unknown>
): Map<string, string> => {
  const names = new Map<string, string>();
  const seen = new WeakSet<object>();

  const walk = (value: unknown, depth: number): void => {
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        return;
      }

      seen.add(value);

      for (const item of value) {
        walk(item, depth);
      }

      return;
    }

    if (!isRecord(value) || seen.has(value)) {
      return;
    }

    seen.add(value);

    const id = stringField(value, "id");
    const label = labelForRecord(value);

    if (id && label && !names.has(id)) {
      names.set(id, label);
    }

    if (depth < 6) {
      for (const item of Object.values(value)) {
        walk(item, depth + 1);
      }
    }
  };

  for (const value of values) {
    walk(value, 0);
  }

  return names;
};
