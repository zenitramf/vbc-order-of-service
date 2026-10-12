import {
  CheckIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { Spinner } from "~/components/ui/spinner";
import {
  hymnSourceDeleteError,
  validateHymnSourceName,
} from "~/lib/hymn-sources";
import {
  deleteHymnSource,
  getHymnSources,
  saveHymnSource,
} from "~/lib/order-service-data";
import type {
  HymnSourceRecord,
  ReferenceOption,
} from "~/lib/order-service-types";

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

interface HymnSourceTagFieldProps {
  id: string;
  /** Opens the source tag manager; omit to hide the Manage tags button. */
  onManageSources?: () => void;
  onChange: (sourceId: string) => void;
  sources: ReferenceOption[];
  value: string;
}

/** Source tag select with a shortcut into source tag management. */
export const HymnSourceTagField = ({
  id,
  onChange,
  onManageSources,
  sources,
  value,
}: HymnSourceTagFieldProps) => (
  <Field>
    <div className="flex items-center justify-between gap-2">
      <FieldLabel htmlFor={id}>Source tag</FieldLabel>
      {onManageSources ? (
        <Button
          onClick={onManageSources}
          size="sm"
          type="button"
          variant="ghost"
        >
          <PencilSimpleIcon data-icon="inline-start" />
          Manage tags
        </Button>
      ) : null}
    </div>
    <NativeSelect
      className="w-full"
      disabled={sources.length === 0}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {sources.length === 0 ? (
        <NativeSelectOption value="">No source tags yet</NativeSelectOption>
      ) : null}
      {sources.map((source) => (
        <NativeSelectOption key={source.id} value={source.id}>
          {source.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
    {sources.length === 0 && onManageSources ? (
      <FieldDescription>
        Add a source tag with “Manage tags” before saving this hymn.
      </FieldDescription>
    ) : null}
  </Field>
);

interface HymnSourceManagerProps {
  /** Called with the fresh list after every create, rename, or delete. */
  onSourcesChange?: (sources: HymnSourceRecord[]) => void;
}

/**
 * Create, rename, and delete hymn source tags. Tags still used by hymns
 * cannot be deleted; the hymns must be moved to another tag first.
 */
export const HymnSourceManager = ({
  onSourcesChange,
}: HymnSourceManagerProps) => {
  const getHymnSourcesFn = useServerFn(getHymnSources);
  const saveHymnSourceFn = useServerFn(saveHymnSource);
  const deleteHymnSourceFn = useServerFn(deleteHymnSource);
  const [sources, setSources] = React.useState<HymnSourceRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [formError, setError] = React.useState<string | null>(null);

  const refreshSources = React.useCallback(async () => {
    const records = await getHymnSourcesFn();
    setSources(records);
    onSourcesChange?.(records);
    return records;
  }, [getHymnSourcesFn, onSourcesChange]);

  React.useEffect(() => {
    let cancelled = false;

    const loadSources = async () => {
      try {
        const records = await getHymnSourcesFn();

        if (!cancelled) {
          setSources(records);
          onSourcesChange?.(records);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            errorMessage(error, "Unable to load source tags. Try again.")
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSources();

    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; refreshSources covers later changes.
  }, []);

  const handleAdd = async () => {
    const nameError = validateHymnSourceName(newName, sources);

    if (nameError) {
      setError(nameError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const created = await saveHymnSourceFn({
        data: { name: newName.trim() },
      });
      setNewName("");
      await refreshSources();
      toast.success(`Added source tag “${created.name}”.`);
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to add that source tag."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRename = async (source: HymnSourceRecord) => {
    const nameError = validateHymnSourceName(editingName, sources, source.id);

    if (nameError) {
      setError(nameError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveHymnSourceFn({
        data: { id: source.id, name: editingName.trim() },
      });
      setEditingId(null);
      setEditingName("");
      await refreshSources();
      toast.success(`Renamed source tag to “${editingName.trim()}”.`);
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to rename that source tag."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (source: HymnSourceRecord) => {
    const deleteError = hymnSourceDeleteError(source.name, source.hymnCount);

    if (deleteError) {
      setError(deleteError);
      setDeletingId(null);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await deleteHymnSourceFn({ data: source.id });
      setDeletingId(null);
      await refreshSources();
      toast.success(`Deleted source tag “${source.name}”.`);
    } catch (error) {
      setError(errorMessage(error, "Unable to delete that source tag."));
    } finally {
      setIsSaving(false);
    }
  };

  const renderSourceRow = (source: HymnSourceRecord) => {
    if (editingId === source.id) {
      return (
        <>
          <Input
            aria-label={`Rename ${source.name}`}
            autoFocus
            className="min-w-40 flex-1"
            onChange={(event) => setEditingName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleRename(source);
              }
            }}
            value={editingName}
          />
          <Button
            disabled={isSaving || !editingName.trim()}
            onClick={() => void handleRename(source)}
            size="sm"
            type="button"
          >
            <CheckIcon data-icon="inline-start" />
            Save
          </Button>
          <Button
            disabled={isSaving}
            onClick={() => {
              setEditingId(null);
              setEditingName("");
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <XIcon data-icon="inline-start" />
            Cancel
          </Button>
        </>
      );
    }

    if (deletingId === source.id) {
      return (
        <>
          <span className="min-w-0 flex-1 text-sm">
            Delete “{source.name}”? This cannot be undone.
          </span>
          <Button
            disabled={isSaving}
            onClick={() => void handleDelete(source)}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            Delete
          </Button>
          <Button
            disabled={isSaving}
            onClick={() => setDeletingId(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </>
      );
    }

    const deleteBlocked = source.hymnCount > 0;

    return (
      <>
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {source.name}
        </span>
        <Badge variant="secondary">
          {source.hymnCount} {source.hymnCount === 1 ? "hymn" : "hymns"}
        </Badge>
        <Button
          onClick={() => {
            setEditingId(source.id);
            setEditingName(source.name);
            setDeletingId(null);
            setError(null);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <PencilSimpleIcon data-icon="inline-start" />
          Rename
        </Button>
        <Button
          aria-label={`Delete ${source.name}`}
          disabled={deleteBlocked}
          onClick={() => {
            setDeletingId(source.id);
            setEditingId(null);
            setError(null);
          }}
          size="sm"
          title={
            deleteBlocked
              ? "Move this tag's hymns to another source first."
              : undefined
          }
          type="button"
          variant="ghost"
        >
          <TrashIcon data-icon="inline-start" />
          Delete
        </Button>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-hymn-source">New source tag</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="new-hymn-source"
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAdd();
                }
              }}
              placeholder="e.g. Trinity Hymnal"
              value={newName}
            />
            <Button
              disabled={isSaving || !newName.trim()}
              onClick={() => void handleAdd()}
              type="button"
              variant="secondary"
            >
              {isSaving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              Add tag
            </Button>
          </div>
          <FieldDescription>
            Tags name the book or collection a hymn comes from. Renaming a tag
            updates every hymn that uses it.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner />
          Loading source tags…
        </p>
      ) : null}

      {!isLoading && sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No source tags yet. Add your first tag above.
        </p>
      ) : null}

      <ul className="flex flex-col divide-y">
        {sources.map((source) => (
          <li
            className="flex flex-wrap items-center gap-2 py-2"
            key={source.id}
          >
            {renderSourceRow(source)}
          </li>
        ))}
      </ul>
    </div>
  );
};
