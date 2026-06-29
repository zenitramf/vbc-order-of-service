// oxlint-disable complexity, react/no-unstable-nested-components
import {
  DownloadSimpleIcon,
  EyeIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";
import { toast } from "sonner";

import { MusicKeySelector } from "~/components/music-key-selector";
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
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
  deleteHymnFile,
  getHymnFileDownload,
  renameHymnFile,
  saveHymn,
  uploadHymnFile,
} from "~/lib/order-service-data";
import type {
  HymnFileRecord,
  HymnRecord,
  ReferenceData,
} from "~/lib/order-service-types";

interface HymnEditorPageProps {
  files?: HymnFileRecord[];
  hymn?: HymnRecord;
  referenceData: ReferenceData;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileToBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return window.btoa(binary);
};

const EMPTY_HYMN_FILES: HymnFileRecord[] = [];

const openHymnFile = (
  base64: string,
  contentType: string,
  filename: string,
  download: boolean
): void => {
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(
    binary,
    (character) => character.codePointAt(0) ?? 0
  );
  const url = window.URL.createObjectURL(
    new Blob([bytes], { type: contentType })
  );

  if (download) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};

export const HymnEditorPage = ({
  files: initialFiles = EMPTY_HYMN_FILES,
  hymn,
  referenceData,
}: HymnEditorPageProps) => {
  const navigate = useNavigate();
  const saveHymnFn = useServerFn(saveHymn);
  const uploadHymnFileFn = useServerFn(uploadHymnFile);
  const renameHymnFileFn = useServerFn(renameHymnFile);
  const deleteHymnFileFn = useServerFn(deleteHymnFile);
  const getHymnFileDownloadFn = useServerFn(getHymnFileDownload);
  const [hymnNumber, setHymnNumber] = React.useState(hymn?.hymnNumber ?? "");
  const [name, setName] = React.useState(hymn?.name ?? "");
  const [lyricsMarkdown, setLyricsMarkdown] = React.useState(
    hymn?.lyricsMarkdown ?? ""
  );
  const [musicKey, setMusicKey] = React.useState(hymn?.musicKey ?? "");
  const [lastPlayed, setLastPlayed] = React.useState(
    (hymn?.lastPlayed ?? "").slice(0, 10)
  );
  const timesPlayedLastSixMonths = hymn?.timesPlayedLastSixMonths ?? 0;
  const [sourceId, setSourceId] = React.useState(
    hymn?.sourceId ?? referenceData.hymnSources[0]?.id ?? "living-hymns"
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [files, setFiles] = React.useState(initialFiles);
  const [isUploading, setIsUploading] = React.useState(false);
  const [editingFileId, setEditingFileId] = React.useState<string | null>(null);
  const [editingFilename, setEditingFilename] = React.useState("");
  const [fileToDelete, setFileToDelete] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const result = await saveHymnFn({
        data: {
          hymnNumber,
          id: hymn?.id,
          lastPlayed,
          lyricsMarkdown,
          musicKey,
          name,
          sourceId,
        },
      });
      await navigate({ params: { hymnId: result.id }, to: "/hymns/$hymnId" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!hymn?.id || !selectedFile) {
      return;
    }

    setIsUploading(true);

    try {
      const uploadedFile = await uploadHymnFileFn({
        data: {
          base64: await fileToBase64(selectedFile),
          contentType: selectedFile.type || "application/octet-stream",
          filename: selectedFile.name,
          hymnId: hymn.id,
        },
      });
      setFiles((currentFiles) => [...currentFiles, uploadedFile]);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleOpenFile = async (fileId: string, download: boolean) => {
    const file = await getHymnFileDownloadFn({ data: fileId });
    openHymnFile(file.base64, file.contentType, file.filename, download);
  };

  const handleRenameFile = async (fileId: string) => {
    const renamedFile = await renameHymnFileFn({
      data: { filename: editingFilename, id: fileId },
    });
    setFiles((currentFiles) =>
      currentFiles.map((file) => (file.id === fileId ? renamedFile : file))
    );
    setEditingFileId(null);
    setEditingFilename("");
  };

  const handleDeleteFile = async (fileId: string, filename: string) => {
    const previousFiles = files;

    try {
      setIsDeleting(true);
      setFiles((currentFiles) =>
        currentFiles.filter((file) => file.id !== fileId)
      );
      setFileToDelete(null);

      await deleteHymnFileFn({ data: fileId });
      toast.success(`Deleted "${filename}".`);
    } catch {
      setFiles(previousFiles);
      toast.error("Unable to delete hymn file. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const fileTable = useReactTable({
    columns: [
      {
        accessorKey: "filename",
        cell: ({ row }) => {
          const file = row.original;

          if (editingFileId !== file.id) {
            return file.filename;
          }

          return (
            <Input
              onChange={(event) => setEditingFilename(event.target.value)}
              value={editingFilename}
            />
          );
        },
        header: "File",
      },
      {
        accessorKey: "contentType",
        header: "Type",
      },
      {
        accessorKey: "sizeBytes",
        cell: ({ row }) => formatBytes(row.original.sizeBytes),
        header: "Size",
      },
      {
        accessorKey: "updatedAt",
        cell: ({ row }) => row.original.updatedAt,
        header: "Updated",
      },
      {
        cell: ({ row }) => {
          const file = row.original;
          const isEditing = editingFileId === file.id;

          return (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => void handleOpenFile(file.id, false)}
                size="sm"
                type="button"
                variant="outline"
              >
                <EyeIcon data-icon="inline-start" />
                View
              </Button>
              <Button
                onClick={() => void handleOpenFile(file.id, true)}
                size="sm"
                type="button"
                variant="outline"
              >
                <DownloadSimpleIcon data-icon="inline-start" />
                Download
              </Button>
              {isEditing ? (
                <>
                  <Button
                    onClick={() => void handleRenameFile(file.id)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingFileId(null);
                      setEditingFilename("");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon data-icon="inline-start" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    setEditingFileId(file.id);
                    setEditingFilename(file.filename);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PencilSimpleIcon data-icon="inline-start" />
                  Rename
                </Button>
              )}
              <AlertDialog
                onOpenChange={(open) => {
                  setFileToDelete(open ? file.id : null);
                }}
                open={fileToDelete === file.id}
              >
                <AlertDialogTrigger asChild>
                  <Button size="sm" type="button" variant="ghost">
                    <TrashIcon data-icon="inline-start" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this hymn file?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove "{file.filename}" from this
                      hymn and R2 storage.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isDeleting}
                      onClick={async () => {
                        await handleDeleteFile(file.id, file.filename);
                      }}
                      variant="destructive"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
        header: () => <span className="sr-only">Actions</span>,
        id: "actions",
      },
    ],
    data: files,
    getCoreRowModel: getCoreRowModel(),
  });

  React.useEffect(() => {
    setFiles(initialFiles);
  }, [initialFiles]);

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {hymn ? "Edit Hymn" : "New Hymn"}
          </h1>
          <p className="text-muted-foreground">
            Manage hymn metadata, lyrics, source tags, and play history used
            while planning services.
          </p>
        </div>
        <Button disabled={isSaving} type="submit">
          <FloppyDiskIcon data-icon="inline-start" />
          {isSaving ? "Saving…" : "Save hymn"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Hymn details</CardTitle>
            <CardDescription>
              Hymn selections in orders come from this library.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="hymn-number">Hymn number</FieldLabel>
                <Input
                  id="hymn-number"
                  onChange={(event) => setHymnNumber(event.target.value)}
                  value={hymnNumber}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="hymn-name">Name</FieldLabel>
                <Input
                  id="hymn-name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="source">Source tag</FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="source"
                  onChange={(event) => setSourceId(event.target.value)}
                  value={sourceId}
                >
                  {referenceData.hymnSources.map((source) => (
                    <NativeSelectOption key={source.id} value={source.id}>
                      {source.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="last-played">Last played</FieldLabel>
                <Input
                  id="last-played"
                  onChange={(event) => setLastPlayed(event.target.value)}
                  type="date"
                  value={lastPlayed}
                />
                <FieldDescription>
                  Publishing an order updates this field for hymns selected in
                  that service.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="times-played">
                  Times played last 6 months
                </FieldLabel>
                <Input
                  disabled
                  id="times-played"
                  min={0}
                  readOnly
                  type="number"
                  value={timesPlayedLastSixMonths}
                />
                <FieldDescription>
                  Calculated from published orders of service in the last 6
                  months.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="lyrics">Lyrics</FieldLabel>
                <Textarea
                  id="lyrics"
                  onChange={(event) => setLyricsMarkdown(event.target.value)}
                  rows={14}
                  value={lyricsMarkdown}
                />
                <FieldDescription>
                  Add Verse 1, Chorus, Verse 2, etc.
                </FieldDescription>
              </Field>
              {hymn?.id ? (
                <Field>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <FieldLabel>Hymn files</FieldLabel>
                      <FieldDescription>
                        Upload sheet music, PDFs, and related files to R2 for
                        this hymn.
                      </FieldDescription>
                    </div>
                    <div>
                      <Input
                        className="hidden"
                        id="hymn-file-upload"
                        onChange={(event) => void handleUpload(event)}
                        ref={fileInputRef}
                        type="file"
                      />
                      <Button
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                        variant="secondary"
                      >
                        <UploadSimpleIcon data-icon="inline-start" />
                        {isUploading ? "Uploading…" : "Upload file"}
                      </Button>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      {fileTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {fileTable.getRowModel().rows.length ? (
                        fileTable.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            className="text-muted-foreground"
                            colSpan={5}
                          >
                            No files uploaded for this hymn.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Field>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Music key</CardTitle>
              <CardDescription>
                Click a key on the outer circle to set the key signature value.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="music-key">Music Key</FieldLabel>
                  <Input
                    id="music-key"
                    onChange={(event) => setMusicKey(event.target.value)}
                    value={musicKey}
                  />
                  <FieldDescription>
                    Examples: F sets b, G sets #, and A sets ###.
                  </FieldDescription>
                </Field>
                <MusicKeySelector onChange={setMusicKey} value={musicKey} />
              </FieldGroup>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
};
