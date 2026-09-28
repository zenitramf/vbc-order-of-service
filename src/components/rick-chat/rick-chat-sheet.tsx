import {
  getToolApproval,
  getToolInput,
  getToolPartState,
  useAgentChat,
} from "@cloudflare/ai-chat/react";
import {
  BrainIcon,
  CameraIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FilePdfIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  PlusIcon,
  StopCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useRouterState } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import {
  getToolName,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
} from "ai";
import type { FileUIPart, ReasoningUIPart, UIMessage } from "ai";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

import {
  ATTACHMENT_ACCEPT,
  CAMERA_ACCEPT,
  fileToFileUIPart,
  MAX_FILES_PER_MESSAGE,
  prepareAttachment,
} from "./attachments";
import { RickMarkdown } from "./rick-markdown";

const SUGGESTIONS = [
  "What's planned this Sunday?",
  "Draft next month's plan",
  "Find a hymn in G",
  "Show upcoming orders",
] as const;

const TOOL_LABELS: Record<string, string> = {
  add_member_to_team: "Add a member to a team",
  create_order: "Create an order",
  delete_hymn: "Delete a hymn",
  delete_order: "Delete an order",
  delete_team: "Delete a team",
  delete_team_member: "Delete a team member",
  delete_template: "Delete a template",
  get_dashboard: "Check the dashboard",
  get_hymn: "Look up a hymn",
  get_hymn_file: "Look up a hymn file",
  get_month_plan: "Read the month plan",
  get_month_planning_settings: "Read month planning settings",
  get_order: "Look up an order",
  get_order_email_delivery: "Check email delivery",
  get_reference_data: "Load reference data",
  get_team: "Look up a team",
  get_team_member: "Look up a team member",
  get_team_templates: "Look up team templates",
  get_template: "Look up a template",
  list_hymn_files: "Look up hymn files",
  list_hymn_options: "Look up hymn options",
  list_hymns: "Search hymns",
  list_orders: "Look up orders",
  list_team_members: "Look up team members",
  list_templates: "Look up templates",
  plan_month: "Plan the month",
  publish_order: "Publish an order",
  remove_member_from_team: "Remove a member from a team",
  save_hymn: "Save a hymn",
  save_month_planning_settings: "Save month planning settings",
  save_month_schedule: "Save the month schedule",
  save_order: "Save an order",
  save_team: "Save a team",
  save_team_member: "Save a team member",
  save_template: "Save a template",
  send_order_email: "Send an order email",
  update_hymn: "Update a hymn",
  update_order: "Update an order",
};

const toolLabel = (toolName: string): string =>
  TOOL_LABELS[toolName] ?? toolName.replaceAll("_", " ");

/**
 * After a tool approval, the AI SDK's continuation stream emits
 * `tool-output-available` without the matching call chunk, and the client-side
 * stream processor throws (vercel/ai#10196). The server already applied the
 * result and re-syncs the transcript over the WebSocket, so this error is
 * cosmetic — hide it.
 */
const isHarmlessContinuationError = (error: Error): boolean =>
  error.message.startsWith("No tool invocation found for tool call ID");

const STATE_LABELS: Record<
  ReturnType<typeof getToolPartState>,
  string | undefined
> = {
  approved: "Approved",
  complete: "Done",
  denied: "Denied",
  error: "Failed",
  loading: "Working…",
  streaming: "Working…",
  "waiting-approval": undefined,
};

interface ToolApprovalRequest {
  approved: boolean;
  id: string;
}

interface ToolPartProps {
  onApproval: (request: ToolApprovalRequest) => void;
  part: UIMessage["parts"][number];
}

const ToolPart = ({ onApproval, part }: ToolPartProps) => {
  if (!isToolUIPart(part)) {
    return null;
  }

  const state = getToolPartState(part);
  const approval = getToolApproval(part);
  const input = getToolInput(part);
  const errorText =
    "errorText" in part && typeof part.errorText === "string"
      ? part.errorText
      : undefined;

  return (
    <div className="w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{toolLabel(getToolName(part))}</span>
        {STATE_LABELS[state] ? (
          <span className="text-muted-foreground text-xs">
            {STATE_LABELS[state]}
          </span>
        ) : null}
      </div>
      {state === "waiting-approval" && approval ? (
        <div className="mt-2 space-y-2">
          <p className="text-muted-foreground text-xs">
            This will change data in the portal. Approve to continue.
          </p>
          {input === undefined ? null : (
            <pre className="max-h-32 overflow-auto rounded bg-background/70 p-2 text-xs">
              {JSON.stringify(input, null, 2)}
            </pre>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => onApproval({ approved: true, id: approval.id })}
              size="sm"
            >
              Approve
            </Button>
            <Button
              onClick={() => onApproval({ approved: false, id: approval.id })}
              size="sm"
              variant="outline"
            >
              Deny
            </Button>
          </div>
        </div>
      ) : null}
      {errorText ? (
        <p className="mt-1 text-destructive text-xs">{errorText}</p>
      ) : null}
    </div>
  );
};

/**
 * Collapsed one-liner for the model's reasoning. Native `<details>` keeps it
 * accessible (keyboard + screen readers) and closed by default.
 */
const ReasoningPart = ({ part }: { part: ReasoningUIPart }) => (
  <details className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-xs">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground select-none">
      <BrainIcon className="size-3.5" />
      <span>{part.state === "streaming" ? "Thinking…" : "Show reasoning"}</span>
    </summary>
    <div className="mt-2 text-muted-foreground">
      <RickMarkdown className="text-xs">{part.text}</RickMarkdown>
    </div>
  </details>
);

interface PendingAttachmentProps {
  file: File;
  onRemove: () => void;
}

const prepareAttachmentSafely = async (file: File): Promise<File | null> => {
  try {
    return await prepareAttachment(file);
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : `Couldn't attach "${file.name}".`
    );
    return null;
  }
};

const PendingAttachment = ({ file, onRemove }: PendingAttachmentProps) => {
  const isImage = file.type.startsWith("image/");
  const previewUrl = useMemo(
    () => (isImage ? URL.createObjectURL(file) : null),
    [file, isImage]
  );

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  return (
    <li className="relative">
      {previewUrl ? (
        <img
          alt={file.name}
          className="size-16 rounded-lg border object-cover"
          height={64}
          src={previewUrl}
          width={64}
        />
      ) : (
        <div className="flex size-16 flex-col items-center justify-center gap-1 rounded-lg border bg-muted/40 p-1">
          <FilePdfIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="w-full truncate text-center text-[10px] leading-tight">
            {file.name}
          </span>
        </div>
      )}
      <button
        aria-label={`Remove ${file.name}`}
        className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
};

interface ChatMessageProps {
  message: UIMessage;
  onApproval: (request: ToolApprovalRequest) => void;
}

const ChatMessage = ({ message, onApproval }: ChatMessageProps) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full gap-2", isUser && "justify-end")}>
      {isUser ? null : (
        <img
          alt=""
          className="mt-1 size-7 shrink-0 rounded-full"
          src="/rick-avatar.svg"
        />
      )}
      <div
        className={cn("flex max-w-[85%] flex-col gap-2", isUser && "items-end")}
      >
        {message.parts.map((part, index) => {
          if (isReasoningUIPart(part)) {
            // gpt-6-luna reasons adaptively; skipped reasoning arrives as an
            // empty part, which isn't worth a row once it's finished.
            if (part.state !== "streaming" && !part.text.trim()) {
              return null;
            }

            return (
              <ReasoningPart
                key={`${message.id}-reasoning-${index}`}
                part={part}
              />
            );
          }

          if (isTextUIPart(part)) {
            return (
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-sm",
                  isUser
                    ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
                key={`${message.id}-text-${index}`}
              >
                {isUser ? part.text : <RickMarkdown>{part.text}</RickMarkdown>}
              </div>
            );
          }

          if (isFileUIPart(part)) {
            if (part.mediaType.startsWith("image/")) {
              return (
                <img
                  alt={part.filename ?? "Attached image"}
                  className="max-h-64 max-w-full rounded-2xl border object-contain"
                  key={`${message.id}-file-${index}`}
                  src={part.url}
                />
              );
            }

            return (
              <div
                className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs"
                key={`${message.id}-file-${index}`}
              >
                <FilePdfIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="max-w-52 truncate">
                  {part.filename ?? "Attached file"}
                </span>
              </div>
            );
          }

          if (isToolUIPart(part)) {
            return (
              <ToolPart
                key={`${message.id}-tool-${index}`}
                onApproval={onApproval}
                part={part}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};

const EmptyState = ({
  onSuggestion,
}: {
  onSuggestion: (suggestion: string) => void;
}) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
    <img
      alt=""
      className="size-20 rounded-full shadow-lg"
      src="/rick-avatar.svg"
    />
    <div className="space-y-1">
      <p className="font-medium text-base">Hi, I&apos;m Rick 👋</p>
      <p className="text-muted-foreground text-sm">
        How can I help with this Sunday?
      </p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((suggestion) => (
        <Button
          key={suggestion}
          onClick={() => onSuggestion(suggestion)}
          size="sm"
          variant="outline"
        >
          {suggestion}
        </Button>
      ))}
    </div>
  </div>
);

interface RickChatSheetProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  userId: string;
}

/**
 * Inner chrome shown while the agent connection suspends (`useAgent` uses
 * React 19 `use()`). It lives inside the same `SheetContent` as the chat, so
 * the drawer slides in once and only its body swaps when connected.
 *
 * @see https://react.dev/reference/react/use
 */
const RickChatSheetFallback = () => (
  <>
    <SheetHeader className="flex-row items-center gap-3 border-b px-4 py-3 pr-12">
      <img alt="" className="size-10 rounded-full" src="/rick-avatar.svg" />
      <div className="flex flex-1 flex-col">
        <SheetTitle className="text-base">Rick</SheetTitle>
        <SheetDescription className="text-xs">Connecting…</SheetDescription>
      </div>
    </SheetHeader>
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="text-muted-foreground" />
    </div>
  </>
);

const RickChatSession = ({ userId }: { userId: string }) => {
  const [input, setInput] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeParams = useRouterState({
    select: (state) => state.matches.at(-1)?.params,
  });
  const agent = useAgent({ agent: "rick-agent", name: userId });
  const {
    addToolApprovalResponse,
    clearHistory,
    connectionError,
    error,
    isStreaming,
    messages,
    sendMessage,
    status,
    stop,
  } = useAgentChat({
    agent,
    body: () => ({
      pageTitle: document.title,
      params: routeParams ?? {},
      pathname,
    }),
  });

  const partCount = messages.reduce(
    (total, message) => total + message.parts.length,
    0
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [partCount, isStreaming]);

  const handleFilesSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const selected = [...(event.target.files ?? [])];
    event.target.value = "";

    if (selected.length === 0) {
      return;
    }

    const capacity = MAX_FILES_PER_MESSAGE - pendingFiles.length;

    if (selected.length > capacity) {
      toast.error(`Attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
    }

    setIsPreparing(true);

    const results = await Promise.all(
      selected.slice(0, capacity).map((file) => prepareAttachmentSafely(file))
    );
    const prepared = results.filter((file): file is File => file !== null);

    setIsPreparing(false);
    setPendingFiles((current) => [...current, ...prepared]);
  };

  const submit = async (): Promise<void> => {
    const text = input.trim();

    if ((!text && pendingFiles.length === 0) || isStreaming || isPreparing) {
      return;
    }

    let fileParts: FileUIPart[];

    try {
      fileParts = await Promise.all(
        pendingFiles.map((file) => fileToFileUIPart(file))
      );
    } catch {
      toast.error("Couldn't read an attachment. Please try again.");
      return;
    }

    setInput("");
    setPendingFiles([]);

    if (fileParts.length === 0) {
      void sendMessage({ text });
      return;
    }

    void sendMessage(text ? { files: fileParts, text } : { files: fileParts });
  };

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3 border-b px-4 py-3 pr-12">
        <img alt="" className="size-10 rounded-full" src="/rick-avatar.svg" />
        <div className="flex flex-1 flex-col">
          <SheetTitle className="text-base">Rick</SheetTitle>
          <SheetDescription className="text-xs">
            Your portal helper
          </SheetDescription>
        </div>
        <Button
          disabled={messages.length === 0}
          onClick={() => clearHistory()}
          size="sm"
          title="Start a new chat"
          variant="ghost"
        >
          <PlusIcon data-icon="inline-start" />
          New chat
        </Button>
      </SheetHeader>

      <div
        aria-live="polite"
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        role="log"
      >
        {messages.length === 0 ? (
          <EmptyState
            onSuggestion={(suggestion) => sendMessage({ text: suggestion })}
          />
        ) : (
          messages
            .filter((message) => message.parts.length > 0)
            .map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onApproval={(request) => {
                  void addToolApprovalResponse(request);
                }}
              />
            ))
        )}
        {status === "submitted" && !isStreaming ? (
          <p className="text-muted-foreground text-xs">Rick is thinking…</p>
        ) : null}
        {error && !isHarmlessContinuationError(error) ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {error.message ||
              "Rick hit an error. Please try again in a moment."}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {connectionError ? (
        <p className="border-t px-4 py-2 text-destructive text-xs">
          Rick is offline. Close and reopen the chat to reconnect.
        </p>
      ) : null}

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {pendingFiles.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {pendingFiles.map((file) => (
              <PendingAttachment
                file={file}
                key={`${file.name}-${file.lastModified}-${file.size}`}
                onRemove={() =>
                  setPendingFiles((current) =>
                    current.filter((item) => item !== file)
                  )
                }
              />
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            multiple
            onChange={(event) => {
              void handleFilesSelected(event);
            }}
            ref={fileInputRef}
            type="file"
          />
          <input
            accept={CAMERA_ACCEPT}
            capture="environment"
            className="hidden"
            onChange={(event) => {
              void handleFilesSelected(event);
            }}
            ref={cameraInputRef}
            type="file"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Add an attachment"
                disabled={
                  isStreaming ||
                  isPreparing ||
                  pendingFiles.length >= MAX_FILES_PER_MESSAGE
                }
                size="icon"
                type="button"
                variant="outline"
              >
                {isPreparing ? <Spinner /> : <PaperclipIcon />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem
                onSelect={() => {
                  fileInputRef.current?.click();
                }}
              >
                <PaperclipIcon />
                Attach a file
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  cameraInputRef.current?.click();
                }}
              >
                <CameraIcon />
                Take a photo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Textarea
            autoFocus
            className="max-h-32 min-h-10 flex-1 resize-none"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask Rick anything…"
            rows={1}
            value={input}
          />
          {isStreaming ? (
            <Button
              aria-label="Stop Rick"
              onClick={() => {
                void stop();
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <StopCircleIcon />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              disabled={
                (!input.trim() && pendingFiles.length === 0) || isPreparing
              }
              size="icon"
              type="submit"
            >
              <PaperPlaneRightIcon />
            </Button>
          )}
        </div>
      </form>
    </>
  );
};

const EXPANDED_STORAGE_KEY = "rick-chat-expanded";

const readExpandedPreference = (): boolean => {
  try {
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

/**
 * Stable sheet shell: the drawer mounts once, and only its body swaps between
 * the connecting fallback and the live chat session. The header toggle widens
 * the sheet to the full viewport; the choice persists across opens.
 */
export const RickChatSheet = ({
  onOpenChange,
  open,
  userId,
}: RickChatSheetProps) => {
  const [isExpanded, setIsExpanded] = useState(readExpandedPreference);

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPANDED_STORAGE_KEY, String(isExpanded));
    } catch {
      // The preference just won't persist (e.g. storage disabled).
    }
  }, [isExpanded]);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          // The sheet's own widths use the `data-[side=right]:` variant, so
          // ours must match that variant to win the specificity contest.
          isExpanded &&
            "data-[side=right]:w-full data-[side=right]:sm:max-w-none"
        )}
        side="right"
      >
        <button
          aria-label={isExpanded ? "Collapse chat" : "Expand chat"}
          className="absolute top-1/2 left-0 z-10 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-full border-border border-y border-r bg-background/80 text-muted-foreground/60 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
          onClick={() => setIsExpanded((current) => !current)}
          title={isExpanded ? "Collapse chat" : "Expand chat"}
          type="button"
        >
          {isExpanded ? (
            <CaretRightIcon className="size-3.5" />
          ) : (
            <CaretLeftIcon className="size-3.5" />
          )}
        </button>
        <Suspense fallback={<RickChatSheetFallback />}>
          <RickChatSession userId={userId} />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
};
