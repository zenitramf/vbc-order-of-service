import { describe, expect, it } from "vitest";

import { requiresRickApproval } from "~/lib/rick-approval";

describe("requiresRickApproval", () => {
  it("lets read-only tools run without approval", () => {
    expect(requiresRickApproval("get_dashboard", {})).toBe(false);
    expect(requiresRickApproval("list_orders", {})).toBe(false);
    expect(requiresRickApproval("get_order", { id: "order-1" })).toBe(false);
    expect(requiresRickApproval("get_hymn_file", { id: "file-1" })).toBe(false);
  });

  it("requires approval for every mutating prefix", () => {
    expect(requiresRickApproval("create_order", {})).toBe(true);
    expect(requiresRickApproval("update_hymn", {})).toBe(true);
    expect(requiresRickApproval("save_template", {})).toBe(true);
    expect(requiresRickApproval("delete_team", {})).toBe(true);
    expect(requiresRickApproval("add_member_to_team", {})).toBe(true);
    expect(requiresRickApproval("remove_member_from_team", {})).toBe(true);
  });

  it("requires approval for month planning", () => {
    expect(requiresRickApproval("plan_month", { month: "2026-10" })).toBe(true);
  });

  it("only requires approval for a real publish or send", () => {
    expect(requiresRickApproval("publish_order", {})).toBe(true);
    expect(requiresRickApproval("publish_order", { dry_run: false })).toBe(
      true
    );
    expect(requiresRickApproval("publish_order", { dry_run: true })).toBe(
      false
    );

    expect(requiresRickApproval("send_order_email", {})).toBe(true);
    expect(requiresRickApproval("send_order_email", { dry_run: true })).toBe(
      false
    );
  });
});
