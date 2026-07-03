// oxlint-disable no-use-before-define
import { UserCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import type { ProfileDialogUser } from "~/components/profile-dialog";
import { ProfileDialog } from "~/components/profile-dialog";
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
  user: ProfileDialogUser;
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

export const UserAvatarMenu = ({ user }: UserAvatarMenuProps) => {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-full" size="icon" variant="ghost">
            <Avatar>
              {user.image ? (
                <AvatarImage alt={user.name} src={user.image} />
              ) : null}
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
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <UserCircleIcon />
              Profile
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

      <ProfileDialog
        onOpenChange={setProfileOpen}
        open={profileOpen}
        user={user}
      />
    </>
  );
};
