// oxlint-disable no-use-before-define
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
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
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { saveMonthPlanningSettings } from "~/lib/order-service-data";
import type {
  MonthPlanningSettings,
  TemplateSummary,
} from "~/lib/order-service-types";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

interface WeekdayRowState {
  defaultTitle: string;
  enabled: boolean;
  templateId: string;
}

const missingTemplate = (row: WeekdayRowState) =>
  row.enabled && !row.templateId;

const buildInitialRows = (
  settings: MonthPlanningSettings
): WeekdayRowState[] => {
  const byWeekday = new Map(
    settings.prepopulateDays.map((day) => [day.weekday, day])
  );

  return WEEKDAY_NAMES.map((name, weekday) => {
    const day = byWeekday.get(weekday);

    return {
      defaultTitle: day?.defaultTitle ?? `${name} Order of Service`,
      enabled: Boolean(day),
      templateId: day?.templateId ?? "",
    };
  });
};

interface MonthPlannerSettingsProps {
  settings: MonthPlanningSettings;
  templates: TemplateSummary[];
}

export const MonthPlannerSettings = ({
  settings,
  templates,
}: MonthPlannerSettingsProps) => {
  const router = useRouter();
  const saveSettings = useServerFn(saveMonthPlanningSettings);
  const [rows, setRows] = React.useState<WeekdayRowState[]>(() =>
    buildInitialRows(settings)
  );
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setRows(buildInitialRows(settings));
  }, [settings]);

  const updateRow = (weekday: number, patch: Partial<WeekdayRowState>) => {
    setRows((current) =>
      current.map((row, index) =>
        index === weekday ? { ...row, ...patch } : row
      )
    );
  };

  const hasMissingTemplate = rows.some(missingTemplate);
  const hasTemplates = templates.length > 0;

  const onSave = async () => {
    if (hasMissingTemplate) {
      toast.error(
        "Select a template for every pre-populated weekday before saving."
      );
      return;
    }

    setIsSaving(true);

    try {
      await saveSettings({
        data: {
          prepopulateDays: rows
            .map((row, weekday) => ({ ...row, weekday }))
            .filter((row) => row.enabled)
            .map((row) => ({
              defaultTitle: row.defaultTitle,
              templateId: row.templateId,
              weekday: row.weekday,
            })),
        },
      });
      toast.success("Month Planner settings saved.");
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Month Planner settings could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month Planner</CardTitle>
        <CardDescription>
          Choose which weekdays are pre-populated each month and the template
          used to create their orders. Sunday is enabled by default. Every
          pre-populated weekday must have a template before settings can be
          saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasTemplates ? (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pre-populate</TableHead>
                  <TableHead>Weekday</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Generated title</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, weekday) => (
                  <TableRow key={WEEKDAY_NAMES[weekday]}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Pre-populate ${WEEKDAY_NAMES[weekday]}`}
                        checked={row.enabled}
                        onCheckedChange={(value) =>
                          updateRow(weekday, { enabled: value === true })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {WEEKDAY_NAMES[weekday]}
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`${WEEKDAY_NAMES[weekday]} template`}
                        className="w-full"
                        disabled={!row.enabled}
                        onChange={(event) =>
                          updateRow(weekday, { templateId: event.target.value })
                        }
                        value={row.templateId}
                      >
                        <NativeSelectOption value="">
                          Select a template…
                        </NativeSelectOption>
                        {templates.map((template) => (
                          <NativeSelectOption
                            key={template.id}
                            value={template.id}
                          >
                            {template.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${WEEKDAY_NAMES[weekday]} generated title`}
                        disabled={!row.enabled}
                        onChange={(event) =>
                          updateRow(weekday, {
                            defaultTitle: event.target.value,
                          })
                        }
                        value={row.defaultTitle}
                      />
                    </TableCell>
                    <TableCell>
                      {(() => {
                        if (!row.enabled) {
                          return (
                            <span className="text-muted-foreground text-sm">
                              Ignored
                            </span>
                          );
                        }

                        if (missingTemplate(row)) {
                          return (
                            <span className="text-destructive text-sm">
                              Select a template
                            </span>
                          );
                        }

                        return <Badge>Ready</Badge>;
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end">
              <Button
                disabled={hasMissingTemplate || isSaving}
                onClick={onSave}
                type="button"
              >
                <FloppyDiskIcon data-icon="inline-start" />
                {isSaving ? "Saving…" : "Save Month Planner settings"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Create a template before configuring the Month Planner.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
