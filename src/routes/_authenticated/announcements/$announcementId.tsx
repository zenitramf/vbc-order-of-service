import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FloppyDiskIcon,
  ImageIcon,
  MagicWandIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  XCircleIcon,
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
  approveAnnouncement,
  clearVariationContext,
  generateAnnouncementHtml,
  generateBackgrounds,
  getAnnouncement,
  getAnnouncementAsset,
  removeAllVariations,
  removeVariation,
  saveAnnouncement,
  selectVariation,
} from "~/lib/announcement-data";
import { prepareOverlayHtmlForRender } from "~/lib/announcement-overlay-html";
import type {
  AnnouncementContent,
  AnnouncementDraft,
  AnnouncementVariation,
} from "~/lib/announcement-types";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import { requirePermission } from "~/lib/route-guards";
import { cn } from "~/lib/utils";

/** Display label for the background image model (generation is server-side). */
const BACKGROUND_IMAGE_MODEL = "xai/grok-imagine-image-quality";

const toDataUrl = (base64: string, contentType: string) =>
  `data:${contentType};base64,${base64}`;

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

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

      return (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "bg-muted relative size-14 shrink-0 overflow-hidden rounded-md border",
              isSelected && "ring-primary ring-2"
            )}
          >
            {url ? (
              <img alt="" className="size-full object-cover" src={url} />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-[10px]">
                …
              </div>
            )}
            {isBusy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <CircleNotchIcon className="size-4 animate-spin text-white" />
              </div>
            ) : null}
          </div>
          {isSelected ? (
            <Badge variant="default">
              <SparkleIcon className="size-3" />
              Context
            </Badge>
          ) : null}
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
    cell: () => (
      <span className="font-mono text-xs">{BACKGROUND_IMAGE_MODEL}</span>
    ),
    enableSorting: false,
    header: "Model",
    id: "model",
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
  backgroundUrl,
  editorRef,
  html,
  onHtmlChange,
}: {
  backgroundUrl: string | null;
  editorRef?: Ref<GrapesjsAnnouncementEditorHandle>;
  html: string;
  onHtmlChange: (html: string) => void;
}) => (
  <Card
    className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0"
    size="sm"
  >
    <CardHeader className="shrink-0 border-b py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle className="text-base">GrapesJS editor</CardTitle>
          <CardDescription className="text-xs">
            Native GrapesJS blocks, styles, layers, and traits. Background photo
            is on the Body component (swaps with the selected variation).
            Auto-saves · up to {HTML_HISTORY_MAX_SNAPSHOTS} draft snapshots
            (Mod+Z / Mod+Y).
          </CardDescription>
        </div>
        <Badge className="w-fit shrink-0" variant="secondary">
          1920×1080
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col p-0 sm:p-0">
      <GrapesjsAnnouncementEditor
        ref={editorRef}
        backgroundUrl={backgroundUrl}
        className="min-h-0 flex-1"
        html={html}
        onHtmlChange={onHtmlChange}
      />
    </CardContent>
  </Card>
);

const VariationLibraryCard = ({
  assetUrls,
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
            becomes context for the next AI background batch. Right-click a row
            to remove it.
          </CardDescription>
        </div>
        {variations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isClearingContext || !selectedVariationId}
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
                  disabled={isRemovingAll}
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
            No backgrounds yet. Generate variations from a prompt above.
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
                          "cursor-pointer",
                          isSelected && "bg-muted/60"
                        )}
                        data-state={isSelected ? "selected" : undefined}
                        onClick={() => {
                          if (!isBusy) {
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
                        disabled={removingId === row.original.id}
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

const AnnouncementEditor = ({
  announcement: initial,
}: {
  announcement: AnnouncementDraft;
}) => {
  const router = useRouter();
  const saveFn = useServerFn(saveAnnouncement);
  const generateBgFn = useServerFn(generateBackgrounds);
  const selectFn = useServerFn(selectVariation);
  const clearContextFn = useServerFn(clearVariationContext);
  const removeVariationFn = useServerFn(removeVariation);
  const removeAllVariationsFn = useServerFn(removeAllVariations);
  const generateHtmlFn = useServerFn(generateAnnouncementHtml);
  const getAssetFn = useServerFn(getAnnouncementAsset);
  const approveFn = useServerFn(approveAnnouncement);

  const [draft, setDraft] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState<AnnouncementContent>(initial.content);
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    initial.backgroundPrompt
  );
  const {
    canRedo,
    canUndo,
    commit: commitHtmlHistory,
    html,
    redo: redoHtmlHistory,
    reset: resetHtmlHistory,
    setHtml,
    undo: undoHtmlHistory,
  } = useHtmlHistory(initial.html);
  const [styleNotes, setStyleNotes] = useState("");
  const [markupOpen, setMarkupOpen] = useState(false);
  const [variationCount, setVariationCount] = useState(2);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [isClearingContext, setIsClearingContext] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemovingAll, setIsRemovingAll] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const grapesEditorRef = useRef<GrapesjsAnnouncementEditorHandle>(null);
  const htmlRef = useRef(html);
  const nameRef = useRef(name);
  const contentRef = useRef(content);
  const backgroundPromptRef = useRef(backgroundPrompt);
  const draftIdRef = useRef(draft.id);
  const autoSaveInFlightRef = useRef(false);
  const autoSaveLatestRef = useRef<string | null>(null);

  htmlRef.current = html;
  nameRef.current = name;
  contentRef.current = content;
  backgroundPromptRef.current = backgroundPrompt;
  draftIdRef.current = draft.id;

  const hasApprovedExport =
    draft.status === "approved" && Boolean(exportPreview);

  const selectedVariation = useMemo(
    () =>
      draft.variations.find(
        (variation) => variation.id === draft.selectedVariationId
      ) ?? null,
    [draft.selectedVariationId, draft.variations]
  );

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
    setContent(initial.content);
    setBackgroundPrompt(initial.backgroundPrompt);

    // Reset undo stack only when opening a different announcement.
    if (lastHydratedIdRef.current !== initial.id) {
      lastHydratedIdRef.current = initial.id;
      resetHtmlHistory(initial.html);
    }
  }, [initial, resetHtmlHistory]);

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
    options?: { resetHtmlHistory?: boolean }
  ) => {
    setDraft(next);
    setName(next.name);
    setContent(next.content);
    setBackgroundPrompt(next.backgroundPrompt);

    if (options?.resetHtmlHistory) {
      resetHtmlHistory(next.html);
    } else {
      setHtml(next.html);
    }
  };

  /** Persist HTML from canvas/undo without toast spam; coalesces concurrent saves. */
  const autoSaveHtml = useCallback(
    (htmlValue: string) => {
      autoSaveLatestRef.current = htmlValue;

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
              html: toSave,
              id: draftIdRef.current,
              name: nameRef.current,
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

  const onCanvasHtmlChange = useCallback(
    (nextHtml: string) => {
      if (nextHtml === htmlRef.current) {
        return;
      }

      commitHtmlHistory(nextHtml);
      autoSaveHtml(nextHtml);
    },
    [autoSaveHtml, commitHtmlHistory]
  );

  const onUndoCanvas = useCallback(() => {
    const restored = undoHtmlHistory();

    if (restored === null) {
      return;
    }

    autoSaveHtml(restored);
  }, [autoSaveHtml, undoHtmlHistory]);

  const onRedoCanvas = useCallback(() => {
    const restored = redoHtmlHistory();

    if (restored === null) {
      return;
    }

    autoSaveHtml(restored);
  }, [autoSaveHtml, redoHtmlHistory]);

  useHotkey(
    "Mod+Z",
    () => {
      onUndoCanvas();
    },
    { enabled: canUndo }
  );

  useHotkey(
    "Mod+Y",
    () => {
      onRedoCanvas();
    },
    { enabled: canRedo }
  );

  // Common redo chord (in addition to Mod+Y).
  useHotkey(
    "Mod+Shift+Z",
    () => {
      onRedoCanvas();
    },
    { enabled: canRedo }
  );

  const persist = async (overrides?: {
    contentOverride?: AnnouncementContent;
    htmlOverride?: string;
    nameOverride?: string;
    promptOverride?: string;
  }): Promise<AnnouncementDraft> => {
    setIsSaving(true);

    try {
      const next = await saveFn({
        data: {
          backgroundPrompt: overrides?.promptOverride ?? backgroundPrompt,
          content: overrides?.contentOverride ?? content,
          html: overrides?.htmlOverride ?? html,
          id: draft.id,
          name: overrides?.nameOverride ?? name,
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
          count: variationCount,
          id: draft.id,
          prompt: backgroundPrompt,
          useSelectedAsContext: Boolean(draft.selectedVariationId),
        },
      });
      applyDraft(next);
      await router.invalidate();
      toast.success(
        draft.selectedVariationId
          ? `Generated ${variationCount} variation(s) from the selected context.`
          : `Generated ${variationCount} background variation(s).`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Background generation failed."
      );
    } finally {
      setIsGeneratingBg(false);
    }
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

  const onGenerateHtml = async () => {
    setIsGeneratingHtml(true);

    try {
      await persist({ contentOverride: content });
      const next = await generateHtmlFn({
        data: { id: draft.id, styleNotes },
      });
      applyDraft(next, { resetHtmlHistory: true });
      await router.invalidate();
      toast.success(
        "HTML overlay generated (text only — not baked into the image)."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "HTML generation failed."
      );
    } finally {
      setIsGeneratingHtml(false);
    }
  };

  const onApprove = async () => {
    if (!selectedVariation) {
      toast.error("Select a background variation first.");
      return;
    }

    if (!exportRef.current) {
      toast.error("Preview is not ready to export.");
      return;
    }

    try {
      await ensureAssetUrl(selectedVariation.objectKey);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load background for export."
      );
      return;
    }

    setIsApproving(true);

    try {
      // Flush debounced GrapesJS serialization so IDs + CSS match the canvas.
      let exportHtml = html;
      flushSync(() => {
        const flushed = grapesEditorRef.current?.flush();
        if (flushed) {
          exportHtml = flushed;
        }
      });

      await persist({ htmlOverride: exportHtml });

      // Ensure the off-screen surface has committed the flushed markup.
      flushSync(() => {
        if (exportHtml !== htmlRef.current) {
          setHtml(exportHtml);
        }
      });
      // Let the browser apply nested <style> rules before html-to-image clones.
      await Promise.resolve();
      await Promise.resolve();

      const surface = exportRef.current;

      if (!surface) {
        throw new Error("Export surface missing.");
      }

      const dataUrl = await toJpeg(surface, {
        backgroundColor: "#000000",
        cacheBust: true,
        height: ANNOUNCEMENT_HEIGHT,
        pixelRatio: 1,
        quality: 0.92,
        width: ANNOUNCEMENT_WIDTH,
      });

      const base64 = dataUrl.replace(/^data:image\/jpe?g;base64,/u, "");
      const next = await approveFn({
        data: { base64, id: draft.id },
      });
      applyDraft(next);
      setExportPreview(dataUrl);
      setExportDialogOpen(true);
      await router.invalidate();
      toast.success("Announcement approved. JPG stored in R2.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Approval export failed."
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
    link.download = `${slug}-approved.jpg`;
    link.click();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header + canvas share one viewport-tall shell so the stage fits on screen */}
      <div className={VIEWPORT_CANVAS_SHELL}>
        <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {name || "Announcement"}
              </h1>
              <Badge
                variant={draft.status === "approved" ? "default" : "secondary"}
              >
                {draft.status === "approved" ? "Approved" : "Draft"}
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm">
              Edit components with GrapesJS. Swap backgrounds independently
              below; AI HTML generation and draft tools follow.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={isSaving}
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
            {hasApprovedExport ? (
              <Button
                onClick={() => setExportDialogOpen(true)}
                type="button"
                variant="outline"
              >
                <EyeIcon data-icon="inline-start" />
                View approved export
              </Button>
            ) : null}
            <Button
              disabled={isApproving || !selectedVariation}
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
              Approve &amp; export JPG
            </Button>
          </div>
        </div>

        <LiveCanvasEditor
          backgroundUrl={selectedBackgroundUrl}
          editorRef={grapesEditorRef}
          html={html}
          onHtmlChange={onCanvasHtmlChange}
        />
      </div>

      {/* Secondary: supporting tools (scroll below the fold) */}
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Content fields</CardTitle>
              <CardDescription>
                Feed AI HTML generation. Values are not baked into the
                background image — edit layout in GrapesJS above.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="announcement-name">Library name</Label>
                <Input
                  id="announcement-name"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="content-title">Title</Label>
                <Input
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
                  id="content-tertiary"
                  onChange={(event) =>
                    updateContentField("tertiary", event.target.value)
                  }
                  value={content.tertiary}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Background image (AI)</CardTitle>
              <CardDescription>
                Images are generated without text. A selected variation becomes
                context for the next batch (happy path).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="bg-prompt">Background prompt</Label>
                <Textarea
                  id="bg-prompt"
                  onChange={(event) => setBackgroundPrompt(event.target.value)}
                  rows={4}
                  value={backgroundPrompt}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="variation-count">Variations</Label>
                  <Input
                    className="w-24"
                    id="variation-count"
                    max={4}
                    min={1}
                    onChange={(event) =>
                      setVariationCount(
                        Math.min(
                          4,
                          Math.max(
                            1,
                            Number.parseInt(event.target.value, 10) || 1
                          )
                        )
                      )
                    }
                    type="number"
                    value={variationCount}
                  />
                </div>
                <Button
                  disabled={isGeneratingBg || !backgroundPrompt.trim()}
                  onClick={() => void onGenerateBackgrounds()}
                  type="button"
                >
                  {isGeneratingBg ? (
                    <CircleNotchIcon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <ImageIcon data-icon="inline-start" />
                  )}
                  {draft.selectedVariationId
                    ? "Generate from selected"
                    : "Generate backgrounds"}
                </Button>
              </div>
              {draft.selectedVariationId ? (
                <p className="text-muted-foreground text-sm">
                  Active context: variation{" "}
                  <span className="font-mono text-xs">
                    {draft.selectedVariationId.slice(0, 8)}
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate overlay with AI</CardTitle>
            <CardDescription>
              Builds layout HTML from the content fields above. Optional style
              notes steer typography, alignment, and accents. Prefer GrapesJS
              for manual edits after generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="style-notes">Style notes (optional)</Label>
              <Input
                id="style-notes"
                onChange={(event) => setStyleNotes(event.target.value)}
                placeholder="Modern sans-serif, left-aligned, gold accent…"
                value={styleNotes}
              />
            </div>
            <Button
              disabled={isGeneratingHtml}
              onClick={() => void onGenerateHtml()}
              type="button"
            >
              {isGeneratingHtml ? (
                <CircleNotchIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <MagicWandIcon data-icon="inline-start" />
              )}
              Generate HTML with AI
            </Button>
          </CardContent>
        </Card>

        <VariationLibraryCard
          assetUrls={assetUrls}
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
            setMarkupOpen(value === "html-markup");
          }}
          type="single"
          value={markupOpen ? "html-markup" : ""}
        >
          <AccordionItem value="html-markup">
            <AccordionTrigger>
              <span className="flex flex-col items-start gap-1">
                <span className="text-base">HTML markup (advanced)</span>
                <span className="text-muted-foreground text-sm font-normal">
                  Source view of the same draft HTML as the GrapesJS canvas.
                  Expand only when you need to inspect or hand-edit markup.
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="h-auto">
              {/* Mount only when open so CodeMirror lays out at full height. */}
              {markupOpen ? (
                <div className="flex min-h-72 flex-col gap-2 pt-1">
                  <Label htmlFor="overlay-html">HTML markup</Label>
                  <HtmlCodeEditor
                    id="overlay-html"
                    minHeight="18rem"
                    onChange={setHtml}
                    value={html}
                  />
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <Dialog onOpenChange={setExportDialogOpen} open={exportDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Approved export</DialogTitle>
            <DialogDescription>
              Stored JPG in R2
              {draft.exportObjectKey ? (
                <>
                  {" "}
                  at <code className="text-xs">{draft.exportObjectKey}</code>
                </>
              ) : null}
              .
            </DialogDescription>
          </DialogHeader>
          {exportPreview ? (
            <div className="overflow-hidden rounded-lg border">
              <img
                alt="Approved announcement export"
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
            html={html}
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
            <Link to="/announcements/new">
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
