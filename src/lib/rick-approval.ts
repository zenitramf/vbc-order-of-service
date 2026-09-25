/**
 * Which Rick tool calls need explicit in-chat approval before they run.
 *
 * Reads (`get_*`, `list_*`) run freely. Anything that can change portal data
 * asks first. `publish_order` and `send_order_email` are previews when
 * `dry_run` is true, so only a real send/publish needs approval.
 *
 * The agent passes this to the AI SDK's `needsApproval`; unit tests pin the
 * classification so a new mutating tool cannot silently bypass the prompt.
 */

const MUTATING_PREFIXES = [
  "add_",
  "create_",
  "delete_",
  "remove_",
  "save_",
  "update_",
] as const;

const ALWAYS_APPROVAL_TOOLS = new Set(["plan_month"]);

const DRY_RUN_CONDITIONAL_TOOLS = new Set([
  "publish_order",
  "send_order_email",
]);

const isDryRun = (input: unknown): boolean =>
  typeof input === "object" &&
  input !== null &&
  (input as { dry_run?: unknown }).dry_run === true;

export const requiresRickApproval = (
  toolName: string,
  input: unknown
): boolean => {
  if (MUTATING_PREFIXES.some((prefix) => toolName.startsWith(prefix))) {
    return true;
  }

  if (ALWAYS_APPROVAL_TOOLS.has(toolName)) {
    return true;
  }

  if (DRY_RUN_CONDITIONAL_TOOLS.has(toolName)) {
    return !isDryRun(input);
  }

  return false;
};
