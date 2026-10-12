import { v4 as uuidv4 } from "uuid";

import type { OrderServiceTemplateJson } from "~/lib/order-service-types";
import { normalizeServiceCardTeams } from "~/lib/teams-logic";

const utf8Decoder = new TextDecoder();

/**
 * Read a TEXT column value from a raw D1 row. Values that were stored with
 * BLOB affinity (e.g. seeded outside the app's Drizzle writes) come back as
 * ArrayBuffer/Uint8Array instead of string, so decode those as UTF-8 rather
 * than silently treating the content as empty.
 */
export const decodeDbText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return utf8Decoder.decode(value);
  }

  if (value instanceof ArrayBuffer) {
    return utf8Decoder.decode(new Uint8Array(value));
  }

  return "";
};

export const normalizeTemplate = (
  template: OrderServiceTemplateJson,
  fallbackName: string
): OrderServiceTemplateJson => ({
  name: template.name?.trim() || fallbackName,
  service_type: (template.service_type ?? []).map((segment) => ({
    activities: (segment.activities ?? []).map((activity) => ({
      activityName: activity.activityName?.trim() || "Activity",
      activityType: activity.activityType?.trim() || "custom",
      id: activity.id || uuidv4(),
      ...(activity.hymnId ? { hymnId: activity.hymnId } : {}),
      ...(activity.notes ? { notes: activity.notes } : {}),
    })),
    id: segment.id || uuidv4(),
    typeName: segment.typeName?.trim() || "Service Segment",
    ...normalizeServiceCardTeams(segment),
  })),
});

/**
 * Parse a stored template/order JSON column. Empty values become an empty
 * template so one blank row cannot crash every list that maps over it;
 * corrupt non-empty JSON still throws so real data problems stay visible.
 */
export const parseTemplateJson = (
  value: unknown,
  fallbackName: string
): OrderServiceTemplateJson => {
  const text = decodeDbText(value).trim();

  if (!text) {
    return normalizeTemplate(
      { name: fallbackName, service_type: [] },
      fallbackName
    );
  }

  return normalizeTemplate(
    JSON.parse(text) as OrderServiceTemplateJson,
    fallbackName
  );
};
