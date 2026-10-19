import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CheckIcon,
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, Row } from "@tanstack/react-table";
import * as React from "react";
import { v4 as uuidv4 } from "uuid";

import { AddHymnDialog, AddHymnFlow } from "~/components/add-hymn-flow";
import { OrderTeamAssignment } from "~/components/order-team-assignment";
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
import { Separator } from "~/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { mergeHymnOptions } from "~/lib/hymn-sources";
import { getMusicKeyLabel } from "~/lib/music-keys";
import type {
  HymnOption,
  OrderActivity,
  OrderServiceTemplateJson,
  ReferenceOption,
  ServiceTypeCard,
  TeamMemberSummary,
  TeamSummary,
} from "~/lib/order-service-types";
import {
  MAX_REQUIRED_TEAM_COUNT,
  REQUIRED_TEAM_MINIMUM,
  clampRequiredTeamCount,
  getAssignmentMemberIds,
  getRequiredTeamCount,
} from "~/lib/teams-logic";
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

/**
 * Higher-contrast styling for the segment tabs so the selected tab clearly
 * stands out from the muted, unselected ones.
 */
const SEGMENT_TAB_TRIGGER_CLASS =
  "data-active:bg-primary data-active:font-semibold data-active:text-primary-foreground data-active:shadow-sm hover:data-active:bg-primary/90 hover:data-active:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground dark:hover:data-active:bg-primary/90 dark:hover:data-active:text-primary-foreground";

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

const activityNeedsHymn = (
  activity: OrderActivity,
  allowHymnSelection: boolean
) => allowHymnSelection && activity.activityType === "hymn" && !activity.hymnId;

/** Whether any activity on the card still needs attention (e.g. a hymn). */
const segmentActivitiesNeedAttention = (
  segment: ServiceTypeCard,
  allowHymnSelection: boolean
) =>
  segment.activities.some((activity) =>
    activityNeedsHymn(activity, allowHymnSelection)
  );

/** Whether any required team on the card is short of its required members. */
const segmentTeamsNeedAttention = (segment: ServiceTypeCard) =>
  (segment.requiredTeamIds ?? []).some(
    (teamId) =>
      getAssignmentMemberIds(segment, teamId).length <
      getRequiredTeamCount(segment, teamId)
  );

interface EditorProps {
  activityTypes: ReferenceOption[];
  /** Shows “Add new hymn” in the hymn picker (needs hymns:create). */
  allowHymnCreation?: boolean;
  allowHymnSelection?: boolean;
  allowTeamAssignment?: boolean;
  allowTeamDefinition?: boolean;
  hymnOptions?: HymnOption[];
  /** "cards" stacks one card per segment; "timeline" is one sequenced flow. */
  layout?: "cards" | "timeline";
  onChange: (value: OrderServiceTemplateJson) => void;
  teamMembers?: TeamMemberSummary[];
  teams?: TeamSummary[];
  value: OrderServiceTemplateJson;
}

interface ActivityFormProps {
  activity: OrderActivity;
  activityTypes: ReferenceOption[];
  allowHymnSelection: boolean;
  /** Renders the hymn popup inside this node so it scrolls within a dialog. */
  comboboxContainer?: HTMLElement | null;
  hymnOptions: HymnOption[];
  /** Opens the quick-add hymn flow, prefilled with the search text. */
  onAddHymn?: (initialName: string) => void;
  onUpdate: (activity: OrderActivity) => void;
}

interface SegmentEditorProps {
  activityTypes: ReferenceOption[];
  allowHymnCreation: boolean;
  allowHymnSelection: boolean;
  allowTeamAssignment: boolean;
  allowTeamDefinition: boolean;
  hymnOptions: HymnOption[];
  onAddActivity: () => void;
  onHymnCreated: (hymn: HymnOption) => void;
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

const removeActivity = (
  segment: ServiceTypeCard,
  activityId: string
): ServiceTypeCard => ({
  ...segment,
  activities: segment.activities.filter((item) => item.id !== activityId),
});

const replaceActivity = (
  segment: ServiceTypeCard,
  updated: OrderActivity
): ServiceTypeCard => ({
  ...segment,
  activities: segment.activities.map((item) =>
    item.id === updated.id ? updated : item
  ),
});

const reorderActivities = (
  segment: ServiceTypeCard,
  activeId: string,
  overId: string
): ServiceTypeCard => {
  const oldIndex = segment.activities.findIndex((item) => item.id === activeId);
  const newIndex = segment.activities.findIndex((item) => item.id === overId);

  if (oldIndex === -1 || newIndex === -1) {
    return segment;
  }

  return {
    ...segment,
    activities: arrayMove(segment.activities, oldIndex, newIndex),
  };
};

/** Whether the card carries any team configuration or assignments to show. */
const segmentHasTeamConfig = (segment: ServiceTypeCard): boolean =>
  (segment.requiredTeamIds?.length ?? 0) > 0 ||
  (segment.optionalTeamIds?.length ?? 0) > 0 ||
  (segment.teamAssignments?.length ?? 0) > 0;

interface HymnComboboxProps {
  comboboxContainer?: HTMLElement | null;
  hymnId: string | undefined;
  hymnOptions: HymnOption[];
  id?: string;
  invalid?: boolean;
  /** Opens the quick-add hymn flow, prefilled with the search text. */
  onAddHymn?: (initialName: string) => void;
  onChange: (hymnId: string | undefined) => void;
}

/** Hymn picker shared by the activity dialog and inline timeline rows. */
const HymnCombobox = ({
  comboboxContainer,
  hymnId,
  hymnOptions,
  id,
  invalid = false,
  onAddHymn,
  onChange,
}: HymnComboboxProps) => {
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const hymnOptionGroups = React.useMemo(
    () => groupHymnOptionsBySource(hymnOptions),
    [hymnOptions]
  );
  const selectedHymn =
    hymnOptionGroups
      .flatMap((group) => group.items)
      .find((hymn) => hymn.value === hymnId) ?? null;
  const trimmedSearch = searchText.trim();

  const handleAddHymn = () => {
    setOpen(false);
    onAddHymn?.(trimmedSearch);
  };

  return (
    <Combobox
      isItemEqualToValue={(item, value) => item.value === value.value}
      items={hymnOptionGroups}
      onInputValueChange={(inputValue) => setSearchText(inputValue)}
      onOpenChange={setOpen}
      onValueChange={(hymn) => onChange(hymn?.value)}
      open={open}
      value={selectedHymn}
    >
      <ComboboxInput
        aria-invalid={invalid}
        className="w-full"
        id={id}
        placeholder="Choose a hymn"
      />
      <ComboboxContent container={comboboxContainer}>
        <ComboboxEmpty>
          {onAddHymn ? (
            <span className="flex flex-col items-center gap-2 py-1">
              <span>No hymns found.</span>
              <Button
                onClick={(event) => {
                  // Pointer presses are handled on pointer down below;
                  // detail 0 is a keyboard-activated click.
                  if (event.detail === 0) {
                    handleAddHymn();
                  }
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleAddHymn();
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                <PlusIcon data-icon="inline-start" />
                {trimmedSearch
                  ? `Add “${trimmedSearch}” as new hymn`
                  : "Add new hymn"}
              </Button>
            </span>
          ) : (
            "No hymns found."
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {(group, index) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(hymn) => (
                  <ComboboxItem
                    className="items-start py-2"
                    key={hymn.value}
                    value={hymn}
                  >
                    <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="leading-snug">{hymn.label}</span>
                        <span className="text-muted-foreground text-xs font-normal">
                          Last played: {hymn.lastPlayed || "Never"}
                        </span>
                      </span>
                      {hymn.musicKey.trim() ? (
                        <Badge className="mt-0.5 shrink-0" variant="secondary">
                          {getMusicKeyLabel(hymn.musicKey)}
                        </Badge>
                      ) : null}
                    </span>
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
  );
};

const ActivityForm = ({
  activity,
  activityTypes,
  allowHymnSelection,
  comboboxContainer,
  hymnOptions,
  onAddHymn,
  onUpdate,
}: ActivityFormProps) => {
  const selectedHymn = hymnOptions.find((hymn) => hymn.id === activity.hymnId);
  const needsHymnSelection = activityNeedsHymn(activity, allowHymnSelection);
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
    <FieldGroup className="md:grid md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${activity.id}-name`}>Activity name</FieldLabel>
        <Input
          id={`${activity.id}-name`}
          onChange={(event) =>
            onUpdate({ ...activity, activityName: event.target.value })
          }
          value={activity.activityName}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${activity.id}-type`}>Activity type</FieldLabel>
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
                          ? "text-warning"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      params={{ hymnId: selectedHymn.id }}
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
            {onAddHymn ? (
              <Button
                className="ml-auto"
                onClick={() => onAddHymn("")}
                size="sm"
                type="button"
                variant="ghost"
              >
                <PlusIcon data-icon="inline-start" />
                Add new hymn
              </Button>
            ) : null}
          </div>
          <HymnCombobox
            comboboxContainer={comboboxContainer}
            hymnId={activity.hymnId}
            hymnOptions={hymnOptions}
            id={`${activity.id}-hymn`}
            invalid={needsHymnSelection}
            onAddHymn={onAddHymn}
            onChange={(hymnId) => onUpdate({ ...activity, hymnId })}
          />
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
  );
};

interface ActivityManageDialogProps {
  activity: OrderActivity;
  activityTypes: ReferenceOption[];
  allowHymnCreation: boolean;
  allowHymnSelection: boolean;
  hymnOptions: HymnOption[];
  onClose: () => void;
  onHymnCreated: (hymn: HymnOption) => void;
  onUpdate: (activity: OrderActivity) => void;
}

const ActivityManageDialog = ({
  activity,
  activityTypes,
  allowHymnCreation,
  allowHymnSelection,
  hymnOptions,
  onClose,
  onHymnCreated,
  onUpdate,
}: ActivityManageDialogProps) => {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  // Null shows the activity form; a string swaps this same dialog to the
  // quick-add hymn flow (prefilled with that text) instead of stacking a
  // second dialog, so the activity being edited is never lost.
  const [addHymnName, setAddHymnName] = React.useState<string | null>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          if (addHymnName === null) {
            onClose();
          } else {
            setAddHymnName(null);
          }
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-2xl" ref={setContainer}>
        {addHymnName === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Manage activity</DialogTitle>
              <DialogDescription>
                Update the details for this activity.
              </DialogDescription>
            </DialogHeader>
            <ActivityForm
              activity={activity}
              activityTypes={activityTypes}
              allowHymnSelection={allowHymnSelection}
              comboboxContainer={container}
              hymnOptions={hymnOptions}
              onAddHymn={
                allowHymnCreation
                  ? (initialName) => setAddHymnName(initialName)
                  : undefined
              }
              onUpdate={onUpdate}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <AddHymnFlow
            initialName={addHymnName}
            onCancel={() => setAddHymnName(null)}
            onCreated={(hymn) => {
              onHymnCreated(hymn);
              onUpdate({ ...activity, hymnId: hymn.id });
              setAddHymnName(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

type SortableRowHandle = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

const SortableRowContext = React.createContext<SortableRowHandle | null>(null);

const DragHandleCell = () => {
  const handle = React.useContext(SortableRowContext);

  return (
    <button
      aria-label="Drag to reorder activity"
      className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
      onClick={(event) => event.stopPropagation()}
      ref={handle?.setActivatorNodeRef}
      type="button"
      {...handle?.attributes}
      {...handle?.listeners}
    >
      <DotsSixVerticalIcon aria-hidden="true" />
    </button>
  );
};

interface ActivityColumnsOptions {
  activityTypeNames: Map<string, string>;
  allowHymnSelection: boolean;
  hymnOptions: HymnOption[];
  hymnsById: Map<string, HymnOption>;
  /** Timeline rows pick hymns in place instead of via the Manage dialog. */
  inlineHymnEditing: boolean;
  /** Opens quick-add for this activity; omit when hymn creation is off. */
  onAddHymn?: (activity: OrderActivity, initialName: string) => void;
  onManage: (activityId: string) => void;
  onRemove: (activityId: string) => void;
  onUpdate: (activity: OrderActivity) => void;
}

const ACTIVITY_COLUMN_CLASS_NAMES: Record<string, string> = {
  actions: "w-10 px-1 text-right sm:px-2",
  activityName: "whitespace-normal py-2.5 md:whitespace-nowrap md:py-2",
  activityType: "hidden md:table-cell",
  drag: "w-8 px-1.5 sm:px-2",
  hymn: "hidden md:table-cell",
  notes: "hidden md:table-cell",
};

const createActivityColumns = ({
  activityTypeNames,
  allowHymnSelection,
  hymnOptions,
  hymnsById,
  inlineHymnEditing,
  onAddHymn,
  onManage,
  onRemove,
  onUpdate,
}: ActivityColumnsOptions): ColumnDef<OrderActivity>[] => {
  const columns: ColumnDef<OrderActivity>[] = [
    {
      cell: () => <DragHandleCell />,
      header: () => <span className="sr-only">Reorder</span>,
      id: "drag",
    },
    {
      accessorKey: "activityName",
      cell: ({ row }) => {
        const activity = row.original;
        const isHymnActivity =
          allowHymnSelection && activity.activityType === "hymn";
        const selectedHymn =
          isHymnActivity && activity.hymnId
            ? hymnsById.get(activity.hymnId)
            : undefined;
        const typeLabel =
          activityTypeNames.get(activity.activityType) ?? activity.activityType;
        const notes = activity.notes?.trim();
        const needsHymn = isHymnActivity && !activity.hymnId;
        const needsLyrics = selectedHymn?.hasLyrics === false;
        const showMobileHymnPicker = isHymnActivity && inlineHymnEditing;

        return (
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="font-medium">{activity.activityName}</span>
              <Badge className="md:hidden" variant="secondary">
                {typeLabel}
              </Badge>
              {selectedHymn?.musicKey.trim() ? (
                <Badge className="md:hidden" variant="outline">
                  {getMusicKeyLabel(selectedHymn.musicKey)}
                </Badge>
              ) : null}
              {needsHymn ? (
                <WarningCircleIcon
                  aria-label="Needs a hymn"
                  className="size-4 shrink-0 text-destructive"
                />
              ) : null}
              {needsLyrics ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex shrink-0">
                        <WarningCircleIcon
                          aria-label="Lyrics need to be added"
                          className="size-4 text-warning"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Lyrics need to be added.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            {selectedHymn ? (
              <p
                className={cn(
                  "text-xs leading-snug",
                  inlineHymnEditing
                    ? "text-foreground/90 font-medium md:hidden"
                    : "truncate text-muted-foreground"
                )}
              >
                {selectedHymn.label}
              </p>
            ) : null}
            {notes ? (
              <p className="text-muted-foreground text-xs leading-relaxed md:hidden">
                {notes}
              </p>
            ) : null}
            {showMobileHymnPicker ? (
              <div
                className="w-full md:hidden"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                role="presentation"
              >
                <HymnCombobox
                  hymnId={activity.hymnId}
                  hymnOptions={hymnOptions}
                  invalid={!activity.hymnId}
                  onAddHymn={
                    onAddHymn
                      ? (initialName) => onAddHymn(activity, initialName)
                      : undefined
                  }
                  onChange={(hymnId) => onUpdate({ ...activity, hymnId })}
                />
              </div>
            ) : null}
          </div>
        );
      },
      header: "Activity",
    },
    {
      accessorKey: "activityType",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {activityTypeNames.get(row.original.activityType) ??
            row.original.activityType}
        </Badge>
      ),
      header: "Type",
    },
    {
      accessorKey: "notes",
      cell: ({ row }) => {
        const notes = row.original.notes?.trim();

        if (!notes) {
          return <span className="text-muted-foreground text-sm">—</span>;
        }

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block max-w-[16rem] truncate text-muted-foreground text-sm">
                  {notes}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap">
                {notes}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      header: "Notes",
    },
    {
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Activity actions"
                onClick={(event) => event.stopPropagation()}
                size="icon"
                type="button"
                variant="ghost"
              >
                <DotsThreeVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onManage(row.original.id)}>
                Manage
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => onRemove(row.original.id)}
              >
                <TrashIcon data-icon="inline-start" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      header: () => <span className="sr-only">Actions</span>,
      id: "actions",
    },
  ];

  if (allowHymnSelection && inlineHymnEditing) {
    columns.splice(-1, 0, {
      cell: ({ row }) => {
        const activity = row.original;

        if (activity.activityType !== "hymn") {
          return <span className="text-muted-foreground text-sm">—</span>;
        }

        return (
          <div
            className="min-w-44"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="presentation"
          >
            <HymnCombobox
              hymnId={activity.hymnId}
              hymnOptions={hymnOptions}
              invalid={!activity.hymnId}
              onAddHymn={
                onAddHymn
                  ? (initialName) => onAddHymn(activity, initialName)
                  : undefined
              }
              onChange={(hymnId) => onUpdate({ ...activity, hymnId })}
            />
          </div>
        );
      },
      header: "Hymn",
      id: "hymn",
    });
  }

  return columns;
};

interface SortableActivityRowProps {
  onManage: (activityId: string) => void;
  row: Row<OrderActivity>;
}

const SortableActivityRow = ({ onManage, row }: SortableActivityRowProps) => {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: row.original.id });

  const handle = React.useMemo<SortableRowHandle>(
    () => ({ attributes, listeners, setActivatorNodeRef }),
    [attributes, listeners, setActivatorNodeRef]
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <SortableRowContext.Provider value={handle}>
      <TableRow
        className={cn("cursor-pointer", isDragging && "relative z-10 bg-muted")}
        data-dragging={isDragging}
        onClick={() => onManage(row.original.id)}
        ref={setNodeRef}
        style={style}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            className={ACTIVITY_COLUMN_CLASS_NAMES[cell.column.id]}
            key={cell.id}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    </SortableRowContext.Provider>
  );
};

interface SegmentActivitiesTableProps {
  activities: OrderActivity[];
  activityTypes: ReferenceOption[];
  allowHymnCreation: boolean;
  allowHymnSelection: boolean;
  hymnOptions: HymnOption[];
  inlineHymnEditing?: boolean;
  onHymnCreated: (hymn: HymnOption) => void;
  onRemove: (activityId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onUpdate: (activity: OrderActivity) => void;
  segmentId: string;
}

const SegmentActivitiesTable = ({
  activities,
  activityTypes,
  allowHymnCreation,
  allowHymnSelection,
  hymnOptions,
  inlineHymnEditing = false,
  onHymnCreated,
  onRemove,
  onReorder,
  onUpdate,
  segmentId,
}: SegmentActivitiesTableProps) => {
  const [manageActivityId, setManageActivityId] = React.useState<string | null>(
    null
  );
  const [addHymnFor, setAddHymnFor] = React.useState<{
    activityId: string;
    initialName: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activityTypeNames = React.useMemo(
    () => new Map(activityTypes.map((type) => [type.id, type.name])),
    [activityTypes]
  );

  const hymnsById = React.useMemo(
    () => new Map(hymnOptions.map((hymn) => [hymn.id, hymn])),
    [hymnOptions]
  );

  const columns = React.useMemo(
    () =>
      createActivityColumns({
        activityTypeNames,
        allowHymnSelection,
        hymnOptions,
        hymnsById,
        inlineHymnEditing,
        onAddHymn: allowHymnCreation
          ? (activity, initialName) =>
              setAddHymnFor({ activityId: activity.id, initialName })
          : undefined,
        onManage: setManageActivityId,
        onRemove,
        onUpdate,
      }),
    [
      activityTypeNames,
      allowHymnCreation,
      allowHymnSelection,
      hymnOptions,
      hymnsById,
      inlineHymnEditing,
      onRemove,
      onUpdate,
    ]
  );

  const table = useReactTable({
    columns,
    data: activities,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const activityIds = React.useMemo(
    () => activities.map((activity) => activity.id),
    [activities]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  const manageActivity = activities.find(
    (activity) => activity.id === manageActivityId
  );

  return (
    <>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <Table>
          <TableHeader className="hidden md:table-header-group">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={ACTIVITY_COLUMN_CLASS_NAMES[header.column.id]}
                    key={header.id}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-muted-foreground"
                  colSpan={columns.length}
                >
                  No activities yet. Use “Add activity” to build this card.
                </TableCell>
              </TableRow>
            ) : (
              <SortableContext
                items={activityIds}
                strategy={verticalListSortingStrategy}
              >
                {table.getRowModel().rows.map((row) => (
                  <SortableActivityRow
                    key={row.id}
                    onManage={setManageActivityId}
                    row={row}
                  />
                ))}
              </SortableContext>
            )}
          </TableBody>
        </Table>
      </DndContext>

      {manageActivity ? (
        <ActivityManageDialog
          activity={manageActivity}
          activityTypes={activityTypes}
          allowHymnCreation={allowHymnCreation}
          allowHymnSelection={allowHymnSelection}
          hymnOptions={hymnOptions}
          key={`${segmentId}-${manageActivity.id}`}
          onClose={() => setManageActivityId(null)}
          onHymnCreated={onHymnCreated}
          onUpdate={onUpdate}
        />
      ) : null}

      {addHymnFor ? (
        <AddHymnDialog
          initialName={addHymnFor.initialName}
          key={`${segmentId}-add-hymn-${addHymnFor.activityId}`}
          onClose={() => setAddHymnFor(null)}
          onCreated={(hymn) => {
            onHymnCreated(hymn);
            const activity = activities.find(
              (item) => item.id === addHymnFor.activityId
            );

            if (activity) {
              onUpdate({ ...activity, hymnId: hymn.id });
            }

            setAddHymnFor(null);
          }}
        />
      ) : null}
    </>
  );
};

type TeamRole = "optional" | "required";

const getTeamRole = (segment: ServiceTypeCard, teamId: string): TeamRole =>
  segment.requiredTeamIds?.includes(teamId) ? "required" : "optional";

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
  } else {
    optional.add(teamId);
  }

  // Drop any stored count when a team is no longer required so stale amounts
  // never linger.
  const requiredTeamCounts = Object.fromEntries(
    Object.entries(segment.requiredTeamCounts ?? {}).filter(
      ([id]) => id !== teamId || role === "required"
    )
  );

  return {
    ...segment,
    optionalTeamIds: [...optional],
    requiredTeamCounts,
    requiredTeamIds: [...required],
  };
};

const setTeamCount = (
  segment: ServiceTypeCard,
  teamId: string,
  count: number
): ServiceTypeCard => ({
  ...segment,
  requiredTeamCounts: {
    ...segment.requiredTeamCounts,
    [teamId]: clampRequiredTeamCount(count),
  },
});

const removeTeamFromSegment = (
  segment: ServiceTypeCard,
  teamId: string
): ServiceTypeCard => ({
  ...segment,
  optionalTeamIds: (segment.optionalTeamIds ?? []).filter(
    (id) => id !== teamId
  ),
  requiredTeamCounts: Object.fromEntries(
    Object.entries(segment.requiredTeamCounts ?? {}).filter(
      ([id]) => id !== teamId
    )
  ),
  requiredTeamIds: (segment.requiredTeamIds ?? []).filter(
    (id) => id !== teamId
  ),
});

interface TeamDefinitionRow {
  count: number;
  role: TeamRole;
  team: TeamSummary;
}

interface TeamDefinitionColumnsOptions {
  onEdit: (teamId: string) => void;
  onRemove: (teamId: string) => void;
}

const createTeamDefinitionColumns = ({
  onEdit,
  onRemove,
}: TeamDefinitionColumnsOptions): ColumnDef<TeamDefinitionRow>[] => [
  {
    accessorFn: (row) => row.team.name,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.team.name}</span>
        {row.original.team.parentName ? (
          <span className="text-muted-foreground text-xs">
            {row.original.team.parentName}
          </span>
        ) : null}
      </div>
    ),
    header: "Team",
    id: "team",
  },
  {
    cell: ({ row }) =>
      row.original.role === "required" ? (
        <Badge variant="secondary">Required</Badge>
      ) : (
        <Badge variant="outline">Optional</Badge>
      ),
    header: "Requirement",
    id: "requirement",
  },
  {
    cell: ({ row }) =>
      row.original.role === "required" ? (
        <span className="tabular-nums">{row.original.count}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
    header: "Members required",
    id: "amount",
  },
  {
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Team actions"
              onClick={(event) => event.stopPropagation()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <DotsThreeVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(row.original.team.id)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => onRemove(row.original.team.id)}
            >
              <TrashIcon data-icon="inline-start" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  },
];

const SegmentTeamEditDialog = ({
  count,
  onChangeCount,
  onChangeRole,
  onClose,
  role,
  team,
}: {
  count: number;
  onChangeCount: (count: number) => void;
  onChangeRole: (role: TeamRole) => void;
  onClose: () => void;
  role: TeamRole;
  team: TeamSummary;
}) => (
  <Dialog
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    open
  >
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{team.name}</DialogTitle>
        <DialogDescription>
          {team.parentName
            ? `Part of ${team.parentName}. Set how this team is used on this service card.`
            : "Set how this team is used on this service card."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${team.id}-requirement`}>
            Requirement
          </FieldLabel>
          <NativeSelect
            className="w-full"
            id={`${team.id}-requirement`}
            onChange={(event) => onChangeRole(event.target.value as TeamRole)}
            value={role}
          >
            <NativeSelectOption value="optional">Optional</NativeSelectOption>
            <NativeSelectOption value="required">Required</NativeSelectOption>
          </NativeSelect>
          <FieldDescription>
            Optional teams are suggestions. Required teams must be staffed
            before the order can be published.
          </FieldDescription>
        </Field>
        {role === "required" ? (
          <Field>
            <FieldLabel htmlFor={`${team.id}-amount`}>
              Members required
            </FieldLabel>
            <Input
              id={`${team.id}-amount`}
              max={MAX_REQUIRED_TEAM_COUNT}
              min={REQUIRED_TEAM_MINIMUM}
              onChange={(event) => onChangeCount(Number(event.target.value))}
              type="number"
              value={count}
            />
            <FieldDescription>
              The order can’t be published until this many members are assigned
              to {team.name} (max {MAX_REQUIRED_TEAM_COUNT}).
            </FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const SegmentTeamDefinition = ({
  onUpdateSegment,
  segment,
  teams,
}: {
  onUpdateSegment: (segment: ServiceTypeCard) => void;
  segment: ServiceTypeCard;
  teams: TeamSummary[];
}) => {
  const [editTeamId, setEditTeamId] = React.useState<string | null>(null);

  const configuredTeamIds = React.useMemo(
    () =>
      new Set([
        ...(segment.requiredTeamIds ?? []),
        ...(segment.optionalTeamIds ?? []),
      ]),
    [segment.optionalTeamIds, segment.requiredTeamIds]
  );

  const rows = React.useMemo<TeamDefinitionRow[]>(
    () =>
      teams
        .filter((team) => configuredTeamIds.has(team.id))
        .map((team) => ({
          count: getRequiredTeamCount(segment, team.id),
          role: getTeamRole(segment, team.id),
          team,
        })),
    [configuredTeamIds, segment, teams]
  );

  const availableTeams = teams.filter(
    (team) => !configuredTeamIds.has(team.id)
  );

  const columns = React.useMemo(
    () =>
      createTeamDefinitionColumns({
        onEdit: setEditTeamId,
        onRemove: (teamId) =>
          onUpdateSegment(removeTeamFromSegment(segment, teamId)),
      }),
    [onUpdateSegment, segment]
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.team.id,
  });

  const editTeam = teams.find((team) => team.id === editTeamId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <CardTitle className="text-base">Teams</CardTitle>
          <CardDescription>
            Add the teams that should appear on this service card in new orders,
            and mark each optional or required. Required teams must be staffed
            before an order can be published. Click a row to edit a team.
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={availableTeams.length === 0}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon data-icon="inline-start" />
              Add team
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {availableTeams.length === 0 ? "All teams added" : "Add a team"}
            </DropdownMenuLabel>
            {availableTeams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onSelect={() =>
                  onUpdateSegment(setTeamRole(segment, team.id, "optional"))
                }
              >
                {team.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-muted-foreground"
                colSpan={columns.length}
              >
                No teams added yet. Use “Add team” to choose which teams appear
                on this card.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                className="cursor-pointer"
                key={row.id}
                onClick={() => setEditTeamId(row.original.team.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {editTeam ? (
        <SegmentTeamEditDialog
          count={getRequiredTeamCount(segment, editTeam.id)}
          key={editTeam.id}
          onChangeCount={(count) =>
            onUpdateSegment(setTeamCount(segment, editTeam.id, count))
          }
          onChangeRole={(role) =>
            onUpdateSegment(setTeamRole(segment, editTeam.id, role))
          }
          onClose={() => setEditTeamId(null)}
          role={getTeamRole(segment, editTeam.id)}
          team={editTeam}
        />
      ) : null}
    </div>
  );
};

const SegmentEditor = ({
  activityTypes,
  allowHymnCreation,
  allowHymnSelection,
  allowTeamAssignment,
  allowTeamDefinition,
  hymnOptions,
  onAddActivity,
  onHymnCreated,
  onRemove,
  onUpdateSegment,
  segment,
  teamMembers,
  teams,
}: SegmentEditorProps) => {
  const [isEditingName, setIsEditingName] = React.useState(false);
  const activitiesNeedAttention = segmentActivitiesNeedAttention(
    segment,
    allowHymnSelection
  );
  const showTeamAssignment =
    allowTeamAssignment && segmentHasTeamConfig(segment);
  const teamsNeedAttention = showTeamAssignment
    ? segmentTeamsNeedAttention(segment)
    : false;

  return (
    <Card>
      <CardHeader>
        {isEditingName ? (
          <Field className="flex-1">
            <FieldLabel htmlFor={`${segment.id}-type-name`}>
              Service card name
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                id={`${segment.id}-type-name`}
                onChange={(event) =>
                  onUpdateSegment({
                    ...segment,
                    typeName: event.target.value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setIsEditingName(false);
                  }
                }}
                value={segment.typeName}
              />
              <Button
                aria-label="Save card name"
                onClick={() => setIsEditingName(false)}
                size="icon"
                type="button"
                variant="outline"
              >
                <CheckIcon />
                <span className="sr-only">Save card name</span>
              </Button>
            </div>
            <FieldDescription>
              Examples: Sunday School, Sunday Main Service, Sunday Evening
              Service.
            </FieldDescription>
          </Field>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {segment.typeName}
              <Button
                aria-label="Edit card name"
                onClick={() => setIsEditingName(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <PencilSimpleIcon />
                <span className="sr-only">Edit card name</span>
              </Button>
            </CardTitle>
            <Button
              aria-label="Remove card"
              onClick={onRemove}
              size="icon"
              type="button"
              variant="outline"
            >
              <TrashIcon />
              <span className="sr-only">Remove card</span>
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs defaultValue="activities">
          <TabsList>
            <TabsTrigger
              className={SEGMENT_TAB_TRIGGER_CLASS}
              value="activities"
            >
              <span className="flex items-center gap-2">
                {`${segment.typeName} activities`}
                {activitiesNeedAttention ? (
                  <WarningCircleIcon
                    aria-label="Some activities need attention"
                    className="size-4 text-destructive"
                  />
                ) : null}
              </span>
            </TabsTrigger>
            {showTeamAssignment ? (
              <TabsTrigger
                className={SEGMENT_TAB_TRIGGER_CLASS}
                value="team-assignments"
              >
                <span className="flex items-center gap-2">
                  {`${segment.typeName} team assignments`}
                  {teamsNeedAttention ? (
                    <WarningCircleIcon
                      aria-label="Required teams need members"
                      className="size-4 text-destructive"
                    />
                  ) : null}
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent className="flex flex-col gap-4 pt-2" value="activities">
            <div className="flex items-center justify-between gap-4">
              <CardDescription>
                Drag rows to reorder activities, or click a row to edit it.
              </CardDescription>
              <Button onClick={onAddActivity} type="button" variant="secondary">
                <PlusIcon data-icon="inline-start" />
                Add activity
              </Button>
            </div>
            <SegmentActivitiesTable
              activities={segment.activities}
              activityTypes={activityTypes}
              allowHymnCreation={allowHymnCreation}
              allowHymnSelection={allowHymnSelection}
              hymnOptions={hymnOptions}
              onHymnCreated={onHymnCreated}
              onRemove={(activityId) =>
                onUpdateSegment(removeActivity(segment, activityId))
              }
              onReorder={(activeId, overId) =>
                onUpdateSegment(reorderActivities(segment, activeId, overId))
              }
              onUpdate={(updatedActivity) =>
                onUpdateSegment(replaceActivity(segment, updatedActivity))
              }
              segmentId={segment.id}
            />
          </TabsContent>
          {showTeamAssignment ? (
            <TabsContent className="pt-2" value="team-assignments">
              <OrderTeamAssignment
                headingHidden
                onUpdateSegment={onUpdateSegment}
                segment={segment}
                teamMembers={teamMembers}
                teams={teams}
              />
            </TabsContent>
          ) : null}
        </Tabs>
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
      </CardContent>
    </Card>
  );
};

interface TimelineSegmentEditorProps extends SegmentEditorProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}

/**
 * One timeblock on the order timeline. Unlike the card editor, activities and
 * team assignments are always visible together so it is obvious which hymns
 * and which ushers/counters belong to this part of the service.
 */
const TimelineSegmentEditor = ({
  activityTypes,
  allowHymnCreation,
  allowHymnSelection,
  allowTeamAssignment,
  hymnOptions,
  index,
  isFirst,
  isLast,
  onAddActivity,
  onHymnCreated,
  onMove,
  onRemove,
  onUpdateSegment,
  segment,
  teamMembers,
  teams,
}: TimelineSegmentEditorProps) => {
  const [isEditingName, setIsEditingName] = React.useState(false);
  const activitiesNeedAttention = segmentActivitiesNeedAttention(
    segment,
    allowHymnSelection
  );
  const showTeamAssignment =
    allowTeamAssignment && segmentHasTeamConfig(segment);
  const teamsNeedAttention = showTeamAssignment
    ? segmentTeamsNeedAttention(segment)
    : false;
  const needsAttention = activitiesNeedAttention || teamsNeedAttention;

  return (
    <section aria-label={segment.typeName} className="flex gap-3 sm:gap-4">
      <div
        aria-hidden="true"
        className="hidden sm:flex sm:flex-col sm:items-center"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
            needsAttention ? "border-destructive text-destructive" : "bg-muted"
          )}
        >
          {index + 1}
        </span>
        {isLast ? null : <span className="w-px flex-1 bg-border" />}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-4 pb-8 sm:pb-10",
          !isLast && "border-b border-border/60 sm:border-b-0"
        )}
      >
        {isEditingName ? (
          <Field>
            <FieldLabel htmlFor={`${segment.id}-timeline-name`}>
              Timeblock name
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                id={`${segment.id}-timeline-name`}
                onChange={(event) =>
                  onUpdateSegment({
                    ...segment,
                    typeName: event.target.value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setIsEditingName(false);
                  }
                }}
                value={segment.typeName}
              />
              <Button
                aria-label="Save timeblock name"
                onClick={() => setIsEditingName(false)}
                size="icon"
                type="button"
                variant="outline"
              >
                <CheckIcon />
                <span className="sr-only">Save timeblock name</span>
              </Button>
            </div>
            <FieldDescription>
              Examples: Sunday School, Sunday Main Service, Sunday Evening
              Service.
            </FieldDescription>
          </Field>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums sm:hidden",
                    needsAttention
                      ? "border-destructive text-destructive"
                      : "bg-muted"
                  )}
                >
                  {index + 1}
                </span>
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Timeblock {index + 1}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  aria-label="Move timeblock earlier"
                  disabled={isFirst}
                  onClick={() => onMove(-1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ArrowUpIcon />
                  <span className="sr-only">Move timeblock earlier</span>
                </Button>
                <Button
                  aria-label="Move timeblock later"
                  disabled={isLast}
                  onClick={() => onMove(1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ArrowDownIcon />
                  <span className="sr-only">Move timeblock later</span>
                </Button>
                <Button
                  aria-label="Remove timeblock"
                  onClick={onRemove}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <TrashIcon />
                  <span className="sr-only">Remove timeblock</span>
                </Button>
              </div>
            </div>
            <h3 className="flex flex-wrap items-center gap-2 font-heading text-xl font-semibold">
              <span className="inline-flex items-center gap-1">
                {segment.typeName}
                <Button
                  aria-label="Edit timeblock name"
                  onClick={() => setIsEditingName(true)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <PencilSimpleIcon />
                  <span className="sr-only">Edit timeblock name</span>
                </Button>
              </span>
              {needsAttention ? (
                <Badge variant="destructive">
                  <WarningCircleIcon />
                  Needs attention
                </Badge>
              ) : null}
            </h3>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-sm font-semibold">Activities</h4>
            <Button
              onClick={onAddActivity}
              size="sm"
              type="button"
              variant="secondary"
            >
              <PlusIcon data-icon="inline-start" />
              Add activity
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Drag rows to reorder. Choose hymns right in the row; click a row for
            notes and details.
          </p>
          <SegmentActivitiesTable
            activities={segment.activities}
            activityTypes={activityTypes}
            allowHymnCreation={allowHymnCreation}
            allowHymnSelection={allowHymnSelection}
            hymnOptions={hymnOptions}
            inlineHymnEditing
            onHymnCreated={onHymnCreated}
            onRemove={(activityId) =>
              onUpdateSegment(removeActivity(segment, activityId))
            }
            onReorder={(activeId, overId) =>
              onUpdateSegment(reorderActivities(segment, activeId, overId))
            }
            onUpdate={(updatedActivity) =>
              onUpdateSegment(replaceActivity(segment, updatedActivity))
            }
            segmentId={segment.id}
          />
        </div>

        {showTeamAssignment ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">
                Who&rsquo;s serving in {segment.typeName}
              </h4>
              <OrderTeamAssignment
                headingHidden
                onUpdateSegment={onUpdateSegment}
                segment={segment}
                teamMembers={teamMembers}
                teams={teams}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
};

const EMPTY_HYMN_OPTIONS: HymnOption[] = [];
const EMPTY_TEAMS: TeamSummary[] = [];
const EMPTY_TEAM_MEMBERS: TeamMemberSummary[] = [];

export const OrderTemplateEditor = ({
  activityTypes,
  allowHymnCreation = false,
  allowHymnSelection = false,
  allowTeamAssignment = false,
  allowTeamDefinition = false,
  hymnOptions = EMPTY_HYMN_OPTIONS,
  layout = "cards",
  onChange,
  teamMembers = EMPTY_TEAM_MEMBERS,
  teams = EMPTY_TEAMS,
  value,
}: EditorProps) => {
  const isTimeline = layout === "timeline";
  // Hymns added from the picker are merged over the loaded options so they
  // can be selected right away, without reloading the route.
  const [createdHymnOptions, setCreatedHymnOptions] = React.useState<
    HymnOption[]
  >([]);
  const effectiveHymnOptions = React.useMemo(
    () => mergeHymnOptions(hymnOptions, createdHymnOptions),
    [createdHymnOptions, hymnOptions]
  );
  const handleHymnCreated = React.useCallback((hymn: HymnOption) => {
    setCreatedHymnOptions((current) => [
      ...current.filter((item) => item.id !== hymn.id),
      hymn,
    ]);
  }, []);

  const renderSegment = (segment: ServiceTypeCard, index: number) => {
    const sharedProps: SegmentEditorProps = {
      activityTypes,
      allowHymnCreation: allowHymnCreation && allowHymnSelection,
      allowHymnSelection,
      allowTeamAssignment,
      allowTeamDefinition,
      hymnOptions: effectiveHymnOptions,
      onAddActivity: () =>
        onChange(
          updateSegment(value, segment.id, (currentSegment) => ({
            ...currentSegment,
            activities: [...currentSegment.activities, createActivity()],
          }))
        ),
      onHymnCreated: handleHymnCreated,
      onRemove: () =>
        onChange({
          ...value,
          service_type: value.service_type.filter(
            (item) => item.id !== segment.id
          ),
        }),
      onUpdateSegment: (updatedSegment) =>
        onChange(updateSegment(value, segment.id, () => updatedSegment)),
      segment,
      teamMembers,
      teams,
    };

    if (!isTimeline) {
      return <SegmentEditor key={segment.id} {...sharedProps} />;
    }

    return (
      <TimelineSegmentEditor
        index={index}
        isFirst={index === 0}
        isLast={index === value.service_type.length - 1}
        key={segment.id}
        onMove={(direction) => {
          const target = index + direction;

          if (target < 0 || target >= value.service_type.length) {
            return;
          }

          onChange({
            ...value,
            service_type: arrayMove(value.service_type, index, target),
          });
        }}
        {...sharedProps}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold">
            {isTimeline ? "Service timeline" : "Service cards"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isTimeline
              ? "Timeblocks run in order from first to last. Each block shows its activities and who is serving in it."
              : "Add cards for the main service segments, then add activities to each card."}
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
          {isTimeline ? "Add timeblock" : "Add card"}
        </Button>
      </div>

      <div
        className={cn("flex flex-col", isTimeline ? "gap-6 sm:gap-0" : "gap-4")}
      >
        {value.service_type.map((segment, index) =>
          renderSegment(segment, index)
        )}
      </div>
    </div>
  );
};
