// oxlint-disable no-use-before-define
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getNextOrder } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

/**
 * Stable shortcut to the next upcoming order of service. The loader always
 * redirects — to the order itself, or to the Month Planner when no upcoming
 * order exists yet — so links never need to know which order is next.
 */
export const Route = createFileRoute("/_authenticated/orders/next")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "orders", "view");
  },
  loader: async () => {
    const next = await getNextOrder();

    if (next) {
      throw redirect({
        params: { orderId: next.id },
        to: "/orders/$orderId",
      });
    }

    throw redirect({ to: "/planner" });
  },
});
