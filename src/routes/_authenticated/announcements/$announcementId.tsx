import {
  CheckCircleIcon,
  CircleNotchIcon,
  FloppyDiskIcon,
  ImageIcon,
  MagicWandIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toJpeg } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
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
import type {
  AnnouncementContent,
  AnnouncementDraft,
} from "~/lib/announcement-types";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import { requirePermission } from "~/lib/route-guards";
import { cn } from "~/lib/utils";

const PREVIEW_SCALE = 0.4;

const toDataUrl = (base64: string, contentType: string) =>
  `data:${contentType};base64,${base64}`;

const AnnouncementStage = ({
  backgroundUrl,
  html,
}: {
  backgroundUrl: string | null;
  html: string;
}) => (
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
      className="absolute inset-0"
      // User/AI-authored overlay markup for the composite canvas.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </div>
);

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
  const [html, setHtml] = useState(initial.html);
  const [styleNotes, setStyleNotes] = useState("");
  const [variationCount, setVariationCount] = useState(2);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [isClearingContext, setIsClearingContext] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemovingAll, setIsRemovingAll] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setDraft(initial);
    setName(initial.name);
    setContent(initial.content);
    setBackgroundPrompt(initial.backgroundPrompt);
    setHtml(initial.html);
  }, [initial]);

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

  const applyDraft = (next: AnnouncementDraft) => {
    setDraft(next);
    setName(next.name);
    setContent(next.content);
    setBackgroundPrompt(next.backgroundPrompt);
    setHtml(next.html);
  };

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
      toast.success("Context cleared. Next generation will not use a reference.");
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
      applyDraft(next);
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
      await persist();
      // Yield so the off-screen export surface paints the latest HTML + background.
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {name || "Announcement"}
            </h1>
            <Badge
              variant={draft.status === "approved" ? "default" : "secondary"}
            >
              {draft.status === "approved" ? "Approved" : "Draft"}
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Generate AI backgrounds (no text in the image), overlay title
            hierarchy with HTML, pick a happy-path variation as context, then
            approve a 1920×1080 JPG to R2.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Content fields</CardTitle>
              <CardDescription>
                These fields feed the HTML overlay (and AI HTML generation).
                They are never rendered by the image model.
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
                Images are generated without text. If a variation is selected,
                new generations use it as context (happy path).
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

          <Card>
            <CardHeader>
              <CardTitle>HTML overlay</CardTitle>
              <CardDescription>
                AI writes the text layout as HTML. You can edit the markup
                manually at any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
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
                variant="secondary"
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="overlay-html">HTML markup</Label>
                <HtmlCodeEditor
                  id="overlay-html"
                  minHeight="18rem"
                  onChange={setHtml}
                  value={html}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>
                Scaled view of the 1920×1080 composite used for export.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted relative mx-auto w-full overflow-hidden rounded-lg border">
                <div
                  className="origin-top-left"
                  style={{
                    height: ANNOUNCEMENT_HEIGHT * PREVIEW_SCALE,
                    width: ANNOUNCEMENT_WIDTH * PREVIEW_SCALE,
                  }}
                >
                  <div
                    style={{
                      height: ANNOUNCEMENT_HEIGHT,
                      transform: `scale(${PREVIEW_SCALE})`,
                      transformOrigin: "top left",
                      width: ANNOUNCEMENT_WIDTH,
                    }}
                  >
                    <AnnouncementStage
                      backgroundUrl={selectedBackgroundUrl}
                      html={html}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Variation library</CardTitle>
                <CardDescription>
                  Select a variation to mark it as the happy path. That
                  selection becomes context for the next AI background batch.
                  Right-click a variation to remove it.
                </CardDescription>
              </div>
              {draft.variations.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      isClearingContext || !draft.selectedVariationId
                    }
                    onClick={() => void onClearContext()}
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
                        <AlertDialogTitle>
                          Remove all variations?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes every background in the
                          library and clears the active context. This cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRemovingAll}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={isRemovingAll}
                          onClick={() => void onRemoveAllVariations()}
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
              {draft.variations.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No backgrounds yet. Generate variations from a prompt above.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {draft.variations.map((variation) => {
                    const isSelected =
                      variation.id === draft.selectedVariationId;
                    const url = assetUrls[variation.objectKey];
                    const isBusy =
                      selectingId === variation.id ||
                      removingId === variation.id;

                    return (
                      <ContextMenu key={variation.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            className={cn(
                              "group relative overflow-hidden rounded-lg border text-left transition",
                              isSelected
                                ? "ring-primary ring-2"
                                : "hover:border-foreground/40"
                            )}
                            disabled={isBusy}
                            onClick={() => void onSelectVariation(variation.id)}
                            type="button"
                          >
                            <div className="bg-muted aspect-video w-full">
                              {url ? (
                                <img
                                  alt=""
                                  className="h-full w-full object-cover"
                                  src={url}
                                />
                              ) : (
                                <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                                  Loading…
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 p-2 text-xs">
                              <span className="font-mono">
                                {variation.id.slice(0, 8)}
                              </span>
                              {isSelected ? (
                                <Badge variant="default">
                                  <SparkleIcon className="size-3" />
                                  Context
                                </Badge>
                              ) : null}
                              {isBusy ? (
                                <CircleNotchIcon className="animate-spin size-4" />
                              ) : null}
                            </div>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            disabled={removingId === variation.id}
                            onClick={() =>
                              void onRemoveVariation(variation.id)
                            }
                            variant="destructive"
                          >
                            <TrashIcon />
                            Remove
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {exportPreview && draft.status === "approved" ? (
            <Card>
              <CardHeader>
                <CardTitle>Approved export</CardTitle>
                <CardDescription>
                  Stored JPG in R2 at{" "}
                  <code className="text-xs">{draft.exportObjectKey}</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <img
                  alt="Approved announcement export"
                  className="w-full rounded-lg border"
                  src={exportPreview}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Off-screen full-resolution surface for html-to-image export */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-[-10000px] opacity-0"
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
