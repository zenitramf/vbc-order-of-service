/// <reference types="vite/client" />

import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";

import { DefaultCatchBoundary } from "~/components/default-catch-boundary";
import { NotFound } from "~/components/not-found";
import { Toaster } from "~/components/ui/sonner";
import { seo } from "~/utils/seo";

import appCss from "~/styles/app.css?url";

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html className="dark" lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      {children}
      <Scripts />
    </body>
  </html>
);

/** App chrome that must not appear on the production presentation display. */
const RootAppChrome = () => {
  const isPresentation = useRouterState({
    select: (state) => state.location.pathname === "/presentation",
  });

  if (isPresentation) {
    return null;
  }

  return (
    <>
      <Toaster offset={{ right: 24, top: 24 }} position="top-right" />
      {/* Bottom-left so devtools never overlaps the Rick launcher/composer. */}
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
};

const RootApp = () => (
  <>
    <Outlet />
    <RootAppChrome />
  </>
);

export const Route = createRootRoute({
  component: RootApp,
  errorComponent: DefaultCatchBoundary,
  head: () => ({
    links: [
      { href: appCss, rel: "stylesheet" },
      {
        href: "/apple-touch-icon.png",
        rel: "apple-touch-icon",
        sizes: "180x180",
      },
      {
        href: "/favicon-32x32.png",
        rel: "icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        href: "/favicon-16x16.png",
        rel: "icon",
        sizes: "16x16",
        type: "image/png",
      },
      { href: "/site.webmanifest", rel: "manifest" },
      { href: "/favicon.ico", rel: "icon" },
    ],
    meta: [
      {
        charSet: "utf-8",
      },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      {
        content: "#1c1a1f",
        name: "theme-color",
      },
      ...seo({
        description: "Used for the management for the order of service.",
        title: "Victory Baptist Church Order of Service Selector",
      }),
    ],
    scripts: [],
  }),
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
});
