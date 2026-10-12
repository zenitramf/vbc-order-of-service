import { describe, expect, it } from "vitest";

import {
  collectRickEntityNames,
  describeRickToolCall,
} from "~/lib/rick-tool-summary";

const names = new Map([
  ["hymn-1", "Amazing Grace (#202)"],
  ["member-1", "Grace Lee"],
  ["order-1", "Sunday Morning (Oct 19, 2026)"],
  ["team-1", "Ushers"],
  ["template-1", "Sunday Morning Template"],
]);

describe("describeRickToolCall", () => {
  it("summarises creating an order with its title, date, and template", () => {
    const summary = describeRickToolCall(
      "create_order",
      {
        serviceDate: "2026-10-19",
        templateId: "template-1",
        title: "Sunday Morning",
      },
      names
    );

    expect(summary.headline).toContain("Sunday Morning");
    expect(summary.headline).toContain("Oct 19, 2026");
    expect(summary.details.join(" ")).toContain("Sunday Morning Template");
    expect(summary.destructive).toBe(false);
  });

  it("lists the sections and activities when saving an order", () => {
    const summary = describeRickToolCall("update_order", {
      id: "order-1",
      order: {
        name: "Sunday Morning",
        service_type: [
          {
            activities: [
              {
                activityName: "Opening Hymn",
                activityType: "hymn",
                hymnId: "hymn-1",
                id: "activity-1",
              },
              {
                activityName: "Sermon",
                activityType: "preaching",
                id: "activity-2",
              },
            ],
            id: "card-1",
            teamAssignments: [{ memberIds: ["member-1"], teamId: "team-1" }],
            typeName: "Morning Service",
          },
        ],
      },
      serviceDate: "2026-10-19",
      serviceTypeId: "service-type-1",
      title: "Sunday Morning",
    });

    const text = [summary.headline, ...summary.details].join("\n");

    expect(text).toContain("Morning Service");
    expect(text).toContain("Opening Hymn");
    expect(text).toContain("Sermon");
    expect(text).not.toContain("service_type");
    expect(text).not.toContain("service-type-1");
    expect(text).not.toContain("{");
  });

  it("names the record being deleted and flags it destructive", () => {
    const summary = describeRickToolCall(
      "delete_hymn",
      { id: "hymn-1" },
      names
    );

    expect(summary.headline).toContain("Amazing Grace (#202)");
    expect(summary.headline.toLowerCase()).toContain("delete");
    expect(summary.destructive).toBe(true);
    expect(summary.details.join(" ").toLowerCase()).toContain(
      "cannot be undone"
    );
  });

  it("falls back to a short id when the record name is unknown", () => {
    const summary = describeRickToolCall("delete_order", {
      id: "12345678-1234-1234-1234-123456789abc",
    });

    expect(summary.headline.toLowerCase()).toContain("delete");
    expect(summary.details.join(" ")).toContain("12345678");
    expect(summary.details.join(" ")).not.toContain("123456789abc");
  });

  it("spells out month planning in words", () => {
    const summary = describeRickToolCall("plan_month", { month: "2026-10" });

    expect(summary.headline).toContain("October 2026");
    expect(summary.headline).not.toContain("2026-10");
  });

  it("distinguishes a real publish or send from a preview", () => {
    expect(
      describeRickToolCall("publish_order", { id: "order-1" }, names).headline
    ).toContain("Sunday Morning (Oct 19, 2026)");
    expect(
      describeRickToolCall(
        "send_order_email",
        { orderId: "order-1" },
        names
      ).headline.toLowerCase()
    ).toContain("email");
    expect(
      describeRickToolCall("send_order_email", {
        dry_run: true,
        orderId: "order-1",
      }).headline.toLowerCase()
    ).toContain("preview");
  });

  it("does not dump full lyrics when saving a hymn", () => {
    const lyrics = "Amazing grace, how sweet the sound ".repeat(20);
    const summary = describeRickToolCall("save_hymn", {
      hymnNumber: "202",
      language: "english",
      lastPlayed: "2026-10-05",
      lyricsMarkdown: lyrics,
      musicKey: "G",
      name: "Amazing Grace",
      sourceId: "source-1",
    });
    const text = [summary.headline, ...summary.details].join("\n");

    expect(summary.headline).toContain("Amazing Grace");
    expect(text).toContain("G");
    expect(text).not.toContain(lyrics);
    expect(text.toLowerCase()).toContain("lyrics");
  });

  it("names both sides of a team membership change", () => {
    const summary = describeRickToolCall(
      "remove_member_from_team",
      { memberId: "member-1", teamId: "team-1" },
      names
    );

    expect(summary.headline).toContain("Grace Lee");
    expect(summary.headline).toContain("Ushers");
  });

  it("spells out weekday names in month planning settings", () => {
    const summary = describeRickToolCall(
      "save_month_planning_settings",
      {
        prepopulateDays: [
          {
            defaultTitle: "Sunday Morning",
            templateId: "template-1",
            weekday: 0,
          },
          {
            defaultTitle: "Midweek Prayer",
            templateId: "template-1",
            weekday: 3,
          },
        ],
      },
      names
    );
    const text = summary.details.join("\n");

    expect(text).toContain("Sunday");
    expect(text).toContain("Wednesday");
    expect(text).toContain("Midweek Prayer");
  });

  it("counts staffing instead of listing raw ids for a month schedule", () => {
    const summary = describeRickToolCall(
      "save_month_schedule",
      {
        assignments: [
          {
            cardId: "card-1",
            memberIds: ["member-1", "member-2"],
            orderId: "order-1",
          },
          {
            cardId: "card-2",
            memberIds: ["member-1"],
            orderId: "order-2",
          },
        ],
        teamId: "team-1",
      },
      names
    );
    const text = [summary.headline, ...summary.details].join("\n");

    expect(text).toContain("Ushers");
    expect(text).toContain("2 members");
    expect(text).not.toContain("card-1");
  });

  it("humanises unknown tools without leaking JSON or long values", () => {
    const summary = describeRickToolCall("frobnicate_widget", {
      count: 3,
      enabled: true,
      longNotes: "word ".repeat(60),
      widgetIds: ["a", "b"],
    });
    const text = [summary.headline, ...summary.details].join("\n");

    expect(text).not.toContain("{");
    expect(text).not.toContain("}");
    expect(text).not.toContain("widgetIds");
    expect(text.length).toBeLessThan(500);
  });

  it("handles missing or non-object input without crashing", () => {
    for (const input of [undefined, null, "text", 42, []]) {
      const summary = describeRickToolCall("save_team", input);

      expect(summary.headline.length).toBeGreaterThan(0);
      expect(Array.isArray(summary.details)).toBe(true);
    }
  });
});

describe("collectRickEntityNames", () => {
  it("finds names inside earlier tool results", () => {
    const collected = collectRickEntityNames([
      [
        { id: "order-9", serviceDate: "2026-11-02", title: "Harvest Sunday" },
        { hymnNumber: "45", id: "hymn-9", name: "Be Thou My Vision" },
      ],
      { firstName: "Sam", id: "member-9", lastName: "Reyes" },
      { order: { id: "nested-1", name: "Nested Record" } },
      null,
      "not a record",
    ]);

    expect(collected.get("order-9")).toContain("Harvest Sunday");
    expect(collected.get("order-9")).toContain("Nov 2, 2026");
    expect(collected.get("hymn-9")).toBe("Be Thou My Vision (#45)");
    expect(collected.get("member-9")).toBe("Sam Reyes");
    expect(collected.get("nested-1")).toBe("Nested Record");
  });
});
