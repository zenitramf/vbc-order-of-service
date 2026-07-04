import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Admin-only section (User Admin). The parent `_authenticated` route already
 * loaded the session into context; here we gate on the `admin` role and bounce
 * everyone else back to the dashboard.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.user?.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});
