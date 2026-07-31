import {
  BooksIcon,
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FloppyDiskIcon,
  ImageIcon,
  ImagesIcon,
  MagicWandIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { useHotkey } from "@tanstack/react-hotkeys";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { toJpeg } from "html-to-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { GrapesjsAnnouncementEditor } from "~/components/grapesjs-announcement-editor";
import type { GrapesjsAnnouncementEditorHandle } from "~/components/grapesjs-announcement-editor";
import { HtmlCodeEditor } from "~/components/html-code-editor";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
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
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
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
  HTML_HISTORY_MAX_SNAPSHOTS,
  useHtmlHistory,
} from "~/hooks/use-html-history";
import {
  addLibraryImageAsVariation,
  approveAnnouncement,
  clearVariationContext,
  exportAnnouncement,
  generateAnnouncementLayout,
  generateBackgrounds,
  getAnnouncement,
  getAnnouncementAsset,
  removeAllVariations,
  removeVariation,
  saveAnnouncement,
  selectVariation,
  setShowInPresentationDeck,
} from "~/lib/announcement-data";
import { parseCanvasPlan } from "~/lib/announcement-ai-plan";
import {
  isUsableProjectData,
  prepareOverlayHtmlForRender,
  projectDataKey,
  sanitizeProjectData,
} from "~/lib/announcement-overlay-html";
import {
  buildDesignPresetProject,
  getStylePack,
  listStylePacks,
} from "~/lib/announcement-style-library";
import type {
  AnnouncementCanvasSnapshot,
  AnnouncementContent,
  AnnouncementDraft,
  AnnouncementGenerationJob,
  AnnouncementLayoutJob,
  AnnouncementVariation,
  GrapesProjectData,
} from "~/lib/announcement-types";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_IMAGE_MODEL,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import { getLibraryImage, listLibraryImages } from "~/lib/image-library-data";
import type { ImageLibraryItem } from "~/lib/image-library-types";
import { requirePermission } from "~/lib/route-guards";
import { cn } from "~/lib/utils";

interface StylePackOption {
  description: string;
  label: string;
  value: string;
}

const STYLE_PACK_OPTIONS: StylePackOption[] = listStylePacks().map((pack) => ({
  description: pack.description,
  label: pack.name,
  value: pack.id,
}));

const toDataUrl = (base64: string, contentType: string) =>
  `data:${contentType};base64,${base64}`;

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

/** Pretty-print GrapesJS project JSON for the advanced editor. */
const formatProjectJson = (data: GrapesProjectData | null): string => {
  if (!data) {
    return "null";
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "{}";
  }
};

/**
 * Resolve the canvas project for an announcement draft:
 * stored projectData → else legacy HTML migrate (null) → else default preset JSON.
 */
const resolveCanvasProject = (
  draft: Pick<
    AnnouncementDraft,
    "appliedStyleId" | "content" | "legacyHtml" | "projectData"
  >
): GrapesProjectData | null => {
  if (draft.projectData) {
    return draft.projectData;
  }

  if (draft.legacyHtml?.trim()) {
    return null;
  }

  return buildDesignPresetProject(
    draft.appliedStyleId ?? "classic-bottom",
    draft.content
  );
};

const renderSortIcon = (sortDirection: false | "asc" | "desc") => {
  if (sortDirection === "asc") {
    return <CaretUpIcon data-icon="inline-end" />;
  }

  if (sortDirection === "desc") {
    return <CaretDownIcon data-icon="inline-end" />;
  }

  return <CaretUpDownIcon data-icon="inline-end" />;
};

const AnnouncementStage = ({
  backgroundUrl,
  html,
}: {
  backgroundUrl: string | null;
  html: string;
}) => {
  // Flatten GrapesJS device @media rules + repair body wrappers so export
  // matches the canvas even when the host viewport is wider than 1920px.
  const renderHtml = prepareOverlayHtmlForRender(html);

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ height: ANNOUNCEMENT_HEIGHT, width: ANNOUNCEMENT_WIDTH }}
    >
      {backgroundUrl ? (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          crossOrigin="anonymous"
          src={backgroundUrl}
        />
      ) : (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-2xl">
          Select or generate a background
        </div>
      )}
      <div
        className="absolute inset-0 size-full [&_.announcement-overlay]:size-full"
        // User/AI-authored overlay markup for the composite canvas.
        dangerouslySetInnerHTML={{ __html: renderHtml }}
      />
    </div>
  );
};

interface VariationColumnsOptions {
  assetUrls: Record<string, string>;
  onRemove: (variationId: string) => void;
  removingId: string | null;
  selectedVariationId: string | null;
  selectingId: string | null;
}

const createVariationColumns = ({
  assetUrls,
  onRemove,
  removingId,
  selectedVariationId,
  selectingId,
}: VariationColumnsOptions): ColumnDef<AnnouncementVariation>[] => [
  {
    cell: ({ row }) => {
      const url = assetUrls[row.original.objectKey];
      const isSelected = row.original.id === selectedVariationId;
      const isBusy =
        selectingId === row.original.id || removingId === row.original.id;
      const isLibrary = row.original.source === "library";

      return (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "bg-muted relative size-14 shrink-0 overflow-hidden rounded-md border",
              isSelected && "ring-primary ring-2",
              isLibrary && "ring-sky-500/70 ring-1"
            )}
          >
            {url ? (
              <img alt="" className="size-full object-cover" src={url} />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-[10px]">
                …
              </div>
            )}
            {isLibrary ? (
              <div className="absolute inset-x-0 bottom-0 flex justify-center bg-sky-600/90 py-0.5">
                <BooksIcon className="size-3 text-white" weight="fill" />
              </div>
            ) : null}
            {isBusy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <CircleNotchIcon className="size-4 animate-spin text-white" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            {isSelected ? (
              <Badge variant="default">
                <SparkleIcon className="size-3" />
                Context
              </Badge>
            ) : null}
            {isLibrary ? (
              <Badge
                className="bg-sky-600 text-white hover:bg-sky-600"
                variant="secondary"
              >
                <BooksIcon className="size-3" weight="fill" />
                Library
              </Badge>
            ) : null}
          </div>
        </div>
      );
    },
    enableSorting: false,
    header: "Preview",
    id: "thumbnail",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => formatCreatedAt(row.original.createdAt),
    header: "Created",
    sortingFn: (rowA, rowB) =>
      Date.parse(rowA.original.createdAt) - Date.parse(rowB.original.createdAt),
  },
  {
    cell: ({ row }) => {
      if (row.original.source === "library") {
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">Image library</span>
            <span
              className="text-muted-foreground truncate text-xs"
              title={row.original.libraryFilename ?? undefined}
            >
              {row.original.libraryFilename ?? "Template image"}
            </span>
          </div>
        );
      }

      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-xs">{ANNOUNCEMENT_IMAGE_MODEL}</span>
          {row.original.parentVariationId ? (
            <span className="text-muted-foreground text-xs">
              From selected context
            </span>
          ) : null}
        </div>
      );
    },
    enableSorting: false,
    header: "Source",
    id: "source",
  },
  {
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button
          disabled={removingId === row.original.id}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(row.original.id);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <TrashIcon data-icon="inline-start" />
          Remove
        </Button>
      </div>
    ),
    enableSorting: false,
    header: "",
    id: "actions",
  },
];

/**
 * App chrome above main content:
 * - top bar (h-14 = 3.5rem)
 * - main vertical padding (p-4 = 2rem total, md:p-6 = 3rem total)
 */
const VIEWPORT_CANVAS_SHELL =
  "flex h-[calc(100svh-3.5rem-2rem)] min-h-[22rem] flex-col gap-4 overflow-hidden md:h-[calc(100svh-3.5rem-3rem)]";

const LiveCanvasEditor = ({
  appliedStyleId,
  applyingPackId,
  backgroundUrl,
  editorRef,
  onApplyStylePack,
  onProjectChange,
  projectData,
  readOnly = false,
  seedHtml,
  seedRevision,
}: {
  appliedStyleId: string | null;
  applyingPackId: string | null;
  backgroundUrl: string | null;
  editorRef?: Ref<GrapesjsAnnouncementEditorHandle>;
  onApplyStylePack: (packId: string) => void;
  onProjectChange: (snapshot: AnnouncementCanvasSnapshot) => void;
  projectData: GrapesProjectData | null;
  readOnly?: boolean;
  seedHtml: string | null;
  seedRevision: number;
}) => {
  const selectedPackId = applyingPackId ?? appliedStyleId;
  const selectedPack =
    STYLE_PACK_OPTIONS.find((pack) => pack.value === selectedPackId) ?? null;
  const isApplying = applyingPackId !== null;
  const presetsDisabled = isApplying || readOnly;

  return (
    <Card
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0"
      size="sm"
    >
      <CardHeader className="shrink-0 border-b py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle className="text-base">Announcements editor</CardTitle>
            <CardDescription className="text-xs">
              {readOnly
                ? "Approved — unlock editing to change the canvas. Export still works."
                : `Blocks, styles, layers, and traits. Background photo swaps with the selected variation. Auto-saves · up to ${HTML_HISTORY_MAX_SNAPSHOTS} draft snapshots (Mod+Z / Mod+Y).`}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label
                className="text-muted-foreground shrink-0 text-xs"
                htmlFor="announcement-presets"
              >
                Presets
              </Label>
              <Combobox
                disabled={presetsDisabled}
                isItemEqualToValue={(item, value) => item.value === value.value}
                items={STYLE_PACK_OPTIONS}
                onValueChange={(pack) => {
                  if (pack) {
                    onApplyStylePack(pack.value);
                  }
                }}
                value={selectedPack}
              >
                <ComboboxInput
                  className="w-52"
                  disabled={presetsDisabled}
                  id="announcement-presets"
                  placeholder={isApplying ? "Applying…" : "Choose a preset"}
                />
                <ComboboxContent className="min-w-72">
                  <ComboboxEmpty>No presets found.</ComboboxEmpty>
                  <ComboboxList>
                    {(pack) => (
                      <ComboboxItem key={pack.value} value={pack}>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span>{pack.label}</span>
                          <span className="text-muted-foreground text-xs font-normal">
                            {pack.description}
                          </span>
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <Badge className="w-fit shrink-0" variant="secondary">
              1920×1080
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0 sm:p-0">
        <GrapesjsAnnouncementEditor
          ref={editorRef}
          backgroundUrl={backgroundUrl}
          className="min-h-0 flex-1"
          onProjectChange={onProjectChange}
          projectData={projectData}
          readOnly={readOnly}
          seedHtml={seedHtml}
          seedRevision={seedRevision}
        />
      </CardContent>
    </Card>
  );
};

const VariationLibraryCard = ({
  assetUrls,
  editDisabled = false,
  isClearingContext,
  isRemovingAll,
  onClearContext,
  onRemoveAll,
  onRemoveVariation,
  onSelectVariation,
  removingId,
  selectedVariationId,
  selectingId,
  variations,
}: {
  assetUrls: Record<string, string>;
  editDisabled?: boolean;
  isClearingContext: boolean;
  isRemovingAll: boolean;
  onClearContext: () => void;
  onRemoveAll: () => void;
  onRemoveVariation: (variationId: string) => void;
  onSelectVariation: (variationId: string) => void;
  removingId: string | null;
  selectedVariationId: string | null;
  selectingId: string | null;
  variations: AnnouncementVariation[];
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "createdAt" },
  ]);

  const columns = createVariationColumns({
    assetUrls,
    onRemove: onRemoveVariation,
    removingId,
    selectedVariationId,
    selectingId,
  });

  const table = useReactTable({
    columns,
    data: variations,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Variation library</CardTitle>
          <CardDescription>
            Select a variation to mark it as the happy path. That selection
            becomes context for the next AI background batch — including library
            template images. Right-click a row to remove it.
          </CardDescription>
        </div>
        {variations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                editDisabled || isClearingContext || !selectedVariationId
              }
              onClick={onClearContext}
              size="sm"
              type="button"
              variant="outline"
            >
              {isClearingContext ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <XCircleIcon data-icon="inline-start" />
              )}
              Clear Context
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={editDisabled || isRemovingAll}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isRemovingAll ? (
                    <CircleNotchIcon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <TrashIcon data-icon="inline-start" />
                  )}
                  Remove All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove all variations?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every background in the library and
                    clears the active context. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isRemovingAll}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isRemovingAll}
                    onClick={onRemoveAll}
                    variant="destructive"
                  >
                    Remove All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {variations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No backgrounds yet. Generate AI variations from a prompt, or add a
            template image from the image library.
          </p>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    if (header.isPlaceholder) {
                      return <TableHead key={header.id} />;
                    }

                    if (header.column.getCanSort()) {
                      return (
                        <TableHead key={header.id}>
                          <Button
                            className="-ml-2 h-8"
                            onClick={header.column.getToggleSortingHandler()}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {renderSortIcon(header.column.getIsSorted())}
                          </Button>
                        </TableHead>
                      );
                    }

                    return (
                      <TableHead key={header.id}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = row.original.id === selectedVariationId;
                const isBusy =
                  selectingId === row.original.id ||
                  removingId === row.original.id;

                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className={cn(
                          !editDisabled && "cursor-pointer",
                          isSelected && "bg-muted/60"
                        )}
                        data-state={isSelected ? "selected" : undefined}
                        onClick={() => {
                          if (!isBusy && !editDisabled) {
                            onSelectVariation(row.original.id);
                          }
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        disabled={
                          editDisabled || removingId === row.original.id
                        }
                        onClick={() => onRemoveVariation(row.original.id)}
                        variant="destructive"
                      >
                        <TrashIcon />
                        Remove
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

const LibraryImagePickerDialog = ({
  isAdding,
  onAdd,
  onOpenChange,
  open,
  usedLibraryImageIds,
}: {
  isAdding: boolean;
  onAdd: (image: ImageLibraryItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Library image ids already present as variations on this announcement. */
  usedLibraryImageIds: ReadonlySet<string>;
}) => {
  const listFn = useServerFn(listLibraryImages);
  const getImageFn = useServerFn(getLibraryImage);
  const [images, setImages] = useState<ImageLibraryItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAddingKey(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const items = await listFn();

        if (cancelled) {
          return;
        }

        setImages(items);

        const entries = await Promise.all(
          items.map(async (item) => {
            try {
              const asset = await getImageFn({ data: item.objectKey });
              return [
                item.objectKey,
                toDataUrl(asset.base64, asset.contentType),
              ] as const;
            } catch {
              return null;
            }
          })
        );

        if (cancelled) {
          return;
        }

        setPreviewUrls((previous) => {
          const next = { ...previous };

          for (const entry of entries) {
            if (!entry) {
              continue;
            }

            const [objectKey, dataUrl] = entry;
            next[objectKey] = dataUrl;
          }

          return next;
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load the image library."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [getImageFn, listFn, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Use library image as background</DialogTitle>
          <DialogDescription>
            Choose a 1920×1080 template from the image library. It is copied
            into this announcement&apos;s variation library so you can select it
            and generate AI variations from it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton
                className="aspect-video w-full rounded-lg"
                key={index}
              />
            ))}
          </div>
        ) : null}

        {!isLoading && loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : null}

        {!isLoading && !loadError && images.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No library images yet</EmptyTitle>
              <EmptyDescription>
                Upload 1920×1080 templates under Image Library, then return here
                to use them as announcement backgrounds.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild size="sm" variant="outline">
                <Link to="/library">Open image library</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}

        {!isLoading && !loadError && images.length > 0 ? (
          <div className="grid max-h-[min(28rem,60vh)] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {images.map((image) => {
              const previewUrl = previewUrls[image.objectKey];
              const isThisAdding = isAdding && addingKey === image.objectKey;
              const alreadyInAnnouncement = usedLibraryImageIds.has(image.id);
              const isDisabled = isAdding || alreadyInAnnouncement;

              return (
                <button
                  className={cn(
                    "group relative overflow-hidden rounded-lg border text-left transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    alreadyInAnnouncement
                      ? "cursor-not-allowed opacity-60"
                      : "hover:border-primary",
                    isThisAdding && "border-primary opacity-80"
                  )}
                  disabled={isDisabled}
                  key={image.id}
                  onClick={() => {
                    if (alreadyInAnnouncement) {
                      return;
                    }

                    setAddingKey(image.objectKey);
                    onAdd(image);
                  }}
                  title={
                    alreadyInAnnouncement
                      ? "Already added to this announcement"
                      : undefined
                  }
                  type="button"
                >
                  <div className="bg-muted aspect-video w-full overflow-hidden">
                    {previewUrl ? (
                      <img
                        alt={image.filename}
                        className={cn(
                          "size-full object-cover transition-transform duration-300",
                          !alreadyInAnnouncement && "group-hover:scale-[1.03]"
                        )}
                        src={previewUrl}
                      />
                    ) : (
                      <Skeleton className="size-full rounded-none" />
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2 p-2">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium"
                        title={image.filename}
                      >
                        {image.filename}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {alreadyInAnnouncement
                          ? "Already in this announcement"
                          : "Library template"}
                      </p>
                    </div>
                    {alreadyInAnnouncement ? (
                      <Badge className="shrink-0" variant="secondary">
                        <CheckCircleIcon className="size-3" weight="fill" />
                        Added
                      </Badge>
                    ) : (
                      <Badge
                        className="shrink-0 bg-sky-600 text-white hover:bg-sky-600"
                        variant="secondary"
                      >
                        <BooksIcon className="size-3" weight="fill" />
                        Library
                      </Badge>
                    )}
                  </div>
                  {isThisAdding ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                      <CircleNotchIcon className="size-6 animate-spin text-white" />
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={isAdding} type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const isActiveGenerationJob = (
  job: AnnouncementGenerationJob | null | undefined
): boolean => job?.status === "queued" || job?.status === "running";

const isActiveLayoutJob = (
  job: AnnouncementLayoutJob | null | undefined
): boolean => job?.status === "queued" || job?.status === "running";

const GENERATION_QUEUE_STEPS = [
  { id: "queued", label: "Queued" },
  { id: "running", label: "Generating" },
  { id: "completed", label: "Done" },
] as const;

const generationQueueStepIndex = (
  status: AnnouncementGenerationJob["status"] | null | undefined
): number => {
  if (status === "running" || status === "failed") {
    return 1;
  }

  if (status === "completed") {
    return 2;
  }

  return 0;
};

/** Connector line between numbered step nodes. */
const queueConnectorClass = (lit: boolean, failed: boolean): string => {
  if (!lit) {
    return "bg-border";
  }

  if (failed) {
    return "bg-destructive/50";
  }

  return "bg-primary";
};

/**
 * Numbered step node (complete / active / next).
 * Format matches a classic progress indicator: solid fill for complete,
 * ring for the in-progress step, muted fill for upcoming steps.
 * Fully finished jobs fill the final node solid as well.
 */
const queueStepNodeClass = (options: {
  failed: boolean;
  isComplete: boolean;
  isCurrent: boolean;
  isFinished: boolean;
}): string => {
  if (options.failed && options.isCurrent) {
    return "border-2 border-destructive bg-background text-destructive";
  }

  if (options.isComplete || (options.isCurrent && options.isFinished)) {
    return "border-transparent bg-primary text-primary-foreground";
  }

  if (options.isCurrent) {
    return "border-2 border-primary bg-background text-primary";
  }

  return "border-transparent bg-muted text-muted-foreground";
};

const queueLabelClass = (options: {
  failed: boolean;
  isComplete: boolean;
  isCurrent: boolean;
}): string => {
  if (options.failed && options.isCurrent) {
    return "font-medium text-destructive";
  }

  if (options.isComplete || options.isCurrent) {
    return "font-medium text-primary";
  }

  return "text-muted-foreground";
};

const generationQueueStatusText = (
  status: AnnouncementGenerationJob["status"]
): string | null => {
  if (status === "queued") {
    return "Waiting in the generation queue…";
  }

  if (status === "running") {
    return "Creating your background image…";
  }

  return null;
};

/**
 * Numbered step progress for async image-gen: Queued → Generating → Done.
 * Layout follows a standard multi-step indicator (numbered nodes + connectors
 * + labels), using theme colors rather than a fixed palette.
 */
const GenerationQueueProgress = ({
  generationJob,
}: {
  generationJob: AnnouncementGenerationJob;
}) => {
  const failed = generationJob.status === "failed";
  const isFinished = generationJob.status === "completed";
  const activeIndex = generationQueueStepIndex(generationJob.status);
  const statusText = generationQueueStatusText(generationJob.status);
  const ariaLabel = failed
    ? "Generation failed"
    : `Generation progress: ${GENERATION_QUEUE_STEPS[activeIndex]?.label ?? "Queued"}`;

  return (
    <output
      aria-label={ariaLabel}
      className="flex w-full max-w-md flex-col gap-2"
    >
      <ol className="flex w-full items-start">
        {GENERATION_QUEUE_STEPS.map((step, index) => {
          // Prior steps stay complete even when the active step fails.
          const isComplete = index < activeIndex;
          const isCurrent = index === activeIndex;
          const isLast = index === GENERATION_QUEUE_STEPS.length - 1;
          // Line after a step lights once that step is behind the cursor.
          const connectorLit = isComplete;

          return (
            <li
              className={cn(
                "flex items-start",
                isLast ? "shrink-0" : "min-w-0 flex-1"
              )}
              key={step.id}
            >
              <span className="flex shrink-0 flex-col items-center gap-1.5">
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                    queueStepNodeClass({
                      failed,
                      isComplete,
                      isCurrent,
                      isFinished,
                    }),
                    isCurrent &&
                      !failed &&
                      statusText !== null &&
                      "animate-pulse"
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "text-[0.65rem] leading-none tracking-wide uppercase",
                    queueLabelClass({
                      failed,
                      isComplete,
                      isCurrent,
                    })
                  )}
                >
                  {step.label}
                </span>
              </span>
              {isLast ? null : (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 mt-3.5 h-px min-w-4 flex-1",
                    queueConnectorClass(connectorLit, failed)
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      {statusText ? (
        <p className="text-muted-foreground text-sm">{statusText}</p>
      ) : null}
    </output>
  );
};

/** Poll draft while a background image-gen job is queued/running. */
const useGenerationJobPoll = (options: {
  announcementId: string;
  generationJob: AnnouncementGenerationJob | null;
  getAnnouncementFn: (args: {
    data: string;
  }) => Promise<AnnouncementDraft | null>;
  onDraft: (draft: AnnouncementDraft) => void;
  onInvalidate: () => Promise<unknown>;
}) => {
  const {
    announcementId,
    generationJob,
    getAnnouncementFn,
    onDraft,
    onInvalidate,
  } = options;

  const jobActive = isActiveGenerationJob(generationJob);
  const jobId = generationJob?.id ?? null;
  const jobStatus = generationJob?.status ?? null;

  useEffect(() => {
    if (!jobActive) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await getAnnouncementFn({ data: announcementId });

        if (cancelled || !next) {
          return;
        }

        onDraft(next);

        const job = next.generationJob;

        if (job?.status === "completed") {
          toast.success("Background image generated.");
          await onInvalidate();
          return;
        }

        if (job?.status === "failed") {
          toast.error(job.error || "Background generation failed.");
          await onInvalidate();
          return;
        }
      } catch {
        // Keep polling; transient errors are expected under load.
      }

      if (!cancelled) {
        timeoutId = setTimeout(() => {
          void poll();
        }, 2500);
      }
    };

    timeoutId = setTimeout(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    announcementId,
    getAnnouncementFn,
    jobActive,
    jobId,
    jobStatus,
    onDraft,
    onInvalidate,
  ]);
};

/**
 * Poll draft while a layout job is queued/running.
 * On completed, caller applies the plan via GrapesJS (onLayoutComplete).
 */
const useLayoutJobPoll = (options: {
  announcementId: string;
  getAnnouncementFn: (args: {
    data: string;
  }) => Promise<AnnouncementDraft | null>;
  layoutJob: AnnouncementLayoutJob | null;
  onDraft: (draft: AnnouncementDraft) => void;
  onLayoutComplete: (draft: AnnouncementDraft) => void | Promise<void>;
  onInvalidate: () => Promise<unknown>;
}) => {
  const {
    announcementId,
    getAnnouncementFn,
    layoutJob,
    onDraft,
    onLayoutComplete,
    onInvalidate,
  } = options;

  const jobActive = isActiveLayoutJob(layoutJob);
  const jobId = layoutJob?.id ?? null;
  const jobStatus = layoutJob?.status ?? null;
  const appliedJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobActive) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await getAnnouncementFn({ data: announcementId });

        if (cancelled || !next) {
          return;
        }

        onDraft(next);

        const job = next.layoutJob;

        if (job?.status === "completed" && job.plan) {
          if (appliedJobIdRef.current === job.id) {
            return;
          }

          appliedJobIdRef.current = job.id;
          await onLayoutComplete(next);
          await onInvalidate();
          return;
        }

        if (job?.status === "failed") {
          toast.error(job.error || "Layout generation failed.");
          await onInvalidate();
          return;
        }
      } catch {
        // Keep polling; transient errors are expected under load.
      }

      if (!cancelled) {
        timeoutId = setTimeout(() => {
          void poll();
        }, 2500);
      }
    };

    timeoutId = setTimeout(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    announcementId,
    getAnnouncementFn,
    jobActive,
    jobId,
    jobStatus,
    onDraft,
    onInvalidate,
    onLayoutComplete,
  ]);
};

const localEnqueueProgressJob = (options: {
  prompt: string;
  useSelectedAsContext: boolean;
}): AnnouncementGenerationJob => ({
  completedCount: 0,
  error: null,
  id: "local-enqueue",
  prompt: options.prompt,
  requestedCount: 1,
  startedAt: null,
  status: "queued",
  updatedAt: new Date().toISOString(),
  useSelectedAsContext: options.useSelectedAsContext,
});

const resolveProgressJob = (options: {
  backgroundPrompt: string;
  generationJob: AnnouncementGenerationJob | null;
  isGeneratingBg: boolean;
  useSelectedAsContext: boolean;
}): AnnouncementGenerationJob | null => {
  if (options.generationJob) {
    return options.generationJob;
  }

  if (options.isGeneratingBg) {
    return localEnqueueProgressJob({
      prompt: options.backgroundPrompt,
      useSelectedAsContext: options.useSelectedAsContext,
    });
  }

  return null;
};

const ActiveContextBanner = ({
  disabled,
  isClearingContext,
  onClearContext,
  selectedVariation,
}: {
  disabled: boolean;
  isClearingContext: boolean;
  onClearContext: () => void;
  selectedVariation: AnnouncementVariation;
}) => {
  const contextLabel =
    selectedVariation.source === "library" ? (
      <>
        library image{" "}
        <span className="font-medium text-foreground">
          {selectedVariation.libraryFilename ?? "template"}
        </span>
      </>
    ) : (
      <>
        variation{" "}
        <span className="font-mono text-xs">
          {selectedVariation.id.slice(0, 8)}
        </span>
      </>
    );

  return (
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 text-muted-foreground text-sm">
        Active context: {contextLabel}. Next generation will use it as
        reference.
      </p>
      <Button
        aria-label="Clear active context"
        className="size-7 shrink-0"
        disabled={disabled || isClearingContext}
        onClick={onClearContext}
        size="icon"
        title="Clear context"
        type="button"
        variant="ghost"
      >
        {isClearingContext ? (
          <CircleNotchIcon className="size-4 animate-spin" />
        ) : (
          <XIcon className="size-4" />
        )}
      </Button>
    </div>
  );
};

const BackgroundImageCard = ({
  backgroundPrompt,
  editDisabled = false,
  generationJob,
  isClearingContext,
  isGeneratingBg,
  onAddLibraryImage,
  onClearContext,
  onGenerateBackgrounds,
  selectedVariation,
  setBackgroundPrompt,
  usedLibraryImageIds,
}: {
  backgroundPrompt: string;
  editDisabled?: boolean;
  generationJob: AnnouncementGenerationJob | null;
  isClearingContext: boolean;
  isGeneratingBg: boolean;
  onAddLibraryImage: (image: ImageLibraryItem) => Promise<void>;
  onClearContext: () => void;
  onGenerateBackgrounds: () => void;
  selectedVariation: AnnouncementVariation | null;
  setBackgroundPrompt: (value: string) => void;
  usedLibraryImageIds: ReadonlySet<string>;
}) => {
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [isAddingLibraryImage, setIsAddingLibraryImage] = useState(false);
  const jobBusy =
    editDisabled || isGeneratingBg || isActiveGenerationJob(generationJob);
  const progressJob = resolveProgressJob({
    backgroundPrompt,
    generationJob,
    isGeneratingBg,
    useSelectedAsContext: Boolean(selectedVariation),
  });
  const showQueueProgress =
    progressJob !== null &&
    (isGeneratingBg ||
      isActiveGenerationJob(progressJob) ||
      progressJob.status === "failed");
  const generationError =
    generationJob?.status === "failed" ? generationJob.error : null;

  const handleAddLibraryImage = async (image: ImageLibraryItem) => {
    setIsAddingLibraryImage(true);

    try {
      await onAddLibraryImage(image);
      setLibraryPickerOpen(false);
    } finally {
      setIsAddingLibraryImage(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Background image</CardTitle>
          <CardDescription>
            Use a template from the image library, or generate an AI image
            without text. A selected variation becomes context for the next
            generation (happy path) — library images included.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isAddingLibraryImage || jobBusy}
              onClick={() => {
                setLibraryPickerOpen(true);
              }}
              type="button"
              variant="outline"
            >
              {isAddingLibraryImage ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <ImagesIcon data-icon="inline-start" />
              )}
              Use library image
            </Button>
            <Button asChild size="default" variant="ghost">
              <Link to="/library">Manage library</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bg-prompt">Background prompt</Label>
            <Textarea
              disabled={jobBusy || editDisabled}
              id="bg-prompt"
              onChange={(event) => setBackgroundPrompt(event.target.value)}
              rows={4}
              value={backgroundPrompt}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={jobBusy || !backgroundPrompt.trim()}
              onClick={onGenerateBackgrounds}
              type="button"
            >
              {jobBusy ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <ImageIcon data-icon="inline-start" />
              )}
              {selectedVariation
                ? "Generate from selected"
                : "Generate background"}
            </Button>
          </div>
          {showQueueProgress && progressJob ? (
            <GenerationQueueProgress generationJob={progressJob} />
          ) : null}
          {generationError ? (
            <p className="text-destructive text-sm">
              Generation failed: {generationError}
            </p>
          ) : null}
          {selectedVariation ? (
            <ActiveContextBanner
              disabled={jobBusy}
              isClearingContext={isClearingContext}
              onClearContext={onClearContext}
              selectedVariation={selectedVariation}
            />
          ) : null}
        </CardContent>
      </Card>

      <LibraryImagePickerDialog
        isAdding={isAddingLibraryImage}
        onAdd={(image) => {
          void handleAddLibraryImage(image);
        }}
        onOpenChange={setLibraryPickerOpen}
        open={libraryPickerOpen}
        usedLibraryImageIds={usedLibraryImageIds}
      />
    </>
  );
};

const PresentationDeckControls = ({
  announcementId,
  enabled,
  onUpdated,
  showInPresentationDeck,
}: {
  announcementId: string;
  enabled: boolean;
  onUpdated: (next: AnnouncementDraft) => void;
  showInPresentationDeck: boolean;
}) => {
  const router = useRouter();
  const setDeckFn = useServerFn(setShowInPresentationDeck);
  const [isTogglingDeck, setIsTogglingDeck] = useState(false);

  if (!enabled) {
    return null;
  }

  const onToggle = async (nextValue: boolean) => {
    setIsTogglingDeck(true);

    try {
      const next = await setDeckFn({
        data: { id: announcementId, showInPresentationDeck: nextValue },
      });
      onUpdated(next);
      await router.invalidate();
      toast.success(
        nextValue
          ? "Added to presentation deck."
          : "Removed from presentation deck."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update presentation deck setting."
      );
    } finally {
      setIsTogglingDeck(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {showInPresentationDeck ? (
        <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">
          In presentation deck
        </Badge>
      ) : null}
      <div className="flex items-center gap-3">
        <Switch
          checked={showInPresentationDeck}
          disabled={isTogglingDeck}
          id="show-in-presentation-deck"
          onCheckedChange={(checked) => {
            void onToggle(checked);
          }}
        />
        <Label
          className="cursor-pointer font-normal"
          htmlFor="show-in-presentation-deck"
        >
          Show in presentation deck
        </Label>
      </div>
    </div>
  );
};

// Large page component: canvas, jobs, export, and edit-gate state live here.
// oxlint-disable-next-line eslint/complexity -- announcement editor is intentionally one surface
const AnnouncementEditor = ({
  announcement: initial,
}: {
  announcement: AnnouncementDraft;
}) => {
  const router = useRouter();
  const saveFn = useServerFn(saveAnnouncement);
  const generateBgFn = useServerFn(generateBackgrounds);
  const addLibraryFn = useServerFn(addLibraryImageAsVariation);
  const selectFn = useServerFn(selectVariation);
  const clearContextFn = useServerFn(clearVariationContext);
  const removeVariationFn = useServerFn(removeVariation);
  const removeAllVariationsFn = useServerFn(removeAllVariations);
  const generateLayoutFn = useServerFn(generateAnnouncementLayout);
  const getAnnouncementFn = useServerFn(getAnnouncement);
  const getAssetFn = useServerFn(getAnnouncementAsset);
  const approveFn = useServerFn(approveAnnouncement);
  const exportFn = useServerFn(exportAnnouncement);

  const [draft, setDraft] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState<AnnouncementContent>(initial.content);
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    initial.backgroundPrompt
  );
  /** Approved announcements start locked; unlock requires explicit confirm. */
  const [editUnlocked, setEditUnlocked] = useState(
    () => initial.status !== "approved"
  );
  const initialCanvasProject = resolveCanvasProject(initial);

  const {
    canRedo,
    canUndo,
    commit: commitProjectHistory,
    projectData,
    redo: redoProjectHistory,
    reset: resetProjectHistory,
    setProjectData,
    undo: undoProjectHistory,
  } = useHtmlHistory(initialCanvasProject);
  /** Ephemeral HTML for JPG export + view-only advanced panel — never persisted. */
  const [exportHtml, setExportHtml] = useState("");
  /**
   * One-shot HTML seed for legacy R2 drafts only (migrate → project JSON).
   * New drafts and presets use project JSON directly.
   */
  const [seedHtml, setSeedHtml] = useState<string | null>(() =>
    initial.projectData ? null : (initial.legacyHtml?.trim() ?? null)
  );
  const [seedRevision, setSeedRevision] = useState(0);
  const [styleNotes, setStyleNotes] = useState("");
  const [markupOpen, setMarkupOpen] = useState(false);
  /** Local draft of project JSON while the advanced editor is open/dirty. */
  const [projectJsonDraft, setProjectJsonDraft] = useState(() =>
    formatProjectJson(initialCanvasProject)
  );
  const [projectJsonDirty, setProjectJsonDirty] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initial.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [applyingStylePackId, setApplyingStylePackId] = useState<string | null>(
    null
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [isClearingContext, setIsClearingContext] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemovingAll, setIsRemovingAll] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const grapesEditorRef = useRef<GrapesjsAnnouncementEditorHandle>(null);
  const projectDataRef = useRef(projectData);
  const nameRef = useRef(name);
  const contentRef = useRef(content);
  const backgroundPromptRef = useRef(backgroundPrompt);
  const draftIdRef = useRef(draft.id);
  const autoSaveInFlightRef = useRef(false);
  const autoSaveLatestRef = useRef<GrapesProjectData | null>(null);

  projectDataRef.current = projectData;
  nameRef.current = name;
  contentRef.current = content;
  backgroundPromptRef.current = backgroundPrompt;
  draftIdRef.current = draft.id;

  // Keep advanced JSON editor in sync with canvas unless the user is mid-edit.
  useEffect(() => {
    if (projectJsonDirty) {
      return;
    }

    setProjectJsonDraft(formatProjectJson(projectData));
  }, [projectData, projectJsonDirty]);

  const hasStoredExport = Boolean(exportPreview || draft.exportObjectKey);
  const presentationDeckEnabled =
    draft.status === "approved" && Boolean(draft.exportObjectKey);
  const isEditLocked = draft.status === "approved" && !editUnlocked;
  const canEdit = !isEditLocked;

  const selectedVariation = useMemo(
    () =>
      draft.variations.find(
        (variation) => variation.id === draft.selectedVariationId
      ) ?? null,
    [draft.selectedVariationId, draft.variations]
  );

  const usedLibraryImageIds = useMemo(() => {
    const ids = new Set<string>();

    for (const variation of draft.variations) {
      if (variation.source === "library" && variation.libraryImageId) {
        ids.add(variation.libraryImageId);
      }
    }

    return ids;
  }, [draft.variations]);

  const selectedBackgroundUrl = selectedVariation
    ? (assetUrls[selectedVariation.objectKey] ?? null)
    : null;

  const ensureAssetUrl = async (objectKey: string): Promise<string> => {
    const existing = assetUrls[objectKey];

    if (existing) {
      return existing;
    }

    const asset = await getAssetFn({ data: objectKey });
    const url = toDataUrl(asset.base64, asset.contentType);
    setAssetUrls((previous) =>
      previous[objectKey] ? previous : { ...previous, [objectKey]: url }
    );
    return url;
  };

  const lastHydratedIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    setName(initial.name);
    setNameDraft(initial.name);
    setIsEditingName(false);
    setContent(initial.content);
    setBackgroundPrompt(initial.backgroundPrompt);

    // Reset undo stack / seed only when opening a different announcement.
    if (lastHydratedIdRef.current !== initial.id) {
      lastHydratedIdRef.current = initial.id;
      setEditUnlocked(initial.status !== "approved");
      const nextProject = resolveCanvasProject(initial);

      resetProjectHistory(nextProject);
      setExportHtml("");
      setProjectJsonDraft(formatProjectJson(nextProject));
      setProjectJsonDirty(false);
      setSeedHtml(
        initial.projectData ? null : (initial.legacyHtml?.trim() ?? null)
      );
      setSeedRevision((revision) => revision + 1);
    } else if (initial.status === "draft") {
      // Server demoted after material save — allow editing without re-gate.
      setEditUnlocked(true);
    }
  }, [initial, resetProjectHistory]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const keys = new Set(draft.variations.map((item) => item.objectKey));

      if (draft.exportObjectKey) {
        keys.add(draft.exportObjectKey);
      }

      const results = await Promise.all(
        [...keys].map(async (key) => {
          try {
            const asset = await getAssetFn({ data: key });
            return {
              key,
              url: toDataUrl(asset.base64, asset.contentType),
            };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setAssetUrls((previous) => {
        const next = { ...previous };

        for (const result of results) {
          if (result && !next[result.key]) {
            next[result.key] = result.url;
          }
        }

        return next;
      });

      if (draft.exportObjectKey) {
        const exportResult = results.find(
          (result) => result?.key === draft.exportObjectKey
        );
        if (exportResult) {
          setExportPreview(exportResult.url);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [draft.exportObjectKey, draft.variations, getAssetFn]);

  const applyDraft = (
    next: AnnouncementDraft,
    options?: { resetProjectHistory?: boolean }
  ) => {
    setDraft(next);
    setName(next.name);
    setContent(next.content);
    setBackgroundPrompt(next.backgroundPrompt);

    // Material demotion unlocks editing; do not re-lock on every approved poll.
    if (next.status === "draft") {
      setEditUnlocked(true);
    }

    if (options?.resetProjectHistory) {
      resetProjectHistory(next.projectData);
    } else {
      setProjectData(next.projectData);
    }
  };

  /** Persist project JSON only (no HTML); coalesces concurrent saves. */
  const autoSaveProject = useCallback(
    (nextProject: GrapesProjectData) => {
      autoSaveLatestRef.current = nextProject;

      if (autoSaveInFlightRef.current) {
        return;
      }

      autoSaveInFlightRef.current = true;

      const flushLatest = async (): Promise<void> => {
        const toSave = autoSaveLatestRef.current;

        if (toSave === null) {
          autoSaveInFlightRef.current = false;
          return;
        }

        autoSaveLatestRef.current = null;

        try {
          const next = await saveFn({
            data: {
              backgroundPrompt: backgroundPromptRef.current,
              content: contentRef.current,
              id: draftIdRef.current,
              name: nameRef.current,
              projectData: toSave,
            },
          });
          setDraft(next);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not auto-save canvas changes."
          );
        }

        if (autoSaveLatestRef.current !== null) {
          await flushLatest();
          return;
        }

        autoSaveInFlightRef.current = false;
      };

      void flushLatest();
    },
    [saveFn]
  );

  const onCanvasProjectChange = useCallback(
    (snapshot: AnnouncementCanvasSnapshot) => {
      // Export HTML is in-memory only (JPG stage + view-only advanced panel).
      setExportHtml(snapshot.exportHtml);

      // Never autosave while an approved announcement is still locked.
      if (draft.status === "approved" && !editUnlocked) {
        return;
      }

      if (
        projectDataKey(snapshot.projectData) ===
        projectDataKey(projectDataRef.current)
      ) {
        return;
      }

      commitProjectHistory(snapshot.projectData);
      autoSaveProject(snapshot.projectData);
    },
    [autoSaveProject, commitProjectHistory, draft.status, editUnlocked]
  );

  /** Apply advanced JSON editor contents to the canvas and persist. */
  const onApplyProjectJson = useCallback(() => {
    if (!canEdit) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(projectJsonDraft) as unknown;
    } catch {
      toast.error("Project JSON is not valid JSON.");
      return;
    }

    if (!isUsableProjectData(parsed)) {
      toast.error(
        "Project JSON must be a GrapesJS project object (pages and/or styles)."
      );
      return;
    }

    const sanitized = sanitizeProjectData(parsed);

    if (!sanitized) {
      toast.error("Could not sanitize project JSON.");
      return;
    }

    setProjectJsonDirty(false);
    setProjectJsonDraft(formatProjectJson(sanitized));
    commitProjectHistory(sanitized);
    autoSaveProject(sanitized);
    toast.success("Project JSON applied to the canvas.");
  }, [autoSaveProject, canEdit, commitProjectHistory, projectJsonDraft]);

  const onUndoCanvas = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const restored = undoProjectHistory();

    if (restored === null) {
      return;
    }

    if (restored) {
      autoSaveProject(restored);
    }
  }, [autoSaveProject, canEdit, undoProjectHistory]);

  const onRedoCanvas = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const restored = redoProjectHistory();

    if (restored === null) {
      return;
    }

    if (restored) {
      autoSaveProject(restored);
    }
  }, [autoSaveProject, canEdit, redoProjectHistory]);

  useHotkey(
    "Mod+Z",
    () => {
      onUndoCanvas();
    },
    { enabled: canUndo && canEdit }
  );

  useHotkey(
    "Mod+Y",
    () => {
      onRedoCanvas();
    },
    { enabled: canRedo && canEdit }
  );

  // Common redo chord (in addition to Mod+Y).
  useHotkey(
    "Mod+Shift+Z",
    () => {
      onRedoCanvas();
    },
    { enabled: canRedo && canEdit }
  );

  const persist = async (overrides?: {
    contentOverride?: AnnouncementContent;
    nameOverride?: string;
    projectDataOverride?: GrapesProjectData | null;
    promptOverride?: string;
  }): Promise<AnnouncementDraft> => {
    setIsSaving(true);

    try {
      const projectToSave =
        overrides?.projectDataOverride === undefined
          ? projectData
          : overrides.projectDataOverride;

      const next = await saveFn({
        data: {
          backgroundPrompt: overrides?.promptOverride ?? backgroundPrompt,
          content: overrides?.contentOverride ?? content,
          id: draft.id,
          name: overrides?.nameOverride ?? name,
          projectData: projectToSave,
        },
      });
      applyDraft(next);
      return next;
    } finally {
      setIsSaving(false);
    }
  };

  const onSave = async () => {
    try {
      await persist();
      await router.invalidate();
      toast.success("Draft saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save draft."
      );
    }
  };

  const onGenerateBackgrounds = async () => {
    setIsGeneratingBg(true);

    try {
      await persist({ promptOverride: backgroundPrompt });
      const next = await generateBgFn({
        data: {
          id: draft.id,
          prompt: backgroundPrompt,
          useSelectedAsContext: Boolean(draft.selectedVariationId),
        },
      });
      applyDraft(next);
      await router.invalidate();
      toast.success(
        draft.selectedVariationId
          ? "Queued background generation from the selected context."
          : "Queued background generation."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Background generation failed."
      );
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const onPolledDraft = useCallback((next: AnnouncementDraft) => {
    setDraft(next);
    setBackgroundPrompt(next.backgroundPrompt);
  }, []);

  const invalidateRouter = useCallback(() => router.invalidate(), [router]);

  useGenerationJobPoll({
    announcementId: draft.id,
    generationJob: draft.generationJob,
    getAnnouncementFn,
    onDraft: onPolledDraft,
    onInvalidate: invalidateRouter,
  });

  const onLayoutComplete = useCallback(
    async (completedDraft: AnnouncementDraft) => {
      const rawPlan = completedDraft.layoutJob?.plan;

      if (!rawPlan) {
        toast.error("Layout job completed without a plan.");
        return;
      }

      let plan;
      try {
        plan = parseCanvasPlan(rawPlan);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Layout plan from AI was invalid."
        );
        return;
      }

      setDraft(completedDraft);

      const snapshot = grapesEditorRef.current?.applyAiPlan(
        plan,
        contentRef.current
      );

      if (!snapshot) {
        toast.error("Editor is not ready. Try again in a moment.");
        return;
      }

      setExportHtml(snapshot.exportHtml);
      commitProjectHistory(snapshot.projectData);

      try {
        const next = await saveFn({
          data: {
            backgroundPrompt: backgroundPromptRef.current,
            content: contentRef.current,
            id: draftIdRef.current,
            name: nameRef.current,
            projectData: snapshot.projectData,
            ...(plan.basePresetId ? { appliedStyleId: plan.basePresetId } : {}),
          },
        });
        setDraft(next);
        toast.success(
          "Overlay generated via GrapesJS API (text only — not baked into the image)."
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not save generated layout."
        );
      }
    },
    [commitProjectHistory, saveFn]
  );

  useLayoutJobPoll({
    announcementId: draft.id,
    getAnnouncementFn,
    layoutJob: draft.layoutJob,
    onDraft: onPolledDraft,
    onInvalidate: invalidateRouter,
    onLayoutComplete,
  });

  const onAddLibraryImage = async (image: ImageLibraryItem) => {
    const next = await addLibraryFn({
      data: {
        id: draft.id,
        libraryObjectKey: image.objectKey,
        select: true,
      },
    });
    applyDraft(next);
    await router.invalidate();
    toast.success(
      `"${image.filename}" added to the variation library and selected as context.`
    );
  };

  const onSelectVariation = async (variationId: string) => {
    if (variationId === draft.selectedVariationId) {
      return;
    }

    setSelectingId(variationId);

    try {
      const next = await selectFn({
        data: { id: draft.id, variationId },
      });
      applyDraft(next);
      await router.invalidate();
      toast.success("Selected variation is now the active context.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not select variation."
      );
    } finally {
      setSelectingId(null);
    }
  };

  const onClearContext = async () => {
    if (!draft.selectedVariationId) {
      return;
    }

    setIsClearingContext(true);

    try {
      const next = await clearContextFn({ data: { id: draft.id } });
      applyDraft(next);
      await router.invalidate();
      toast.success(
        "Context cleared. Next generation will not use a reference."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear context."
      );
    } finally {
      setIsClearingContext(false);
    }
  };

  const onRemoveVariation = async (variationId: string) => {
    setRemovingId(variationId);

    try {
      const next = await removeVariationFn({
        data: { id: draft.id, variationId },
      });
      applyDraft(next);
      await router.invalidate();
      toast.success("Variation removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove variation."
      );
    } finally {
      setRemovingId(null);
    }
  };

  const onRemoveAllVariations = async () => {
    if (draft.variations.length === 0) {
      return;
    }

    setIsRemovingAll(true);

    try {
      const next = await removeAllVariationsFn({ data: { id: draft.id } });
      applyDraft(next);
      await router.invalidate();
      toast.success("All variations removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove variations."
      );
    } finally {
      setIsRemovingAll(false);
    }
  };

  const onGenerateLayout = async () => {
    setIsGeneratingHtml(true);

    try {
      await persist({ contentOverride: content });
      const result = await generateLayoutFn({
        data: { id: draft.id, styleNotes },
      });
      applyDraft(result.draft);
      await router.invalidate();
      toast.success("Layout generation queued.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Layout generation failed."
      );
    } finally {
      setIsGeneratingHtml(false);
    }
  };

  const onApplyStylePack = async (packId: string) => {
    const pack = getStylePack(packId);

    if (!pack) {
      toast.error("Design preset not found.");
      return;
    }

    setApplyingStylePackId(packId);

    try {
      const result = grapesEditorRef.current?.applyStylePack(
        packId,
        contentRef.current
      );

      if (!result) {
        toast.error("Editor is not ready. Try again in a moment.");
        return;
      }

      // Update history + ephemeral export HTML; persist project JSON only.
      setExportHtml(result.exportHtml);
      commitProjectHistory(result.projectData);

      const next = await saveFn({
        data: {
          appliedStyleId: packId,
          backgroundPrompt: backgroundPromptRef.current,
          content: contentRef.current,
          id: draftIdRef.current,
          name: nameRef.current,
          projectData: result.projectData,
        },
      });
      setDraft(next);

      toast.success(
        `Loaded “${pack.name}” layout — refine on the canvas as needed.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not apply design preset."
      );
    } finally {
      setApplyingStylePackId(null);
    }
  };

  const captureExportJpeg = async (): Promise<string> => {
    if (!selectedVariation) {
      throw new Error("Select a background variation first.");
    }

    if (!exportRef.current) {
      throw new Error("Preview is not ready to export.");
    }

    await ensureAssetUrl(selectedVariation.objectKey);

    // Flush live canvas: project JSON for persistence, HTML only in memory.
    let snapshot: AnnouncementCanvasSnapshot | null = null;
    flushSync(() => {
      snapshot = grapesEditorRef.current?.flush() ?? null;
    });

    if (snapshot) {
      const flushed = snapshot as AnnouncementCanvasSnapshot;
      setExportHtml(flushed.exportHtml);

      if (canEdit) {
        await persist({ projectDataOverride: flushed.projectData });
      }
    } else if (canEdit) {
      await persist();
    }

    // Let the browser apply nested <style> rules before html-to-image clones.
    await Promise.resolve();
    await Promise.resolve();

    const surface = exportRef.current;

    if (!surface) {
      throw new Error("Export surface missing.");
    }

    return await toJpeg(surface, {
      backgroundColor: "#000000",
      cacheBust: true,
      height: ANNOUNCEMENT_HEIGHT,
      pixelRatio: 1,
      quality: 0.92,
      width: ANNOUNCEMENT_WIDTH,
    });
  };

  const onExport = async () => {
    if (!selectedVariation) {
      toast.error("Select a background variation first.");
      return;
    }

    setIsExporting(true);

    try {
      const dataUrl = await captureExportJpeg();
      const base64 = dataUrl.replace(/^data:image\/jpe?g;base64,/u, "");
      const next = await exportFn({
        data: { base64, id: draft.id },
      });
      applyDraft(next);
      setExportPreview(dataUrl);
      setExportDialogOpen(true);
      await router.invalidate();
      toast.success("JPG export stored in R2.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Export failed."
      );
    } finally {
      setIsExporting(false);
    }
  };

  const onApprove = async () => {
    if (!selectedVariation) {
      toast.error("Select a background variation first.");
      return;
    }

    setIsApproving(true);

    try {
      if (canEdit) {
        let snapshot: AnnouncementCanvasSnapshot | null = null;
        flushSync(() => {
          snapshot = grapesEditorRef.current?.flush() ?? null;
        });

        if (snapshot) {
          const flushed = snapshot as AnnouncementCanvasSnapshot;
          setExportHtml(flushed.exportHtml);
          await persist({ projectDataOverride: flushed.projectData });
        } else {
          await persist();
        }
      }

      const next = await approveFn({
        data: { id: draft.id },
      });
      applyDraft(next);
      setEditUnlocked(false);
      await router.invalidate();
      toast.success(
        next.exportObjectKey
          ? "Announcement approved."
          : "Announcement approved. Export a JPG to use it in the presentation deck."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Approval failed."
      );
    } finally {
      setIsApproving(false);
    }
  };

  const updateContentField = (
    field: keyof AnnouncementContent,
    value: string
  ) => {
    setContent((previous) => ({ ...previous, [field]: value }));
  };

  const onDownloadExport = () => {
    if (!exportPreview) {
      return;
    }

    const slug =
      name
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, "-")
        .replaceAll(/^-|-$/gu, "") || "announcement";
    const link = document.createElement("a");
    link.href = exportPreview;
    link.download = `${slug}.jpg`;
    link.click();
  };

  const skipNameCommitRef = useRef(false);

  const startEditName = () => {
    skipNameCommitRef.current = false;
    setNameDraft(name);
    setIsEditingName(true);
  };

  const commitEditName = () => {
    if (skipNameCommitRef.current) {
      skipNameCommitRef.current = false;
      return;
    }

    const next = nameDraft.trim();

    if (next.length > 0) {
      setName(next);
    }

    setIsEditingName(false);
  };

  const cancelEditName = () => {
    skipNameCommitRef.current = true;
    setNameDraft(name);
    setIsEditingName(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header + canvas share one viewport-tall shell so the stage fits on screen */}
      <div className={VIEWPORT_CANVAS_SHELL}>
        <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {isEditingName && canEdit ? (
                <Input
                  aria-label="Announcement name"
                  autoFocus
                  className="font-heading h-auto max-w-md py-1 text-2xl font-semibold tracking-tight sm:text-3xl"
                  onBlur={commitEditName}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEditName();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditName();
                    }
                  }}
                  value={nameDraft}
                />
              ) : (
                <>
                  <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                    {name || "Announcement"}
                  </h1>
                  {canEdit ? (
                    <Button
                      aria-label="Edit announcement name"
                      className="text-muted-foreground size-8 shrink-0"
                      onClick={startEditName}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <PencilSimpleIcon className="size-4" />
                    </Button>
                  ) : null}
                </>
              )}
              <Badge
                variant={draft.status === "approved" ? "default" : "secondary"}
              >
                {draft.status === "approved" ? "Approved" : "Draft"}
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm">
              Edit the overlay layout on the canvas. Swap backgrounds
              independently below; AI layout generation and draft tools follow.
              Approve and Export are separate — export a JPG for the presentation
              deck.
            </p>
            {isEditLocked ? (
              <div className="bg-muted/60 flex max-w-2xl flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm">
                  This announcement is approved. Unlock editing to change it;
                  saving material changes will return it to draft.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" type="button" variant="outline">
                      <PencilSimpleIcon data-icon="inline-start" />
                      Edit
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Edit approved announcement?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        You can view and export without unlocking. If you edit
                        and save changes (layout, content, or background), status
                        will return to draft and you will need to approve again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setEditUnlocked(true);
                        }}
                      >
                        Unlock editing
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
            <PresentationDeckControls
              announcementId={draft.id}
              enabled={presentationDeckEnabled}
              onUpdated={applyDraft}
              showInPresentationDeck={draft.showInPresentationDeck}
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={isSaving || !canEdit}
              onClick={() => void onSave()}
              type="button"
              variant="outline"
            >
              {isSaving ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <FloppyDiskIcon data-icon="inline-start" />
              )}
              Save draft
            </Button>
            {hasStoredExport ? (
              <Button
                onClick={() => setExportDialogOpen(true)}
                type="button"
                variant="outline"
              >
                <EyeIcon data-icon="inline-start" />
                View export
              </Button>
            ) : null}
            <Button
              disabled={isExporting || !selectedVariation}
              onClick={() => void onExport()}
              type="button"
              variant="outline"
            >
              {isExporting ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <DownloadSimpleIcon data-icon="inline-start" />
              )}
              Export JPG
            </Button>
            <Button
              disabled={
                isApproving ||
                !selectedVariation ||
                draft.status === "approved"
              }
              onClick={() => void onApprove()}
              type="button"
            >
              {isApproving ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <CheckCircleIcon data-icon="inline-start" />
              )}
              Approve
            </Button>
          </div>
        </div>

        <LiveCanvasEditor
          appliedStyleId={draft.appliedStyleId}
          applyingPackId={applyingStylePackId}
          backgroundUrl={selectedBackgroundUrl}
          editorRef={grapesEditorRef}
          onApplyStylePack={(packId) => {
            void onApplyStylePack(packId);
          }}
          onProjectChange={onCanvasProjectChange}
          projectData={projectData}
          readOnly={isEditLocked}
          seedHtml={seedHtml}
          seedRevision={seedRevision}
        />
      </div>

      {/* Secondary: supporting tools (scroll below the fold) */}
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Content fields</CardTitle>
              <CardDescription>
                Feed AI HTML generation and design presets. Values are not baked
                into the background image — edit layout on the canvas above.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="content-title">Title</Label>
                <Input
                  disabled={!canEdit}
                  id="content-title"
                  onChange={(event) =>
                    updateContentField("title", event.target.value)
                  }
                  value={content.title}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="content-subtitle">Subtitle</Label>
                <Input
                  disabled={!canEdit}
                  id="content-subtitle"
                  onChange={(event) =>
                    updateContentField("subtitle", event.target.value)
                  }
                  value={content.subtitle}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="content-heading">Heading</Label>
                <Input
                  disabled={!canEdit}
                  id="content-heading"
                  onChange={(event) =>
                    updateContentField("heading", event.target.value)
                  }
                  value={content.heading}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="content-tertiary">Tertiary information</Label>
                <Input
                  disabled={!canEdit}
                  id="content-tertiary"
                  onChange={(event) =>
                    updateContentField("tertiary", event.target.value)
                  }
                  value={content.tertiary}
                />
              </div>
            </CardContent>
          </Card>

          <BackgroundImageCard
            backgroundPrompt={backgroundPrompt}
            editDisabled={!canEdit}
            generationJob={draft.generationJob}
            isClearingContext={isClearingContext}
            isGeneratingBg={isGeneratingBg}
            onAddLibraryImage={async (image) => {
              try {
                await onAddLibraryImage(image);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not add library image as a background."
                );
                throw error;
              }
            }}
            onClearContext={() => {
              void onClearContext();
            }}
            onGenerateBackgrounds={() => {
              void onGenerateBackgrounds();
            }}
            selectedVariation={selectedVariation}
            setBackgroundPrompt={setBackgroundPrompt}
            usedLibraryImageIds={usedLibraryImageIds}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate overlay with AI</CardTitle>
            <CardDescription>
              Queues a layout plan on the image-gen worker, then applies it
              through the GrapesJS editor API (presets, blocks, styles — not raw
              HTML). Optional style notes steer composition and accents.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor="style-notes">Style notes (optional)</Label>
                <Input
                  disabled={!canEdit || isGeneratingHtml}
                  id="style-notes"
                  onChange={(event) => setStyleNotes(event.target.value)}
                  placeholder="Modern sans-serif, left-aligned, gold accent…"
                  value={styleNotes}
                />
              </div>
              <Button
                disabled={
                  !canEdit ||
                  isGeneratingHtml ||
                  isActiveLayoutJob(draft.layoutJob)
                }
                onClick={() => void onGenerateLayout()}
                type="button"
              >
                {isGeneratingHtml || isActiveLayoutJob(draft.layoutJob) ? (
                  <CircleNotchIcon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <MagicWandIcon data-icon="inline-start" />
                )}
                {isActiveLayoutJob(draft.layoutJob)
                  ? "Generating layout…"
                  : "Generate with AI"}
              </Button>
            </div>
            {draft.layoutJob?.status === "failed" && draft.layoutJob.error ? (
              <p className="text-destructive text-sm">
                Layout failed: {draft.layoutJob.error}
              </p>
            ) : null}
            {isActiveLayoutJob(draft.layoutJob) ? (
              <p className="text-muted-foreground text-sm">
                Layout job {draft.layoutJob?.status}… polling for the plan.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <VariationLibraryCard
          assetUrls={assetUrls}
          editDisabled={!canEdit}
          isClearingContext={isClearingContext}
          isRemovingAll={isRemovingAll}
          onClearContext={() => {
            void onClearContext();
          }}
          onRemoveAll={() => {
            void onRemoveAllVariations();
          }}
          onRemoveVariation={(variationId) => {
            void onRemoveVariation(variationId);
          }}
          onSelectVariation={(variationId) => {
            void onSelectVariation(variationId);
          }}
          removingId={removingId}
          selectedVariationId={draft.selectedVariationId}
          selectingId={selectingId}
          variations={draft.variations}
        />

        <Accordion
          collapsible
          onValueChange={(value) => {
            const open = value === "project-json";
            setMarkupOpen(open);

            if (open) {
              setProjectJsonDraft(formatProjectJson(projectDataRef.current));
              setProjectJsonDirty(false);
            }
          }}
          type="single"
          value={markupOpen ? "project-json" : ""}
        >
          <AccordionItem value="project-json">
            <AccordionTrigger>
              <span className="flex flex-col items-start gap-1">
                <span className="text-base">Project JSON (advanced)</span>
                <span className="text-muted-foreground text-sm font-normal">
                  GrapesJS project data is the source of truth. Export HTML
                  below is view-only (used for JPG capture).
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="h-auto">
              {/* Mount only when open so CodeMirror lays out at full height. */}
              {markupOpen ? (
                <div className="flex min-h-72 flex-col gap-4 pt-1">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="project-json">Project JSON</Label>
                      <Button
                        disabled={!canEdit || !projectJsonDirty}
                        onClick={onApplyProjectJson}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Apply to canvas
                      </Button>
                    </div>
                    {canEdit ? null : (
                      <p className="text-muted-foreground text-xs">
                        Unlock editing to change project JSON on an approved
                        announcement.
                      </p>
                    )}
                    <HtmlCodeEditor
                      id="project-json"
                      language="json"
                      minHeight="18rem"
                      onChange={(nextJson) => {
                        if (!canEdit) {
                          return;
                        }

                        setProjectJsonDraft(nextJson);
                        setProjectJsonDirty(true);
                      }}
                      readOnly={!canEdit}
                      value={projectJsonDraft}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="export-html-preview">
                      Export HTML (view only)
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Derived from the live canvas for JPG export. Not editable
                      and not stored on the draft.
                    </p>
                    <HtmlCodeEditor
                      id="export-html-preview"
                      language="html"
                      minHeight="12rem"
                      readOnly
                      value={
                        exportHtml ||
                        "<!-- Export HTML appears after the canvas loads -->"
                      }
                    />
                  </div>
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <Dialog onOpenChange={setExportDialogOpen} open={exportDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Export JPG</DialogTitle>
            <DialogDescription>
              Stored JPG in R2
              {draft.exportObjectKey ? (
                <>
                  {" "}
                  at <code className="text-xs">{draft.exportObjectKey}</code>
                </>
              ) : null}
              . Export does not change approval status.
            </DialogDescription>
          </DialogHeader>
          {exportPreview ? (
            <div className="overflow-hidden rounded-lg border">
              <img
                alt="Announcement export"
                className="h-auto w-full"
                src={exportPreview}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Export preview is still loading…
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
            <Button
              disabled={!exportPreview}
              onClick={onDownloadExport}
              type="button"
            >
              <DownloadSimpleIcon data-icon="inline-start" />
              Download JPG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-screen full-resolution surface for html-to-image export.
          Keep the node fully painted (no opacity:0 / visibility:hidden) so
          getComputedStyle and stylesheet rules apply during capture. */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-[-10000px]"
      >
        <div ref={exportRef}>
          <AnnouncementStage
            backgroundUrl={selectedBackgroundUrl}
            html={exportHtml}
          />
        </div>
      </div>
    </div>
  );
};

const AnnouncementEditorRoute = () => {
  const announcement = Route.useLoaderData();

  if (!announcement) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Announcement not found</EmptyTitle>
          <EmptyDescription>
            This draft may have been deleted or the link is invalid.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link search={{ create: true }} to="/announcements">
              <PlusIcon data-icon="inline-start" />
              Create announcement
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <AnnouncementEditor announcement={announcement} />;
};

export const Route = createFileRoute(
  "/_authenticated/announcements/$announcementId"
)({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "view");
  },
  component: AnnouncementEditorRoute,
  loader: ({ params }) => getAnnouncement({ data: params.announcementId }),
});
