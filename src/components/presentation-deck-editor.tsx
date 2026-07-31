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
  DotsSixVerticalIcon,
  FloppyDiskIcon,
  LockSimpleIcon,
  MegaphoneIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, Row } from "@tanstack/react-table";
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
import { savePresentationDeckOrder } from "~/lib/announcement-data";
import type { PresentationDeckEditorSlide } from "~/lib/announcement-types";
import {
  SILENCE_PHONE_PLACEHOLDER_URL,
  SILENCE_PHONE_SLIDE_ID,
} from "~/lib/announcement-types";
import { presentationAssetUrl } from "~/lib/r2-asset-url";
import { cn } from "~/lib/utils";

const formatWhen = (value: string | null) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const slidesEqual = (
  a: PresentationDeckEditorSlide[],
  b: PresentationDeckEditorSlide[]
): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((slide, index) => slide.id === b[index]?.id);
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
      aria-label="Drag to reorder slide"
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

const createDeckColumns = (): ColumnDef<PresentationDeckEditorSlide>[] => [
  {
    cell: () => <DragHandleCell />,
    header: () => <span className="sr-only">Reorder</span>,
    id: "drag",
    size: 40,
  },
  {
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {row.index + 1}
      </span>
    ),
    header: "#",
    id: "position",
    size: 48,
  },
  {
    cell: ({ row }) => (
      <div className="size-14 overflow-hidden rounded-md border bg-muted">
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={56}
          src={presentationAssetUrl(row.original.id)}
          width={56}
        />
      </div>
    ),
    header: () => <span className="sr-only">Preview</span>,
    id: "preview",
    size: 72,
  },
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ announcementId: row.original.id }}
        to="/announcements/$announcementId"
      >
        {row.original.name}
      </Link>
    ),
    header: "Presentation",
  },
  {
    accessorKey: "approvedAt",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {formatWhen(row.original.approvedAt)}
      </span>
    ),
    header: "Approved",
  },
];

interface SortableDeckRowProps {
  row: Row<PresentationDeckEditorSlide>;
}

const SortableDeckRow = ({ row }: SortableDeckRowProps) => {
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
        className={cn(isDragging && "relative z-10 bg-muted")}
        data-dragging={isDragging}
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

const SilencePhoneFooterRow = ({ position }: { position: number }) => (
  <TableRow className="bg-muted/40" data-slide={SILENCE_PHONE_SLIDE_ID}>
    <TableCell>
      <span
        aria-label="Fixed position — always last"
        className="flex items-center text-muted-foreground"
        title="Always last"
      >
        <LockSimpleIcon aria-hidden="true" className="size-4" />
      </span>
    </TableCell>
    <TableCell>
      <span className="tabular-nums text-muted-foreground">{position}</span>
    </TableCell>
    <TableCell>
      <div className="size-14 overflow-hidden rounded-md border bg-muted">
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={56}
          src={SILENCE_PHONE_PLACEHOLDER_URL}
          width={56}
        />
      </div>
    </TableCell>
    <TableCell>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Please silence your phone</span>
        <Badge variant="secondary">Always last</Badge>
        <Badge variant="outline">System slide</Badge>
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        Placeholder image (Unsplash). Will move to R2 later.
      </p>
    </TableCell>
    <TableCell>
      <span className="text-muted-foreground text-sm">—</span>
    </TableCell>
  </TableRow>
);

interface PresentationDeckEditorProps {
  initialSlides: PresentationDeckEditorSlide[];
  onSaved?: (slides: PresentationDeckEditorSlide[]) => void;
}

/**
 * Drag-to-place deck order editor. Local reordering only until explicit Save.
 * The silence-phone system slide is always shown last and is not reorderable.
 */
export const PresentationDeckEditor = ({
  initialSlides,
  onSaved,
}: PresentationDeckEditorProps) => {
  const saveOrderFn = useServerFn(savePresentationDeckOrder);
  const [slides, setSlides] = React.useState(initialSlides);
  const [savedSlides, setSavedSlides] = React.useState(initialSlides);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setSlides(initialSlides);
    setSavedSlides(initialSlides);
  }, [initialSlides]);

  const isDirty = !slidesEqual(slides, savedSlides);

  const columns = React.useMemo(() => createDeckColumns(), []);

  const table = useReactTable({
    columns,
    data: slides,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const slideIds = React.useMemo(
    () => slides.map((slide) => slide.id),
    [slides]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setSlides((current) => {
      const oldIndex = current.findIndex((slide) => slide.id === active.id);
      const newIndex = current.findIndex((slide) => slide.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return current;
      }

      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const result = await saveOrderFn({
        data: { orderedIds: slides.map((slide) => slide.id) },
      });

      // Reconcile local order with what the server accepted (drops unknown ids,
      // may append deck members that appeared while editing).
      const byId = new Map(slides.map((slide) => [slide.id, slide]));
      const nextSlides = result.orderedIds.flatMap((id) => {
        const slide = byId.get(id);
        return slide ? [slide] : [];
      });

      setSlides(nextSlides);
      setSavedSlides(nextSlides);
      onSaved?.(nextSlides);
      toast.success("Presentation deck order saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save presentation deck order."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSlides(savedSlides);
  };

  const silencePosition = slides.length + 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Presentation deck
          </h1>
          <p className="text-muted-foreground">
            Order announcements for the public display. Drag rows to place them.
            Changes are not applied until you save. The silence-phone slide is
            always last.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline">
            <a href="/presentation" rel="noopener" target="_blank">
              <MegaphoneIcon data-icon="inline-start" />
              Open live deck
            </a>
          </Button>
          <Button
            disabled={!isDirty || isSaving}
            onClick={() => {
              handleReset();
            }}
            type="button"
            variant="outline"
          >
            Discard
          </Button>
          <Button
            disabled={!isDirty || isSaving}
            onClick={() => {
              void handleSave();
            }}
            type="button"
          >
            <FloppyDiskIcon data-icon="inline-start" />
            {isSaving ? "Saving…" : "Save order"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deck order</CardTitle>
          <CardDescription>
            Only approved announcements marked “Show in presentation deck”
            appear here.{" "}
            {isDirty ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Unsaved changes
              </span>
            ) : (
              <span>All changes saved</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {slides.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MegaphoneIcon />
                </EmptyMedia>
                <EmptyTitle>No presentations on the deck</EmptyTitle>
                <EmptyDescription>
                  Approve an announcement, export it, then enable “Show in
                  presentation deck” on its editor page. The silence-phone slide
                  still plays alone at the end of the live display.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild type="button">
                  <Link to="/announcements">Browse announcements</Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : null}

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
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() }}
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
                {slides.length > 0 ? (
                  <SortableContext
                    items={slideIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <SortableDeckRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : null}
                <SilencePhoneFooterRow position={silencePosition} />
              </TableBody>
            </Table>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
};
