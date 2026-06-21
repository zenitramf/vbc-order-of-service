// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MusicNotesIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { deleteHymn, getHymns } from "~/lib/order-service-data";

const HymnsPage = () => {
  const hymns = Route.useLoaderData();
  const router = useRouter();
  const deleteHymnFn = useServerFn(deleteHymn);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Hymn Library</h1>
          <p className="text-muted-foreground">
            Manage hymn numbers, lyrics, keys, sources, and recent play history.
          </p>
        </div>
        <Button asChild>
          <Link to="/hymns/new">
            <PlusIcon data-icon="inline-start" />
            New hymn
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hymns</CardTitle>
          <CardDescription>
            Seed the library from db/song-library-seed.csv and select hymns while editing an order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hymns.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MusicNotesIcon />
                </EmptyMedia>
                <EmptyTitle>No hymns yet</EmptyTitle>
                <EmptyDescription>Run the D1 seed migration or add a hymn manually.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/hymns/new">
                    <PlusIcon data-icon="inline-start" />
                    Add hymn
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Last played</TableHead>
                  <TableHead>6 months</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hymns.map((hymn) => (
                  <TableRow key={hymn.id}>
                    <TableCell>{hymn.hymnNumber}</TableCell>
                    <TableCell>
                      <Link className="font-medium hover:underline" params={{ hymnId: hymn.id }} to="/hymns/$hymnId">
                        {hymn.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{hymn.sourceName}</Badge>
                    </TableCell>
                    <TableCell>{hymn.musicKey}</TableCell>
                    <TableCell>{hymn.lastPlayed || "—"}</TableCell>
                    <TableCell>{hymn.timesPlayedLastSixMonths}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link params={{ hymnId: hymn.id }} to="/hymns/$hymnId">
                            Edit
                          </Link>
                        </Button>
                        <Button
                          onClick={async () => {
                            await deleteHymnFn({ data: hymn.id });
                            await router.invalidate();
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <TrashIcon data-icon="inline-start" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/hymns/")({
  component: HymnsPage,
  loader: () => getHymns(),
});
