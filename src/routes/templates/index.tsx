import { ListChecksIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { deleteTemplate, getTemplates } from "~/lib/order-service-data";

const TemplatesPage = () => {
  const templates = Route.useLoaderData();
  const router = useRouter();
  const deleteTemplateFn = useServerFn(deleteTemplate);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Order of Service Templates
          </h1>
          <p className="text-muted-foreground">
            Create reusable service structures for Sundays, midweek services,
            revivals, missions, and more.
          </p>
        </div>
        <Button asChild>
          <Link to="/templates/new">
            <PlusIcon data-icon="inline-start" />
            New template
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Each template defines service cards and default activities that can
            become a planned order of service.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListChecksIcon />
                </EmptyMedia>
                <EmptyTitle>No templates yet</EmptyTitle>
                <EmptyDescription>
                  Create a template to start planning services faster.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/templates/new">
                    <PlusIcon data-icon="inline-start" />
                    Create template
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Service type</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Activities</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        params={{ templateId: template.id }}
                        to="/templates/$templateId"
                      >
                        {template.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {template.serviceTypeName}
                      </Badge>
                    </TableCell>
                    <TableCell>{template.segmentCount}</TableCell>
                    <TableCell>{template.activityCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            params={{ templateId: template.id }}
                            to="/templates/$templateId"
                          >
                            Edit
                          </Link>
                        </Button>
                        <Button
                          onClick={async () => {
                            try {
                              await deleteTemplateFn({ data: template.id });
                              await router.invalidate();
                              toast.success(`Deleted "${template.name}".`);
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Template could not be deleted."
                              );
                            }
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

export const Route = createFileRoute("/templates/")({
  component: TemplatesPage,
  loader: () => getTemplates(),
});
