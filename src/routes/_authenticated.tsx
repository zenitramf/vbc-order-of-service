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
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Fragment } from "react";

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
import { getSession } from "~/lib/auth.functions";

const navigationItems = [
  { icon: HouseIcon, label: "Dashboard", to: "/" },
  {
    icon: CalendarCheckIcon,
    label: "Month Planner",
    match: "/orders",
    to: "/planner",
  },
  { icon: ListChecksIcon, label: "Templates", to: "/templates" },
  { icon: MusicNotesIcon, label: "Hymns", to: "/hymns" },
] as const;

const teamManagementItems = [
  { icon: UsersThreeIcon, label: "Teams", to: "/teams" },
  { icon: UserCircleIcon, label: "Team Members", to: "/members" },
] as const;

const routeLabels = new Map([
  ["orders", "Month Planner"],
  ["planner", "Month Planner"],
  ["new", "New"],
  ["templates", "Templates"],
  ["hymns", "Hymns"],
  ["teams", "Teams"],
  ["members", "Team Members"],
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
        <div className="px-3 py-2 text-sidebar-foreground/70 text-xs">
          Victory Baptist Church
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

const AuthenticatedAppShell = () => (
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
      </div>
    </SidebarInset>
  </SidebarProvider>
);

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();

    if (!session) {
      throw redirect({
        search: { redirect: location.href },
        to: "/login",
      });
    }

    return { session, user: session.user };
  },
  component: AuthenticatedAppShell,
});
