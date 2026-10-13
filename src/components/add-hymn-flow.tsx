import { ArrowLeftIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

import {
  HymnSourceManager,
  HymnSourceTagField,
} from "~/components/hymn-source-manager";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { buildHymnOption } from "~/lib/hymn-sources";
import { getHymnSources, saveHymn } from "~/lib/order-service-data";
import type {
  HymnLanguage,
  HymnOption,
  HymnSourceRecord,
} from "~/lib/order-service-types";

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

interface AddHymnFlowProps {
  /** Prefilled from the hymn search text that found no match. */
  initialName?: string;
  /** Leaves the flow without creating a hymn (back to the activity, usually). */
  onCancel: () => void;
  onCreated: (hymn: HymnOption) => void;
}

type AddHymnView = "form" | "sources";

/**
 * Quick-add hymn form plus source tag management, rendered inside whatever
 * dialog hosts it. Views swap in place instead of stacking a dialog on a
 * dialog, so the activity being edited is never lost.
 */
export const AddHymnFlow = ({
  initialName = "",
  onCancel,
  onCreated,
}: AddHymnFlowProps) => {
  const saveHymnFn = useServerFn(saveHymn);
  const getHymnSourcesFn = useServerFn(getHymnSources);
  const uid = React.useId().replaceAll(":", "");
  const [view, setView] = React.useState<AddHymnView>("form");
  const [sources, setSources] = React.useState<HymnSourceRecord[]>([]);
  const [name, setName] = React.useState(initialName);
  const [hymnNumber, setHymnNumber] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [language, setLanguage] = React.useState<HymnLanguage>("english");
  const [musicKey, setMusicKey] = React.useState("");
  const [lyricsMarkdown, setLyricsMarkdown] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [formError, setError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);

  const applySources = React.useCallback((records: HymnSourceRecord[]) => {
    setSources(records);
    setSourceId((current) =>
      records.some((source) => source.id === current)
        ? current
        : (records[0]?.id ?? "")
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadSources = async () => {
      try {
        const records = await getHymnSourcesFn();

        if (!cancelled) {
          applySources(records);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            errorMessage(error, "Unable to load source tags. Try again.")
          );
        }
      }
    };

    void loadSources();

    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- load sources once when the flow opens.
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      setNameError("Give the hymn a name.");
      return;
    }

    if (!sourceId) {
      setError("Add a source tag with “Manage tags” before saving this hymn.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNameError(null);

    try {
      const result = await saveHymnFn({
        data: {
          hymnNumber,
          language,
          lastPlayed: "",
          lyricsMarkdown,
          musicKey,
          name: name.trim(),
          sourceId,
        },
      });
      const sourceName =
        sources.find((source) => source.id === sourceId)?.name ?? "";
      toast.success(`Added “${name.trim()}” to the hymn library.`);
      onCreated(
        buildHymnOption({
          hymnNumber,
          id: result.id,
          lyricsMarkdown,
          musicKey: musicKey.trim(),
          name: name.trim(),
          sourceName,
        })
      );
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to save that hymn. Try again."));
    } finally {
      setIsSaving(false);
    }
  };

  if (view === "sources") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Manage source tags</DialogTitle>
          <DialogDescription>
            Add, rename, or delete the books and collections hymns come from.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <HymnSourceManager onSourcesChange={applySources} />
        </div>
        <DialogFooter>
          <Button onClick={() => setView("form")} type="button">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to new hymn
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Add new hymn</DialogTitle>
        <DialogDescription>
          Add it to the hymn library now; it will be selected for this activity.
          You can fill in more detail later from the Hymns page.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <FieldGroup className="md:grid md:grid-cols-2">
          <Field data-invalid={Boolean(nameError)}>
            <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
            <Input
              aria-invalid={Boolean(nameError)}
              autoFocus
              id={`${uid}-name`}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
              value={name}
            />
            {nameError ? (
              <FieldDescription className="text-destructive">
                {nameError}
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${uid}-number`}>Hymn number</FieldLabel>
            <Input
              id={`${uid}-number`}
              onChange={(event) => setHymnNumber(event.target.value)}
              value={hymnNumber}
            />
          </Field>
          <div className="md:col-span-2">
            <HymnSourceTagField
              id={`${uid}-source`}
              onChange={setSourceId}
              onManageSources={() => setView("sources")}
              sources={sources}
              value={sourceId}
            />
          </div>
          <Field>
            <FieldLabel>Language</FieldLabel>
            <ToggleGroup
              aria-label="Hymn language"
              onValueChange={(value) => {
                if (value === "english" || value === "spanish") {
                  setLanguage(value);
                }
              }}
              spacing={2}
              type="single"
              value={language}
            >
              <ToggleGroupItem value="english">English</ToggleGroupItem>
              <ToggleGroupItem value="spanish">Español</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${uid}-key`}>Music key</FieldLabel>
            <Input
              id={`${uid}-key`}
              onChange={(event) => setMusicKey(event.target.value)}
              value={musicKey}
            />
            <FieldDescription>
              Optional. Examples: F sets b, G sets #, and A sets ###.
            </FieldDescription>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor={`${uid}-lyrics`}>Lyrics</FieldLabel>
            <Textarea
              id={`${uid}-lyrics`}
              onChange={(event) => setLyricsMarkdown(event.target.value)}
              placeholder="Add Verse 1, Chorus, Verse 2, etc."
              rows={4}
              value={lyricsMarkdown}
            />
            <FieldDescription>
              Optional for now — hymns without lyrics are flagged until lyrics
              are added. Lyrics are put into the Verse 1 / Chorus / Verse 2
              layout on save, chorus once only.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          disabled={isSaving}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <Button disabled={isSaving} type="submit">
          {isSaving ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <FloppyDiskIcon data-icon="inline-start" />
          )}
          {isSaving ? "Saving…" : "Add hymn"}
        </Button>
      </DialogFooter>
    </form>
  );
};

interface AddHymnDialogProps {
  initialName?: string;
  onClose: () => void;
  onCreated: (hymn: HymnOption) => void;
}

/** Standalone host for the quick-add flow (used outside another dialog). */
export const AddHymnDialog = ({
  initialName,
  onClose,
  onCreated,
}: AddHymnDialogProps) => (
  <Dialog
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    open
  >
    <DialogContent className="sm:max-w-2xl">
      <AddHymnFlow
        initialName={initialName}
        onCancel={onClose}
        onCreated={onCreated}
      />
    </DialogContent>
  </Dialog>
);
