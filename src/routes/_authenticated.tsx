// oxlint-disable no-use-before-define
import {
  BookOpenTextIcon,
  CalendarCheckIcon,
  ChurchIcon,
  GearIcon,
  HouseIcon,
  ListChecksIcon,
  MusicNotesIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UsersIcon,
  UsersThreeIcon,
  UserSwitchIcon,
} from "@phosphor-icons/react";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Fragment } from "react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Button } from "~/components/ui/button";
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
import type { RolePermissions } from "~/lib/admin-permissions";
import { hasPermission } from "~/lib/admin-permissions";
import { authClient } from "~/lib/auth-client";
import { getSessionWithPermissions } from "~/lib/auth.functions";

const adminItems = [
  { icon: UsersIcon, label: "Users", to: "/admin/users" },
  { icon: ShieldCheckIcon, label: "Roles", to: "/admin/roles" },
] as const;

const navigationItems = [
  { icon: HouseIcon, label: "Dashboard", to: "/" },
  {
    action: "view",
    icon: CalendarCheckIcon,
    label: "Month Planner",
    match: "/orders",
    resource: "orders",
    to: "/planner",
  },
  {
    action: "view",
    icon: ListChecksIcon,
    label: "Templates",
    resource: "templates",
    to: "/templates",
  },
  {
    action: "view",
    icon: MusicNotesIcon,
    label: "Hymns",
    resource: "hymns",
    to: "/hymns",
  },
] as const;

const teamManagementItems = [
  {
    action: "view",
    icon: UsersThreeIcon,
    label: "Teams",
    resource: "teams",
    to: "/teams",
  },
  {
    action: "view",
    icon: UserCircleIcon,
    label: "Team Members",
    resource: "members",
    to: "/members",
  },
] as const;

const createItems = [
  {
    action: "create",
    icon: PlusIcon,
    label: "New Order",
    resource: "orders",
    to: "/orders/new",
  },
  {
    action: "create",
    icon: BookOpenTextIcon,
    label: "New Template",
    resource: "templates",
    to: "/templates/new",
  },
] as const;

type NavItem = {
  action?: string;
  label: string;
  resource?: string;
  to: string;
};

/** True when the user's permissions allow seeing a nav item. */
const canSee = (permissions: RolePermissions, item: NavItem): boolean =>
  !item.resource || hasPermission(permissions, item.resource, item.action ?? "view");

const routeLabels = new Map([
  ["orders", "Month Planner"],
  ["planner", "Month Planner"],
  ["new", "New"],
  ["templates", "Templates"],
  ["hymns", "Hymns"],
  ["teams", "Teams"],
  ["members", "Team Members"],
  ["admin", "Admin"],
  ["users", "Users"],
  ["roles", "Roles"],
]);

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
          const linkHref = href === "/orders" ? "/planner" : href;
          const label = routeLabels.get(segment) ?? "Edit";
          const isLast = index === segments.length - 1;

          return (
            <Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={linkHref}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
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
  const { permissions, user } = Route.useRouteContext();
  const isAdmin = user?.role === "admin";
  const visibleTeamItems = teamManagementItems.filter((item) =>
    canSee(permissions, item)
  );
  const visibleCreateItems = createItems.filter((item) =>
    canSee(permissions, item)
  );
  const canSeeSettings = hasPermission(permissions, "settings", "view");

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
              {navigationItems
                .filter((item) => canSee(permissions, item))
                .map((item) => {
                const Icon = item.icon;
                const matchPaths = [
                  item.to,
                  ...("match" in item ? [item.match] : []),
                ];
                const isActive =
                  item.to === "/"
                    ? pathname === "/"
                    : matchPaths.some(
                        (matchPath) =>
                          pathname === matchPath ||
                          pathname.startsWith(`${matchPath}/`)
                      );

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
        {visibleTeamItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Team Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleTeamItems.map((item) => {
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
        ) : null}
        {visibleCreateItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Create</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleCreateItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild>
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
        ) : null}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canSeeSettings ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/settings">
                        <GearIcon />
                        <span>Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {isAdmin
                  ? adminItems.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        pathname === item.to ||
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
                    })
                  : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 py-2 text-sidebar-foreground/70 text-xs">
          Victory Baptist Church
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

const stopImpersonating = async () => {
  const { error } = await authClient.admin.stopImpersonating();

  if (error) {
    toast.error(error.message ?? "Unable to stop impersonating.");
    return;
  }

  window.location.href = "/admin/users";
};

const ImpersonationBanner = () => {
  const { session } = Route.useRouteContext();
  const impersonatedBy = session?.session?.impersonatedBy;

  if (!impersonatedBy) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500/15 px-4 py-2 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <UserSwitchIcon />
        Impersonating {session.user.name || session.user.email}
      </span>
      <Button onClick={stopImpersonating} size="sm" variant="outline">
        Stop impersonating
      </Button>
    </div>
  );
};

const AuthenticatedAppShell = () => (
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <div className="flex min-h-svh flex-col">
        <ImpersonationBanner />
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger />
          <Separator className="h-4" orientation="vertical" />
          <AppBreadcrumb />
        </div>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </SidebarInset>
  </SidebarProvider>
);

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { permissions, session } = await getSessionWithPermissions();

    if (!session) {
      throw redirect({
        search: { redirect: location.href },
        to: "/login",
      });
    }

    return { permissions, session, user: session.user };
  },
  component: AuthenticatedAppShell,
});
