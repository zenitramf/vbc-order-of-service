import {
  DownloadSimpleIcon,
  ImageIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
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
import { hasPermission } from "~/lib/admin-permissions";
import {
  deleteLibraryImage,
  listLibraryImages,
  uploadLibraryImage,
} from "~/lib/image-library-data";
import type { ImageLibraryItem } from "~/lib/image-library-types";
import {
  LIBRARY_IMAGE_HEIGHT,
  LIBRARY_IMAGE_WIDTH,
} from "~/lib/image-library-types";
import { r2AssetUrl } from "~/lib/r2-asset-url";
import { requirePermission } from "~/lib/route-guards";

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const downloadLibraryImage = (image: ImageLibraryItem): void => {
  const anchor = document.createElement("a");
  anchor.href = r2AssetUrl(image.objectKey, {
    downloadFilename: image.filename,
  });
  anchor.download = image.filename;
  anchor.click();
};

const fileToBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return window.btoa(binary);
};

/** Load natural pixel dimensions via the browser image decoder. */
const readFileImageDimensions = async (
  file: File
): Promise<{ height: number; width: number }> => {
  const bitmap = await createImageBitmap(file);
  const dimensions = { height: bitmap.height, width: bitmap.width };
  bitmap.close();
  return dimensions;
};

interface LibraryImageCardProps {
  canDelete: boolean;
  image: ImageLibraryItem;
  isDeleting: boolean;
  onDelete: (image: ImageLibraryItem) => void;
  onDownload: (image: ImageLibraryItem) => void;
  previewUrl: string;
}

const LibraryImageCard = ({
  canDelete,
  image,
  isDeleting,
  onDelete,
  onDownload,
  previewUrl,
}: LibraryImageCardProps) => (
  <Card className="overflow-hidden pt-0" size="sm">
    <div className="relative aspect-video w-full overflow-hidden bg-muted">
      <img
        alt={image.filename}
        className="size-full object-cover transition-transform duration-300 group-hover/card:scale-[1.02]"
        decoding="async"
        loading="lazy"
        src={previewUrl}
      />
      <div className="absolute right-2 bottom-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
        {image.width}×{image.height}
      </div>
    </div>
    <CardHeader className="gap-1">
      <CardTitle className="line-clamp-1" title={image.filename}>
        {image.filename}
      </CardTitle>
      <CardDescription>
        {formatBytes(image.sizeBytes)} · {formatWhen(image.createdAt)}
      </CardDescription>
    </CardHeader>
    <CardFooter className="mt-auto gap-2 border-t pt-(--card-spacing)">
      <Button
        className="flex-1"
        onClick={() => {
          onDownload(image);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <DownloadSimpleIcon data-icon="inline-start" />
        Download
      </Button>
      {canDelete ? (
        <Button
          aria-label={`Delete ${image.filename}`}
          disabled={isDeleting}
          onClick={() => {
            onDelete(image);
          }}
          size="sm"
          type="button"
          variant="destructive"
        >
          <TrashIcon data-icon="inline-start" />
          Delete
        </Button>
      ) : null}
    </CardFooter>
  </Card>
);

const ImageLibraryPage = () => {
  const initialImages = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFn = useServerFn(uploadLibraryImage);
  const deleteFn = useServerFn(deleteLibraryImage);

  const [images, setImages] = useState(initialImages);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<ImageLibraryItem | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreate = hasPermission(permissions, "library", "create");
  const canDelete = hasPermission(permissions, "library", "delete");

  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  const validateAndUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPEG, PNG, or WebP).");
      return;
    }

    try {
      const dimensions = await readFileImageDimensions(file);

      if (
        dimensions.width !== LIBRARY_IMAGE_WIDTH ||
        dimensions.height !== LIBRARY_IMAGE_HEIGHT
      ) {
        toast.error(
          `Image must be exactly ${LIBRARY_IMAGE_WIDTH}×${LIBRARY_IMAGE_HEIGHT} pixels (this file is ${dimensions.width}×${dimensions.height}).`
        );
        return;
      }

      setIsUploading(true);

      const uploaded = await uploadFn({
        data: {
          base64: await fileToBase64(file),
          contentType: file.type || "image/jpeg",
          filename: file.name,
          height: dimensions.height,
          width: dimensions.width,
        },
      });

      setImages((current) => [uploaded, ...current]);
      await router.invalidate();
      toast.success(`Uploaded "${uploaded.filename}".`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload image."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await validateAndUpload(file);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    if (!canCreate || isUploading) {
      return;
    }

    const [file] = event.dataTransfer.files;

    if (!file) {
      return;
    }

    await validateAndUpload(file);
  };

  const handleDelete = async () => {
    if (!imageToDelete) {
      return;
    }

    const previous = images;
    const target = imageToDelete;

    try {
      setIsDeleting(true);
      setImages((current) =>
        current.filter((item) => item.objectKey !== target.objectKey)
      );
      setImageToDelete(null);

      await deleteFn({ data: target.objectKey });
      await router.invalidate();
      toast.success(`Deleted "${target.filename}".`);
    } catch (error) {
      setImages(previous);
      toast.error(
        error instanceof Error ? error.message : "Could not delete image."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Image Library
          </h1>
          <p className="text-muted-foreground">
            Predefined 1920×1080 images for announcements. Stored under the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              library/images/
            </code>{" "}
            prefix in R2.
          </p>
        </div>
        {canCreate ? (
          <>
            <input
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="sr-only"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <Button
              disabled={isUploading}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              type="button"
            >
              <UploadSimpleIcon data-icon="inline-start" />
              {isUploading ? "Uploading..." : "Upload image"}
            </Button>
          </>
        ) : null}
      </div>

      {canCreate ? (
        <div
          className={
            isDragging
              ? "rounded-3xl border-2 border-dashed border-primary bg-primary/5 p-8 transition-colors"
              : "rounded-3xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-8 transition-colors"
          }
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <ImageIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">
              {isDragging
                ? "Drop to upload"
                : "Drag and drop an image here, or use Upload"}
            </p>
            <p className="text-sm text-muted-foreground">
              Exactly {LIBRARY_IMAGE_WIDTH}×{LIBRARY_IMAGE_HEIGHT} · JPEG, PNG,
              or WebP
            </p>
          </div>
        </div>
      ) : null}

      {images.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>No library images yet</EmptyTitle>
            <EmptyDescription>
              Upload Full HD announcement backgrounds so they can be reused
              across drafts without regenerating each time.
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? (
            <EmptyContent>
              <Button
                disabled={isUploading}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                type="button"
              >
                <UploadSimpleIcon data-icon="inline-start" />
                Upload first image
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image) => (
            <LibraryImageCard
              canDelete={canDelete}
              image={image}
              isDeleting={isDeleting}
              key={image.objectKey}
              onDelete={setImageToDelete}
              onDownload={downloadLibraryImage}
              previewUrl={r2AssetUrl(image.objectKey)}
            />
          ))}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setImageToDelete(null);
          }
        }}
        open={imageToDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this image?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              {imageToDelete ? `"${imageToDelete.filename}"` : "this image"}{" "}
              from the library and R2 storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={async () => {
                await handleDelete();
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
};

export const Route = createFileRoute("/_authenticated/library/")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "library", "view");
  },
  component: ImageLibraryPage,
  loader: () => listLibraryImages(),
});
