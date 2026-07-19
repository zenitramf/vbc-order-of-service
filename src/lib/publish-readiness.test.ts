import { describe, expect, it } from "vitest";

import type { OrderServiceTemplateJson } from "~/lib/order-service-types";
import { findMissingHymnActivities } from "~/lib/publish-readiness";

const sampleOrder = (
  activities: OrderServiceTemplateJson["service_type"][number]["activities"]
): OrderServiceTemplateJson => ({
  name: "Sunday",
  service_type: [
    {
      activities,
      id: "card-1",
      typeName: "Main Service",
    },
  ],
});

describe("findMissingHymnActivities", () => {
  it("returns empty when every hymn activity has a hymnId", () => {
    expect(
      findMissingHymnActivities(
        sampleOrder([
          {
            activityName: "Opening Hymn",
            activityType: "hymn",
            hymnId: "h1",
            id: "a1",
          },
          {
            activityName: "Prayer",
            activityType: "prayer",
            id: "a2",
          },
        ])
      )
    ).toEqual([]);
  });

  it("lists hymn activities without a selected hymn", () => {
    expect(
      findMissingHymnActivities(
        sampleOrder([
          {
            activityName: "Opening Hymn",
            activityType: "hymn",
            id: "a1",
          },
          {
            activityName: "Closing Hymn",
            activityType: "hymn",
            hymnId: "h2",
            id: "a3",
          },
        ])
      )
    ).toEqual([
      {
        activityId: "a1",
        activityName: "Opening Hymn",
        cardId: "card-1",
        cardName: "Main Service",
      },
    ]);
  });

  it("ignores non-hymn activities for hymn readiness", () => {
    expect(
      findMissingHymnActivities(
        sampleOrder([
          {
            activityName: "Preaching",
            activityType: "preaching",
            id: "p1",
          },
        ])
      )
    ).toEqual([]);
  });
});
