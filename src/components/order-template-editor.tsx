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
  ArrowSquareOutIcon,
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
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

import { OrderTeamAssignment } from "~/components/order-team-assignment";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
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
  allowHymnSelection?: boolean;
  allowTeamAssignment?: boolean;
  allowTeamDefinition?: boolean;
  hymnOptions?: HymnOption[];
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
  onUpdate: (activity: OrderActivity) => void;
}

interface SegmentEditorProps {
  activityTypes: ReferenceOption[];
  allowHymnSelection: boolean;
  allowTeamAssignment: boolean;
  allowTeamDefinition: boolean;
  hymnOptions: HymnOption[];
  onAddActivity: () => void;
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

const ActivityForm = ({
  activity,
  activityTypes,
  allowHymnSelection,
  comboboxContainer,
  hymnOptions,
  onUpdate,
}: ActivityFormProps) => {
  const hymnOptionGroups = React.useMemo(
    () => groupHymnOptionsBySource(hymnOptions),
    [hymnOptions]
  );
  const selectedHymn = hymnOptionGroups
    .flatMap((group) => group.items)
    .find((hymn) => hymn.value === activity.hymnId);
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
            <ComboboxContent container={comboboxContainer}>
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
  );
};

interface ActivityManageDialogProps {
  activity: OrderActivity;
  activityTypes: ReferenceOption[];
  allowHymnSelection: boolean;
  hymnOptions: HymnOption[];
  onClose: () => void;
  onUpdate: (activity: OrderActivity) => void;
}

const ActivityManageDialog = ({
  activity,
  activityTypes,
  allowHymnSelection,
  hymnOptions,
  onClose,
  onUpdate,
}: ActivityManageDialogProps) => {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-2xl" ref={setContainer}>
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
          onUpdate={onUpdate}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        </DialogFooter>
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
  onManage: (activityId: string) => void;
  onRemove: (activityId: string) => void;
}

const createActivityColumns = ({
  activityTypeNames,
  allowHymnSelection,
  onManage,
  onRemove,
}: ActivityColumnsOptions): ColumnDef<OrderActivity>[] => [
  {
    cell: () => <DragHandleCell />,
    header: () => <span className="sr-only">Reorder</span>,
    id: "drag",
  },
  {
    accessorKey: "activityName",
    cell: ({ row }) => {
      const needsHymn = activityNeedsHymn(row.original, allowHymnSelection);

      return (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.activityName}</span>
          {needsHymn ? (
            <WarningCircleIcon
              aria-label="Needs a hymn"
              className="size-4 text-destructive"
            />
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
          <TableCell key={cell.id}>
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
  allowHymnSelection: boolean;
  hymnOptions: HymnOption[];
  onRemove: (activityId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onUpdate: (activity: OrderActivity) => void;
  segmentId: string;
}

const SegmentActivitiesTable = ({
  activities,
  activityTypes,
  allowHymnSelection,
  hymnOptions,
  onRemove,
  onReorder,
  onUpdate,
  segmentId,
}: SegmentActivitiesTableProps) => {
  const [manageActivityId, setManageActivityId] = React.useState<string | null>(
    null
  );

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

  const columns = React.useMemo(
    () =>
      createActivityColumns({
        activityTypeNames,
        allowHymnSelection,
        onManage: setManageActivityId,
        onRemove,
      }),
    [activityTypeNames, allowHymnSelection, onRemove]
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
          allowHymnSelection={allowHymnSelection}
          hymnOptions={hymnOptions}
          key={`${segmentId}-${manageActivity.id}`}
          onClose={() => setManageActivityId(null)}
          onUpdate={onUpdate}
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
  allowHymnSelection,
  allowTeamAssignment,
  allowTeamDefinition,
  hymnOptions,
  onAddActivity,
  onRemove,
  onUpdateSegment,
  segment,
  teamMembers,
  teams,
}: SegmentEditorProps) => {
  const activitiesNeedAttention = segmentActivitiesNeedAttention(
    segment,
    allowHymnSelection
  );
  const showTeamAssignment =
    allowTeamAssignment &&
    ((segment.requiredTeamIds?.length ?? 0) > 0 ||
      (segment.optionalTeamIds?.length ?? 0) > 0 ||
      (segment.teamAssignments?.length ?? 0) > 0);
  const teamsNeedAttention = showTeamAssignment
    ? segmentTeamsNeedAttention(segment)
    : false;

  return (
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
        <Separator />
        <Accordion defaultValue="activities" type="single">
          <AccordionItem value="activities">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-base">
                Order of Service Activities
                {activitiesNeedAttention ? (
                  <WarningCircleIcon
                    aria-label="Some activities need attention"
                    className="size-4 text-destructive"
                  />
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <CardDescription>
                  Drag rows to reorder activities, or click a row to edit it.
                </CardDescription>
                <Button
                  onClick={onAddActivity}
                  type="button"
                  variant="secondary"
                >
                  <PlusIcon data-icon="inline-start" />
                  Add activity
                </Button>
              </div>
              <SegmentActivitiesTable
                activities={segment.activities}
                activityTypes={activityTypes}
                allowHymnSelection={allowHymnSelection}
                hymnOptions={hymnOptions}
                onRemove={(activityId) =>
                  onUpdateSegment({
                    ...segment,
                    activities: segment.activities.filter(
                      (item) => item.id !== activityId
                    ),
                  })
                }
                onReorder={(activeId, overId) => {
                  const oldIndex = segment.activities.findIndex(
                    (item) => item.id === activeId
                  );
                  const newIndex = segment.activities.findIndex(
                    (item) => item.id === overId
                  );

                  if (oldIndex === -1 || newIndex === -1) {
                    return;
                  }

                  onUpdateSegment({
                    ...segment,
                    activities: arrayMove(
                      segment.activities,
                      oldIndex,
                      newIndex
                    ),
                  });
                }}
                onUpdate={(updatedActivity) =>
                  onUpdateSegment({
                    ...segment,
                    activities: segment.activities.map((item) =>
                      item.id === updatedActivity.id ? updatedActivity : item
                    ),
                  })
                }
                segmentId={segment.id}
              />
            </AccordionContent>
          </AccordionItem>
          {showTeamAssignment ? (
            <AccordionItem value="team-assignments">
              <AccordionTrigger>
                <span className="flex items-center gap-2 text-base">
                  Team assignments
                  {teamsNeedAttention ? (
                    <WarningCircleIcon
                      aria-label="Required teams need members"
                      className="size-4 text-destructive"
                    />
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <OrderTeamAssignment
                  headingHidden
                  onUpdateSegment={onUpdateSegment}
                  segment={segment}
                  teamMembers={teamMembers}
                  teams={teams}
                />
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
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
}: EditorProps) => (
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
        hymnOptions={hymnOptions}
        key={segment.id}
        onAddActivity={() =>
          onChange(
            updateSegment(value, segment.id, (currentSegment) => ({
              ...currentSegment,
              activities: [...currentSegment.activities, createActivity()],
            }))
          )
        }
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
        teamMembers={teamMembers}
        teams={teams}
      />
    ))}
  </div>
);
