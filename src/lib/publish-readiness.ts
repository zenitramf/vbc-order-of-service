import type {
  MissingHymnActivity,
  OrderServiceTemplateJson,
} from "~/lib/order-service-types";

/**
 * List hymn activities that still need a selected hymn before an order can be
 * published or emailed.
 */
export const findMissingHymnActivities = (
  order: OrderServiceTemplateJson
): MissingHymnActivity[] => {
  const missing: MissingHymnActivity[] = [];

  for (const segment of order.service_type) {
    for (const activity of segment.activities) {
      if (activity.activityType === "hymn" && !activity.hymnId) {
        missing.push({
          activityId: activity.id,
          activityName: activity.activityName,
          cardId: segment.id,
          cardName: segment.typeName,
        });
      }
    }
  }

  return missing;
};
