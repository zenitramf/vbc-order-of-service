// oxlint-disable no-use-before-define
import { UserCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import type { ProfilePageUser } from "~/components/profile-page";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { authClient } from "~/lib/auth-client";
import { getInitials } from "~/lib/teams-logic";

interface UserAvatarMenuProps {
  user: ProfilePageUser;
}

const handleLogout = async () => {
  const { error } = await authClient.signOut();

  if (error) {
    toast.error(error.message ?? "Unable to sign out.");
    return;
  }

  // Full reload so the authenticated layout re-runs its guard from a clean
  // slate and lands on the login page.
  window.location.href = "/login";
};

export const UserAvatarMenu = ({ user }: UserAvatarMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button className="rounded-full" size="icon" variant="ghost">
        <Avatar>
          {user.image ? <AvatarImage alt={user.name} src={user.image} /> : null}
          <AvatarFallback>
            {getInitials(user.firstName, user.lastName)}
          </AvatarFallback>
        </Avatar>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56" side="top">
      <DropdownMenuLabel>
        <div className="flex flex-col gap-0.5">
          <span className="truncate font-medium text-sm">
            {user.name || "Your account"}
          </span>
          <span className="truncate font-normal text-muted-foreground text-xs">
            {user.email}
          </span>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserCircleIcon />
            Profile
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          onSelect={() => {
            void handleLogout();
          }}
          style={{ color: "firebrick" }}
        >
          Log Out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
