// oxlint-disable no-use-before-define
import {
  CalendarCheckIcon,
  FastForwardIcon,
  GearIcon,
  HouseIcon,
  ImageIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MusicNotesIcon,
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

import { RickLauncher } from "~/components/rick-chat/rick-launcher";
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
import { TooltipProvider } from "~/components/ui/tooltip";
import { UserAvatarMenu } from "~/components/user-avatar-menu";
import type { RolePermissions } from "~/lib/admin-permissions";
import { hasPermission } from "~/lib/admin-permissions";
import { authClient } from "~/lib/auth-client";
import { getSessionWithPermissions } from "~/lib/auth.functions";

interface NavItem {
  action?: string;
  icon: typeof HouseIcon;
  label: string;
  /** Extra path prefix that also marks this item active. */
  match?: string;
  resource?: string;
  to: string;
}

/** Most-used destinations first; shown without a group label. */
const primaryItems: NavItem[] = [
  {
    action: "view",
    icon: FastForwardIcon,
    label: "Next Service",
    resource: "orders",
    to: "/orders/next",
  },
  {
    action: "view",
    icon: CalendarCheckIcon,
    label: "Month Planner",
    match: "/orders",
    resource: "orders",
    to: "/planner",
  },
  { icon: HouseIcon, label: "Dashboard", to: "/" },
];

const resourceItems: NavItem[] = [
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
  {
    action: "view",
    icon: MegaphoneIcon,
    label: "Announcements",
    resource: "announcements",
    to: "/announcements",
  },
  {
    action: "view",
    icon: ImageIcon,
    label: "Image Library",
    resource: "library",
    to: "/library",
  },
];

const peopleItems: NavItem[] = [
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
];

const adminItems: NavItem[] = [
  { icon: UsersIcon, label: "Users", to: "/admin/users" },
  { icon: ShieldCheckIcon, label: "Roles", to: "/admin/roles" },
];

/** True when the user's permissions allow seeing a nav item. */
const canSee = (permissions: RolePermissions, item: NavItem): boolean =>
  !item.resource ||
  hasPermission(permissions, item.resource, item.action ?? "view");

const routeLabels = new Map([
  ["orders", "Month Planner"],
  ["planner", "Month Planner"],
  ["new", "New"],
  ["templates", "Templates"],
  ["hymns", "Hymns"],
  ["announcements", "Announcements"],
  ["deck", "Presentation deck"],
  ["library", "Image Library"],
  ["teams", "Teams"],
  ["members", "Team Members"],
  ["admin", "Admin"],
  ["users", "Users"],
  ["roles", "Roles"],
  ["profile", "Profile"],
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

const isItemActive = (pathname: string, item: NavItem): boolean => {
  if (item.to === "/") {
    return pathname === "/";
  }

  const matchPaths = [item.to, ...(item.match ? [item.match] : [])];

  return matchPaths.some(
    (matchPath) =>
      pathname === matchPath || pathname.startsWith(`${matchPath}/`)
  );
};

const SidebarNavGroup = ({
  className,
  items,
  label,
  pathname,
}: {
  className?: string;
  items: NavItem[];
  label?: string;
  pathname: string;
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className={className}>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive(pathname, item)}
                  tooltip={item.label}
                >
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
  );
};

const AppSidebar = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { permissions, user } = Route.useRouteContext();
  const visible = (items: NavItem[]) =>
    items.filter((item) => canSee(permissions, item));
  const configurationItems: NavItem[] = [
    ...(hasPermission(permissions, "settings", "view")
      ? [{ icon: GearIcon, label: "Settings", to: "/settings" }]
      : []),
    ...(user?.role === "admin" ? adminItems : []),
  ];

  return (
    <TooltipProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg">
                <Link to="/">
                  <img
                    alt=""
                    className="size-8 shrink-0"
                    src="/vbc-chip-logo.svg"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">VBC Portal</span>
                    <span className="truncate text-xs font-normal text-sidebar-foreground/70">
                      Order of Service
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNavGroup items={visible(primaryItems)} pathname={pathname} />
          <SidebarNavGroup
            items={visible(resourceItems)}
            label="Resources"
            pathname={pathname}
          />
          <SidebarNavGroup
            items={visible(peopleItems)}
            label="People"
            pathname={pathname}
          />
          <SidebarNavGroup
            className="mt-auto"
            items={configurationItems}
            label="Configuration"
            pathname={pathname}
          />
        </SidebarContent>
        <SidebarFooter>
          <UserAvatarMenu user={user} />
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/35 bg-warning/15 px-4 py-2 text-sm text-warning">
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

const AuthenticatedAppShell = () => {
  const { user } = Route.useRouteContext();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex min-h-svh flex-col">
          <ImpersonationBanner />
          <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/50 px-4">
            <SidebarTrigger />
            <Separator className="h-4" orientation="vertical" />
            <AppBreadcrumb />
          </div>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </SidebarInset>
      <RickLauncher userId={user.id} />
    </SidebarProvider>
  );
};

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { permissions, session } = await getSessionWithPermissions();

    if (!session) {
      throw redirect({
        to: "/login",
      });
    }

    return { permissions, session, user: session.user };
  },
  component: AuthenticatedAppShell,
});
