/// <reference types="vite/client" />

import {
  BookOpenTextIcon,
  CalendarCheckIcon,
  ChurchIcon,
  GearIcon,
  HouseIcon,
  ListChecksIcon,
  MusicNotesIcon,
  PlusIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";

import { DefaultCatchBoundary } from "~/components/default-catch-boundary";
import { NotFound } from "~/components/not-found";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Separator } from "~/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { Toaster } from "~/components/ui/sonner";
import { seo } from "~/utils/seo";

import appCss from "~/styles/app.css?url";

const navigationItems = [
  { icon: HouseIcon, label: "Dashboard", to: "/" },
  { icon: CalendarCheckIcon, label: "Orders", to: "/orders" },
  { icon: ListChecksIcon, label: "Templates", to: "/templates" },
  { icon: MusicNotesIcon, label: "Hymns", to: "/hymns" },
] as const;

const teamManagementItems = [
  { icon: UsersThreeIcon, label: "Teams", to: "/teams" },
  { icon: UserCircleIcon, label: "Team Members", to: "/members" },
] as const;

const routeLabels = new Map([
  ["orders", "Orders"],
  ["new", "New"],
  ["templates", "Templates"],
  ["hymns", "Hymns"],
  ["teams", "Teams"],
  ["members", "Team Members"],
]);

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  <html className="dark" lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      {children}
      <TanStackRouterDevtools position="bottom-right" />
      <Scripts />
    </body>
  </html>
);

const AppBreadcrumb = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const segments = pathname.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {segments.length === 0 ? (
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/">Dashboard</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const label = routeLabels.get(segment) ?? "Edit";
          const isLast = index === segments.length - 1;

          return (
            <React.Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

const AppSidebar = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link to="/">
                <ChurchIcon />
                <span>Order of Service</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plan</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.to === "/"
                    ? pathname === "/"
                    : pathname === item.to ||
                      pathname.startsWith(`${item.to}/`);

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.to}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Team Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {teamManagementItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.to || pathname.startsWith(`${item.to}/`);

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.to}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Create</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/orders/new">
                    <PlusIcon />
                    <span>New Order</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/templates/new">
                    <BookOpenTextIcon />
                    <span>New Template</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/settings">
                      <GearIcon />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 py-2 text-xs text-sidebar-foreground/70">
          Victory Baptist Church
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

const AppRoot = () => (
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <div className="flex min-h-svh flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger />
          <Separator className="h-4" orientation="vertical" />
          <AppBreadcrumb />
        </div>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
        <Toaster />
      </div>
    </SidebarInset>
  </SidebarProvider>
);

export const Route = createRootRoute({
  component: AppRoot,
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
      { color: "#fffff", href: "/site.webmanifest", rel: "manifest" },
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
