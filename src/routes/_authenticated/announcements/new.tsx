import { MegaphoneIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { createAnnouncement } from "~/lib/announcement-data";
import { requirePermission } from "~/lib/route-guards";

const NewAnnouncementPage = () => {
  const navigate = useNavigate();
  const createFn = useServerFn(createAnnouncement);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [heading, setHeading] = useState("");
  const [tertiary, setTertiary] = useState("");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      const { id } = await createFn({
        data: {
          backgroundPrompt,
          heading,
          name,
          subtitle,
          tertiary,
          title: title || name,
        },
      });

      toast.success("Announcement draft created.");
      await navigate({
        params: { announcementId: id },
        to: "/announcements/$announcementId",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create announcement."
      );
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          New announcement
        </h1>
        <p className="text-muted-foreground">
          Start a 1920×1080 draft. You will generate AI backgrounds and HTML
          text overlays next.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MegaphoneIcon />
            Details
          </CardTitle>
          <CardDescription>
            Stored as JSON in R2 with references to background images.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Announcement name</Label>
              <Input
                id="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Easter Sunday Invite"
                required
                value={name}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Defaults to announcement name"
                value={title}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                onChange={(event) => setSubtitle(event.target.value)}
                value={subtitle}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="heading">Heading</Label>
              <Input
                id="heading"
                onChange={(event) => setHeading(event.target.value)}
                placeholder="e.g. Special Service"
                value={heading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tertiary">Tertiary information</Label>
              <Textarea
                id="tertiary"
                onChange={(event) => setTertiary(event.target.value)}
                placeholder="Date, time, location, RSVP…"
                rows={3}
                value={tertiary}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="backgroundPrompt">Background prompt</Label>
              <Textarea
                id="backgroundPrompt"
                onChange={(event) => setBackgroundPrompt(event.target.value)}
                placeholder="Soft golden hour light through stained glass, empty sanctuary, cinematic 16:9…"
                rows={3}
                value={backgroundPrompt}
              />
            </div>
            <Button disabled={isCreating} type="submit">
              {isCreating ? "Creating…" : "Create draft"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/announcements/new")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "create");
  },
  component: NewAnnouncementPage,
});
