import {
  ImageIcon,
  MegaphoneIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  deleteAnnouncement,
  getAnnouncementAsset,
  listAnnouncements,
} from "~/lib/announcement-data";
import type { AnnouncementSummary } from "~/lib/announcement-types";
import { requirePermission } from "~/lib/route-guards";

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const AnnouncementCard = ({
  item,
  onDelete,
  previewUrl,
}: {
  item: AnnouncementSummary;
  onDelete: () => void;
  previewUrl?: string;
}) => (
  <Card className="overflow-hidden">
    <div className="bg-muted aspect-video w-full">
      {previewUrl ? (
        <img alt="" className="h-full w-full object-cover" src={previewUrl} />
      ) : (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
          <ImageIcon className="size-8 opacity-50" />
          No preview yet
        </div>
      )}
    </div>
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <CardTitle className="line-clamp-2 text-lg">
          <Link
            className="hover:underline"
            params={{ announcementId: item.id }}
            to="/announcements/$announcementId"
          >
            {item.name}
          </Link>
        </CardTitle>
        <Badge variant={item.status === "approved" ? "default" : "secondary"}>
          {item.status === "approved" ? "Approved" : "Draft"}
        </Badge>
      </div>
      <CardDescription>
        {item.variationCount} variation{item.variationCount === 1 ? "" : "s"} ·
        Updated {formatWhen(item.updatedAt)}
      </CardDescription>
    </CardHeader>
    <CardContent className="flex gap-2">
      <Button asChild className="flex-1" size="sm" variant="outline">
        <Link
          params={{ announcementId: item.id }}
          to="/announcements/$announcementId"
        >
          Open
        </Link>
      </Button>
      <Button onClick={onDelete} size="sm" type="button" variant="ghost">
        <TrashIcon data-icon="inline-start" />
        Delete
      </Button>
    </CardContent>
  </Card>
);

const AnnouncementsPage = () => {
  const announcements = Route.useLoaderData();
  const router = useRouter();
  const deleteFn = useServerFn(deleteAnnouncement);
  const getAssetFn = useServerFn(getAnnouncementAsset);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const results = await Promise.all(
        announcements.map(async (item) => {
          const key = item.previewObjectKey ?? item.exportObjectKey;

          if (!key) {
            return null;
          }

          try {
            const asset = await getAssetFn({ data: key });
            return {
              id: item.id,
              url: `data:${asset.contentType};base64,${asset.base64}`,
            };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setPreviews((previous) => {
        const next = { ...previous };

        for (const result of results) {
          if (result && !next[result.id]) {
            next[result.id] = result.url;
          }
        }

        return next;
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [announcements, getAssetFn]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Announcements
          </h1>
          <p className="text-muted-foreground">
            AI background images with HTML text overlays. Drafts and exports
            live in R2 at 1920×1080.
          </p>
        </div>
        <Button asChild>
          <Link to="/announcements/new">
            <PlusIcon data-icon="inline-start" />
            New announcement
          </Link>
        </Button>
      </div>

      {announcements.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MegaphoneIcon />
            </EmptyMedia>
            <EmptyTitle>No announcements yet</EmptyTitle>
            <EmptyDescription>
              Create an announcement, generate background variations, overlay
              title hierarchy with HTML, and export an approved JPG.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/announcements/new">
                <PlusIcon data-icon="inline-start" />
                Create announcement
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {announcements.map((item) => (
            <AnnouncementCard
              item={item}
              key={item.id}
              onDelete={async () => {
                try {
                  await deleteFn({ data: item.id });
                  await router.invalidate();
                  toast.success(`Deleted "${item.name}".`);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not delete announcement."
                  );
                }
              }}
              previewUrl={previews[item.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/announcements/")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "view");
  },
  component: AnnouncementsPage,
  loader: () => listAnnouncements(),
});
