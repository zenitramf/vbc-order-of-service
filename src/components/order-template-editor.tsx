import {
  ArrowSquareOutIcon,
  DotsSixVerticalIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";
import { v4 as uuidv4 } from "uuid";

import { OrderTeamAssignment } from "~/components/order-team-assignment";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "~/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { Textarea } from "~/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type {
  HymnOption,
  OrderActivity,
  OrderServiceTemplateJson,
  ReferenceOption,
  ServiceTypeCard,
  TeamMemberSummary,
  TeamSummary,
} from "~/lib/order-service-types";
import { cn } from "~/lib/utils";

interface HymnComboboxOption {
  hasLyrics: boolean;
  label: string;
  lastPlayed: string;
  musicKey: string;
  sourceName: string;
  value: string;
}

interface HymnComboboxGroup {
  items: HymnComboboxOption[];
  value: string;
}

const createId = () => uuidv4();

const createActivity = (): OrderActivity => ({
  activityName: "New Activity",
  activityType: "custom",
  id: createId(),
});

const createSegment = (): ServiceTypeCard => ({
  activities: [createActivity()],
  id: createId(),
  typeName: "New Service Segment",
});

const groupHymnOptionsBySource = (
  hymnOptions: HymnOption[]
): HymnComboboxGroup[] => {
  const groups = new Map<string, HymnComboboxOption[]>();

  for (const hymn of hymnOptions) {
    const sourceName = hymn.sourceName || "Other";
    const items = groups.get(sourceName) ?? [];
    items.push({
      hasLyrics: hymn.hasLyrics,
      label: hymn.label,
      lastPlayed: hymn.lastPlayed,
      musicKey: hymn.musicKey,
      sourceName: hymn.sourceName,
      value: hymn.id,
    });
    groups.set(sourceName, items);
  }

  return Array.from(groups, ([value, items]) => ({ items, value }));
};

interface DragState {
  activityId: string;
  segmentId: string;
}

interface EditorProps {
  activityTypes: ReferenceOption[];
  allowHymnSelection?: boolean;
  allowTeamAssignment?: boolean;
  allowTeamDefinition?: boolean;
  hymnOptions?: HymnOption[];
  onChange: (value: OrderServiceTemplateJson) => void;
  teamMembers?: TeamMemberSummary[];
  teams?: TeamSummary[];
  value: OrderServiceTemplateJson;
}

interface ActivityEditorProps {
  activity: OrderActivity;
  activityTypes: ReferenceOption[];
  allowHymnSelection: boolean;
  draggedActivity: DragState | null;
  hymnOptions: HymnOption[];
  onDragEnd: () => void;
  onDragStart: (activityId: string) => void;
  onDropActivity: (targetActivityId: string) => void;
  onRemove: () => void;
  onUpdate: (activity: OrderActivity) => void;
}

interface SegmentEditorProps {
  activityTypes: ReferenceOption[];
  allowHymnSelection: boolean;
  allowTeamAssignment: boolean;
  allowTeamDefinition: boolean;
  draggedActivity: DragState | null;
  hymnOptions: HymnOption[];
  onAddActivity: () => void;
  onDragEnd: () => void;
  onDragStart: (activityId: string) => void;
  onDropActivity: (targetActivityId: string) => void;
  onRemove: () => void;
  onUpdateSegment: (segment: ServiceTypeCard) => void;
  segment: ServiceTypeCard;
  teamMembers: TeamMemberSummary[];
  teams: TeamSummary[];
}

const updateSegment = (
  value: OrderServiceTemplateJson,
  segmentId: string,
  updater: (segment: ServiceTypeCard) => ServiceTypeCard
): OrderServiceTemplateJson => ({
  ...value,
  service_type: value.service_type.map((segment) =>
    segment.id === segmentId ? updater(segment) : segment
  ),
});

const reorderActivity = (
  value: OrderServiceTemplateJson,
  dragged: DragState,
  targetActivityId: string
): OrderServiceTemplateJson =>
  updateSegment(value, dragged.segmentId, (segment) => {
    const currentIndex = segment.activities.findIndex(
      (activity) => activity.id === dragged.activityId
    );
    const targetIndex = segment.activities.findIndex(
      (activity) => activity.id === targetActivityId
    );

    if (
      currentIndex === -1 ||
      targetIndex === -1 ||
      currentIndex === targetIndex
    ) {
      return segment;
    }

    const activities = [...segment.activities];
    const [movedActivity] = activities.splice(currentIndex, 1);
    activities.splice(targetIndex, 0, movedActivity);

    return { ...segment, activities };
  });

const ActivityEditor = ({
  activity,
  activityTypes,
  allowHymnSelection,
  draggedActivity,
  hymnOptions,
  onDragEnd,
  onDragStart,
  onDropActivity,
  onRemove,
  onUpdate,
}: ActivityEditorProps) => {
  const isDragging = draggedActivity?.activityId === activity.id;
  const hymnOptionGroups = React.useMemo(
    () => groupHymnOptionsBySource(hymnOptions),
    [hymnOptions]
  );
  const selectedHymn = hymnOptionGroups
    .flatMap((group) => group.items)
    .find((hymn) => hymn.value === activity.hymnId);
  const needsHymnSelection =
    allowHymnSelection && activity.activityType === "hymn" && !activity.hymnId;
  const selectedHymnNeedsLyrics = Boolean(
    selectedHymn && !selectedHymn.hasLyrics
  );
  const selectedHymnDetails = selectedHymn
    ? [
        `Last played: ${selectedHymn.lastPlayed || "Never"}`,
        `Key: ${selectedHymn.musicKey || "Not set"}`,
        `Source: ${selectedHymn.sourceName || "Not set"}`,
      ]
    : [];

  return (
    <div
      className={cn(
        "rounded-2xl border bg-background/50 p-4",
        needsHymnSelection && "border-destructive"
      )}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={() => onDragStart(activity.id)}
      onDrop={() => onDropActivity(activity.id)}
      data-dragging={isDragging}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex items-center gap-2 text-muted-foreground md:pt-8">
          <DotsSixVerticalIcon aria-hidden="true" />
          <span className="sr-only">Drag to reorder activity</span>
        </div>
        <FieldGroup className="flex-1 md:grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${activity.id}-name`}>
              Activity name
            </FieldLabel>
            <Input
              id={`${activity.id}-name`}
              onChange={(event) =>
                onUpdate({ ...activity, activityName: event.target.value })
              }
              value={activity.activityName}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${activity.id}-type`}>
              Activity type
            </FieldLabel>
            <NativeSelect
              className="w-full"
              id={`${activity.id}-type`}
              onChange={(event) => {
                const activityType = event.target.value;
                onUpdate({
                  ...activity,
                  activityType,
                  hymnId: activityType === "hymn" ? activity.hymnId : undefined,
                });
              }}
              value={activity.activityType}
            >
              {activityTypes.map((type) => (
                <NativeSelectOption key={type.id} value={type.id}>
                  {type.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {allowHymnSelection && activity.activityType === "hymn" ? (
            <Field className="md:col-span-2">
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor={`${activity.id}-hymn`}>
                  Hymn selection
                </FieldLabel>
                {selectedHymn ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          aria-label={
                            selectedHymnNeedsLyrics
                              ? "Selected hymn needs lyrics"
                              : "Update selected hymn"
                          }
                          className={cn(
                            "inline-flex",
                            selectedHymnNeedsLyrics
                              ? "text-destructive"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          params={{ hymnId: selectedHymn.value }}
                          to="/hymns/$hymnId"
                        >
                          {selectedHymnNeedsLyrics ? (
                            <WarningCircleIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                          ) : (
                            <ArrowSquareOutIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                          )}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent className="flex max-w-64 flex-col items-start gap-1">
                        {selectedHymnNeedsLyrics ? (
                          <span>Lyrics need to be added.</span>
                        ) : (
                          selectedHymnDetails.map((detail) => (
                            <span key={detail}>{detail}</span>
                          ))
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>
              <Combobox
                isItemEqualToValue={(item, value) => item.value === value.value}
                items={hymnOptionGroups}
                onValueChange={(hymn) =>
                  onUpdate({
                    ...activity,
                    hymnId: hymn?.value,
                  })
                }
                value={selectedHymn ?? null}
              >
                <ComboboxInput
                  aria-invalid={needsHymnSelection}
                  className="w-full"
                  id={`${activity.id}-hymn`}
                  placeholder="Choose a hymn"
                />
                <ComboboxContent>
                  <ComboboxEmpty>No hymns found.</ComboboxEmpty>
                  <ComboboxList>
                    {(group, index) => (
                      <ComboboxGroup key={group.value} items={group.items}>
                        <ComboboxLabel>{group.value}</ComboboxLabel>
                        <ComboboxCollection>
                          {(hymn) => (
                            <ComboboxItem key={hymn.value} value={hymn}>
                              {hymn.label}
                            </ComboboxItem>
                          )}
                        </ComboboxCollection>
                        {index < hymnOptionGroups.length - 1 ? (
                          <ComboboxSeparator />
                        ) : null}
                      </ComboboxGroup>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {needsHymnSelection ? (
                <FieldDescription className="text-destructive">
                  Select a hymn before publishing or sending this order.
                </FieldDescription>
              ) : null}
            </Field>
          ) : null}
          <Field className="md:col-span-2">
            <FieldLabel htmlFor={`${activity.id}-notes`}>Notes</FieldLabel>
            <Textarea
              id={`${activity.id}-notes`}
              onChange={(event) =>
                onUpdate({ ...activity, notes: event.target.value })
              }
              placeholder="Leader, scripture passage, arrangement, or reminders"
              value={activity.notes ?? ""}
            />
          </Field>
        </FieldGroup>
        <Button onClick={onRemove} type="button" variant="ghost">
          <TrashIcon data-icon="inline-start" />
          Remove
        </Button>
      </div>
    </div>
  );
};

type TeamRole = "none" | "optional" | "required";

const getTeamRole = (segment: ServiceTypeCard, teamId: string): TeamRole => {
  if (segment.requiredTeamIds?.includes(teamId)) {
    return "required";
  }

  if (segment.optionalTeamIds?.includes(teamId)) {
    return "optional";
  }

  return "none";
};

const setTeamRole = (
  segment: ServiceTypeCard,
  teamId: string,
  role: TeamRole
): ServiceTypeCard => {
  const required = new Set(segment.requiredTeamIds);
  const optional = new Set(segment.optionalTeamIds);
  required.delete(teamId);
  optional.delete(teamId);

  if (role === "required") {
    required.add(teamId);
  } else if (role === "optional") {
    optional.add(teamId);
  }

  return {
    ...segment,
    optionalTeamIds: [...optional],
    requiredTeamIds: [...required],
  };
};

const SegmentTeamDefinition = ({
  onUpdateSegment,
  segment,
  teams,
}: {
  onUpdateSegment: (segment: ServiceTypeCard) => void;
  segment: ServiceTypeCard;
  teams: TeamSummary[];
}) => (
  <div className="flex flex-col gap-3">
    <div>
      <CardTitle className="text-base">Teams</CardTitle>
      <CardDescription>
        Mark teams as required or optional for this service card. Required teams
        must be staffed before an order can be published.
      </CardDescription>
    </div>
    <div className="grid gap-2 md:grid-cols-2">
      {teams.map((team) => (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 px-3 py-2"
          key={team.id}
        >
          <span className="text-sm">
            {team.name}
            {team.parentName ? (
              <span className="text-muted-foreground">
                {" "}
                · {team.parentName}
              </span>
            ) : null}
          </span>
          <NativeSelect
            aria-label={`${team.name} requirement`}
            className="w-32"
            onChange={(event) =>
              onUpdateSegment(
                setTeamRole(segment, team.id, event.target.value as TeamRole)
              )
            }
            value={getTeamRole(segment, team.id)}
          >
            <NativeSelectOption value="none">Not used</NativeSelectOption>
            <NativeSelectOption value="optional">Optional</NativeSelectOption>
            <NativeSelectOption value="required">Required</NativeSelectOption>
          </NativeSelect>
        </div>
      ))}
    </div>
  </div>
);

const SegmentEditor = ({
  activityTypes,
  allowHymnSelection,
  allowTeamAssignment,
  allowTeamDefinition,
  draggedActivity,
  hymnOptions,
  onAddActivity,
  onDragEnd,
  onDragStart,
  onDropActivity,
  onRemove,
  onUpdateSegment,
  segment,
  teamMembers,
  teams,
}: SegmentEditorProps) => (
  <Card>
    <CardHeader>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <FieldGroup className="flex-1">
          <Field>
            <FieldLabel htmlFor={`${segment.id}-type-name`}>
              Service card name
            </FieldLabel>
            <Input
              id={`${segment.id}-type-name`}
              onChange={(event) =>
                onUpdateSegment({ ...segment, typeName: event.target.value })
              }
              value={segment.typeName}
            />
            <FieldDescription>
              Examples: Sunday School, Sunday Main Service, Sunday Evening
              Service.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <Button onClick={onRemove} type="button" variant="outline">
          <TrashIcon data-icon="inline-start" />
          Remove card
        </Button>
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <hr></hr>
      <div className="flex items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            Order of Service Activities
          </CardTitle>
          <CardDescription>
            Drag activities to reorder them within this service card.
          </CardDescription>
        </div>
        <Button onClick={onAddActivity} type="button" variant="secondary">
          <PlusIcon data-icon="inline-start" />
          Add activity
        </Button>
      </div>
      {segment.activities.map((activity) => (
        <ActivityEditor
          activity={activity}
          activityTypes={activityTypes}
          allowHymnSelection={allowHymnSelection}
          draggedActivity={draggedActivity}
          hymnOptions={hymnOptions}
          key={activity.id}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onDropActivity={onDropActivity}
          onRemove={() =>
            onUpdateSegment({
              ...segment,
              activities: segment.activities.filter(
                (item) => item.id !== activity.id
              ),
            })
          }
          onUpdate={(updatedActivity) =>
            onUpdateSegment({
              ...segment,
              activities: segment.activities.map((item) =>
                item.id === activity.id ? updatedActivity : item
              ),
            })
          }
        />
      ))}
      {allowTeamDefinition && teams.length > 0 ? (
        <>
          <hr />
          <SegmentTeamDefinition
            onUpdateSegment={onUpdateSegment}
            segment={segment}
            teams={teams}
          />
        </>
      ) : null}
      {allowTeamAssignment ? (
        <OrderTeamAssignment
          onUpdateSegment={onUpdateSegment}
          segment={segment}
          teamMembers={teamMembers}
          teams={teams}
        />
      ) : null}
    </CardContent>
  </Card>
);

const EMPTY_HYMN_OPTIONS: HymnOption[] = [];
const EMPTY_TEAMS: TeamSummary[] = [];
const EMPTY_TEAM_MEMBERS: TeamMemberSummary[] = [];

export const OrderTemplateEditor = ({
  activityTypes,
  allowHymnSelection = false,
  allowTeamAssignment = false,
  allowTeamDefinition = false,
  hymnOptions = EMPTY_HYMN_OPTIONS,
  onChange,
  teamMembers = EMPTY_TEAM_MEMBERS,
  teams = EMPTY_TEAMS,
  value,
}: EditorProps) => {
  const [draggedActivity, setDraggedActivity] =
    React.useState<DragState | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold">Service cards</h2>
          <p className="text-sm text-muted-foreground">
            Add cards for the main service segments, then add activities to each
            card.
          </p>
        </div>
        <Button
          onClick={() =>
            onChange({
              ...value,
              service_type: [...value.service_type, createSegment()],
            })
          }
          type="button"
          variant="outline"
        >
          <PlusIcon data-icon="inline-start" />
          Add card
        </Button>
      </div>

      {value.service_type.map((segment) => (
        <SegmentEditor
          activityTypes={activityTypes}
          allowHymnSelection={allowHymnSelection}
          allowTeamAssignment={allowTeamAssignment}
          allowTeamDefinition={allowTeamDefinition}
          draggedActivity={draggedActivity}
          hymnOptions={hymnOptions}
          key={segment.id}
          teamMembers={teamMembers}
          teams={teams}
          onAddActivity={() =>
            onChange(
              updateSegment(value, segment.id, (currentSegment) => ({
                ...currentSegment,
                activities: [...currentSegment.activities, createActivity()],
              }))
            )
          }
          onDragEnd={() => setDraggedActivity(null)}
          onDragStart={(activityId) =>
            setDraggedActivity({ activityId, segmentId: segment.id })
          }
          onDropActivity={(targetActivityId) => {
            if (!draggedActivity || draggedActivity.segmentId !== segment.id) {
              return;
            }

            onChange(reorderActivity(value, draggedActivity, targetActivityId));
            setDraggedActivity(null);
          }}
          onRemove={() =>
            onChange({
              ...value,
              service_type: value.service_type.filter(
                (item) => item.id !== segment.id
              ),
            })
          }
          onUpdateSegment={(updatedSegment) =>
            onChange(updateSegment(value, segment.id, () => updatedSegment))
          }
          segment={segment}
        />
      ))}
    </div>
  );
};
