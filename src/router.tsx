// oxlint-disable func-style
import { createRouter } from "@tanstack/react-router";

import { DefaultCatchBoundary } from "./components/default-catch-boundary";
import { DefaultRoutePendingSkeleton } from "./components/loading-skeletons";
import { NotFound } from "./components/not-found";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    defaultPendingComponent: DefaultRoutePendingSkeleton,
    defaultPendingMinMs: 0,
    defaultPendingMs: 0,
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });

  return router;
}
