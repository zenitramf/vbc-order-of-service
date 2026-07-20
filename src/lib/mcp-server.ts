import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getAppDb } from "~/db/client";
import { roles, user } from "~/db/schema";
import type { RolePermissions } from "~/lib/admin-permissions";
import { hasPermission, parsePermissions } from "~/lib/admin-permissions";
import { resolveApiKey } from "~/lib/api-key-data";
import { isSupportedMusicKey } from "~/lib/music-keys";
import {
  addMemberToTeam,
  createOrder,
  deleteHymn,
  deleteOrder,
  deleteTeam,
  deleteTeamMember,
  deleteTemplate,
  getDashboardData,
  getEmailSettings,
  getHymn,
  getHymnFileDownload,
  getHymnFiles,
  getHymns,
  getMonthPlan,
  getMonthPlanningSettings,
  getOrder,
  getOrderEmailDelivery,
  getOrders,
  getPublishedOrderPdf,
  getReferenceData,
  getTeam,
  getTeamMember,
  getTeamMembers,
  getTeamTemplates,
  getTeams,
  getTemplate,
  getTemplates,
  planMonth,
  publishOrder,
  removeMemberFromTeam,
  saveHymn,
  saveMonthPlanningSettings,
  saveMonthSchedule,
  saveOrder,
  saveTeam,
  saveTeamMember,
  saveTemplate,
  sendOrderEmail,
} from "~/lib/order-service-data";

interface McpContext {
  permissions: RolePermissions;
  userId: string;
}

const callServerFn = async (fn: unknown, data?: unknown): Promise<unknown> =>
  await (fn as (input?: { data?: unknown }) => Promise<unknown>)(
    data === undefined ? undefined : { data }
  );

const jsonResult = (value: unknown) => ({
  content: [{ text: JSON.stringify(value), type: "text" as const }],
});

const errorResult = (error: unknown) => ({
  content: [
    {
      text: error instanceof Error ? error.message : "MCP operation failed.",
      type: "text" as const,
    },
  ],
  isError: true,
});

const input = z.object({}).passthrough();
const idInput = z.object({ id: z.string().min(1) });
const monthInput = z.object({ month: z.string().optional() });
const emailInput = z.object({
  dry_run: z.boolean().default(false),
  orderId: z.string().min(1),
});
const publishInput = z.object({
  dry_run: z.boolean().default(false),
  id: z.string().min(1),
});
const orderActivityInput = z.object({
  activityName: z.string(),
  activityType: z.string(),
  hymnId: z.string().optional(),
  id: z.string(),
  notes: z.string().optional(),
});
const teamAssignmentInput = z.object({
  memberIds: z.array(z.string()),
  teamId: z.string(),
});
const serviceCardInput = z.object({
  activities: z.array(orderActivityInput),
  id: z.string(),
  optionalTeamIds: z.array(z.string()).optional(),
  requiredTeamCounts: z.record(z.string(), z.number()).optional(),
  requiredTeamIds: z.array(z.string()).optional(),
  teamAssignments: z.array(teamAssignmentInput).optional(),
  typeName: z.string(),
});
const orderTemplateInput = z.object({
  name: z.string(),
  service_type: z.array(serviceCardInput),
});
const createOrderInput = z.object({
  serviceDate: z.string(),
  templateId: z.string(),
  title: z.string(),
});
const saveOrderInput = z.object({
  id: z.string(),
  order: orderTemplateInput,
  serviceDate: z.string(),
  serviceTypeId: z.string(),
  title: z.string(),
});
const saveTemplateInput = z.object({
  id: z.string().optional(),
  name: z.string(),
  template: orderTemplateInput,
});
const saveHymnInput = z.object({
  hymnNumber: z.string(),
  id: z.string().optional(),
  lastPlayed: z.string(),
  lyricsMarkdown: z.string(),
  musicKey: z.string(),
  name: z.string(),
  sourceId: z.string(),
});
const saveTeamInput = z.object({
  id: z.string().optional(),
  name: z.string(),
  parentTeamId: z.string().optional(),
});
const saveTeamMemberInput = z.object({
  email: z.string(),
  firstName: z.string(),
  id: z.string().optional(),
  lastName: z.string(),
  notes: z.string(),
  phone: z.string(),
  teamIds: z.array(z.string()),
});
const saveMonthScheduleInput = z.object({
  assignments: z.array(
    z.object({
      cardId: z.string(),
      memberIds: z.array(z.string()),
      orderId: z.string(),
    })
  ),
  teamId: z.string(),
});
const saveMonthPlanningSettingsInput = z.object({
  prepopulateDays: z.array(
    z.object({
      defaultTitle: z.string(),
      templateId: z.string(),
      weekday: z.number().int().min(0).max(6),
    })
  ),
});

const getCaller = async (request: Request): Promise<McpContext | Response> => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^(?<scheme>Bearer)\s+(?<token>.+)$/iu.exec(authorization);

  if (!match?.groups?.token) {
    return new Response("Missing Bearer API key.", {
      headers: { "WWW-Authenticate": "Bearer" },
      status: 401,
    });
  }

  const key = await resolveApiKey(match.groups.token);

  if (!key) {
    return new Response("Invalid API key.", {
      headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
      status: 401,
    });
  }

  const db = getAppDb();
  const row = await db
    .select({ permissions: roles.permissions, role: user.role })
    .from(user)
    .leftJoin(roles, eq(user.role, roles.id))
    .where(eq(user.id, key.userId))
    .get();

  return {
    permissions:
      row?.role === "admin"
        ? { "*": ["*"] }
        : parsePermissions(row?.permissions ?? "{}"),
    userId: key.userId,
  };
};

const requirePermission = (
  context: McpContext,
  resource: string,
  action: string
) => {
  if (!hasPermission(context.permissions, resource, action)) {
    throw new Error(`Permission required: ${resource}:${action}.`);
  }
};

const createMcpServer = (context: McpContext): McpServer => {
  const server = new McpServer({
    name: "vbc-order-of-service",
    version: "1.0.0",
  });

  const register = (
    name: string,
    description: string,
    schema: z.ZodType,
    resource: string,
    action: string,
    handler: (data: Record<string, unknown>) => Promise<unknown>
  ) => {
    server.registerTool(
      name,
      { description, inputSchema: schema },
      async (data) => {
        try {
          requirePermission(context, resource, action);
          return jsonResult(await handler(data as Record<string, unknown>));
        } catch (error) {
          return errorResult(error);
        }
      }
    );
  };

  register(
    "get_reference_data",
    "Get service, activity, and hymn reference data.",
    input,
    "orders",
    "view",
    () => callServerFn(getReferenceData)
  );
  register(
    "get_dashboard",
    "Get dashboard counts and upcoming orders.",
    input,
    "orders",
    "view",
    () => callServerFn(getDashboardData)
  );
  register(
    "list_orders",
    "List all orders of service.",
    input,
    "orders",
    "view",
    () => callServerFn(getOrders)
  );
  register(
    "get_order",
    "Get a complete order of service.",
    idInput,
    "orders",
    "view",
    (data) => callServerFn(getOrder, data.id)
  );
  register(
    "create_order",
    "Create an order from a template.",
    createOrderInput,
    "orders",
    "create",
    (data) => callServerFn(createOrder, data)
  );
  register(
    "update_order",
    "Update and normalize an order.",
    saveOrderInput,
    "orders",
    "update",
    (data) => callServerFn(saveOrder, data)
  );
  register(
    "delete_order",
    "Delete an order and its hymn-play records.",
    idInput,
    "orders",
    "delete",
    (data) => callServerFn(deleteOrder, data.id)
  );
  register(
    "publish_order",
    "Validate or publish an order and render its PDF.",
    publishInput,
    "orders",
    "publish",
    (data) =>
      callServerFn(publishOrder, {
        dryRun: data.dry_run,
        id: data.id,
      })
  );
  register(
    "send_order_email",
    "Validate or queue the published order PDF email.",
    emailInput,
    "orders",
    "send_email",
    async (data) => {
      const order = (await callServerFn(getOrder, data.orderId)) as Awaited<
        ReturnType<typeof getOrder>
      >;
      if (!order || order.status !== "Published" || !order.pdfObjectKey) {
        throw new Error("Publish and save the order PDF before sending email.");
      }
      const settings = (await callServerFn(getEmailSettings)) as Awaited<
        ReturnType<typeof getEmailSettings>
      >;
      if (data.dry_run) {
        await callServerFn(getPublishedOrderPdf, data.orderId);
        return {
          dry_run: true,
          recipients: settings.recipients,
          valid: settings.recipients.length > 0,
        };
      }
      return callServerFn(sendOrderEmail, data.orderId);
    }
  );
  register(
    "get_order_email_delivery",
    "Get order email delivery status.",
    z.object({ orderId: z.string().min(1) }),
    "orders",
    "view",
    (data) => callServerFn(getOrderEmailDelivery, data.orderId)
  );

  register(
    "list_templates",
    "List order templates.",
    input,
    "templates",
    "view",
    () => callServerFn(getTemplates)
  );
  register(
    "get_template",
    "Get an order template.",
    idInput,
    "templates",
    "view",
    (data) => callServerFn(getTemplate, data.id)
  );
  register(
    "save_template",
    "Create or update an order template.",
    saveTemplateInput,
    "templates",
    "update",
    (data) => callServerFn(saveTemplate, data)
  );
  register(
    "delete_template",
    "Delete an unused order template.",
    idInput,
    "templates",
    "delete",
    (data) => callServerFn(deleteTemplate, data.id)
  );

  register(
    "get_month_plan",
    "Get a month plan and staffing schedule.",
    monthInput,
    "orders",
    "view",
    (data) => callServerFn(getMonthPlan, data.month)
  );
  register(
    "plan_month",
    "Create missing orders for configured month dates.",
    z.object({ month: z.string().min(1) }),
    "orders",
    "create",
    (data) => callServerFn(planMonth, data)
  );
  register(
    "save_month_schedule",
    "Save staffing assignments for a month.",
    saveMonthScheduleInput,
    "orders",
    "update",
    (data) => callServerFn(saveMonthSchedule, data)
  );
  register(
    "get_month_planning_settings",
    "Get Month Planner settings.",
    input,
    "orders",
    "view",
    () => callServerFn(getMonthPlanningSettings)
  );
  register(
    "save_month_planning_settings",
    "Save Month Planner settings.",
    saveMonthPlanningSettingsInput,
    "orders",
    "update",
    (data) => callServerFn(saveMonthPlanningSettings, data)
  );

  register(
    "list_hymns",
    "List hymns including play statistics.",
    input,
    "hymns",
    "view",
    () => callServerFn(getHymns)
  );
  register(
    "get_hymn",
    "Get a hymn including lyrics and key.",
    idInput,
    "hymns",
    "view",
    (data) => callServerFn(getHymn, data.id)
  );
  register(
    "save_hymn",
    "Create or update hymn metadata.",
    saveHymnInput,
    "hymns",
    "update",
    (data) => callServerFn(saveHymn, data)
  );
  register(
    "update_hymn",
    "Partially update hymn lyrics or key.",
    z.object({
      id: z.string().min(1),
      key: z.string().optional(),
      lyrics: z.string().optional(),
    }),
    "hymns",
    "update",
    async (data) => {
      const current = (await callServerFn(getHymn, data.id)) as Awaited<
        ReturnType<typeof getHymn>
      >;
      if (!current) {
        throw new Error("Hymn not found.");
      }
      if (data.key !== undefined && !isSupportedMusicKey(data.key as string)) {
        throw new Error(
          "Key must be one of the supported Circle of Fifths values."
        );
      }
      return callServerFn(saveHymn, {
        hymnNumber: current.hymnNumber,
        id: current.id,
        lastPlayed: current.lastPlayed,
        lyricsMarkdown: data.lyrics ?? current.lyricsMarkdown,
        musicKey: data.key ?? current.musicKey,
        name: current.name,
        sourceId: current.sourceId,
      });
    }
  );
  register(
    "delete_hymn",
    "Delete a hymn.",
    idInput,
    "hymns",
    "delete",
    (data) => callServerFn(deleteHymn, data.id)
  );
  register(
    "list_hymn_files",
    "List files attached to a hymn.",
    z.object({ hymnId: z.string().min(1) }),
    "hymns",
    "view",
    (data) => callServerFn(getHymnFiles, data.hymnId)
  );
  register(
    "get_hymn_file",
    "Get hymn file metadata.",
    idInput,
    "hymns",
    "view",
    (data) => callServerFn(getHymnFileDownload, data.id)
  );

  register("list_teams", "List teams.", input, "teams", "view", () =>
    callServerFn(getTeams)
  );
  register(
    "get_team",
    "Get a team and members.",
    idInput,
    "teams",
    "view",
    (data) => callServerFn(getTeam, data.id)
  );
  register(
    "save_team",
    "Create or update a team.",
    saveTeamInput,
    "teams",
    "update",
    (data) => callServerFn(saveTeam, data)
  );
  register(
    "delete_team",
    "Delete an unreferenced team.",
    idInput,
    "teams",
    "delete",
    (data) => callServerFn(deleteTeam, data.id)
  );
  register(
    "get_team_templates",
    "List templates using a team.",
    z.object({ teamId: z.string().min(1) }),
    "teams",
    "view",
    (data) => callServerFn(getTeamTemplates, data.teamId)
  );
  register(
    "list_team_members",
    "List team members.",
    input,
    "members",
    "view",
    () => callServerFn(getTeamMembers)
  );
  register(
    "get_team_member",
    "Get a team member.",
    idInput,
    "members",
    "view",
    (data) => callServerFn(getTeamMember, data.id)
  );
  register(
    "save_team_member",
    "Create or update a team member.",
    saveTeamMemberInput,
    "members",
    "update",
    (data) => callServerFn(saveTeamMember, data)
  );
  register(
    "delete_team_member",
    "Delete a team member.",
    idInput,
    "members",
    "delete",
    (data) => callServerFn(deleteTeamMember, data.id)
  );
  register(
    "add_member_to_team",
    "Add a member to a team.",
    z.object({ memberId: z.string().min(1), teamId: z.string().min(1) }),
    "members",
    "update",
    (data) => callServerFn(addMemberToTeam, data)
  );
  register(
    "remove_member_from_team",
    "Remove a member from a team.",
    z.object({ memberId: z.string().min(1), teamId: z.string().min(1) }),
    "members",
    "update",
    (data) => callServerFn(removeMemberFromTeam, data)
  );

  server.registerResource(
    "order-pdf",
    new ResourceTemplate("order-pdf://{orderId}", { list: undefined }),
    { description: "Published order PDF", mimeType: "application/pdf" },
    async (uri, variables) => {
      const orderId = String(variables.orderId);
      requirePermission(context, "orders", "view");
      const result = (await callServerFn(getPublishedOrderPdf, orderId)) as {
        base64: string;
        filename: string;
      };
      return {
        contents: [
          { blob: result.base64, mimeType: "application/pdf", uri: uri.href },
        ],
      };
    }
  );

  server.registerResource(
    "hymn-file",
    new ResourceTemplate("hymn-file://{fileId}", { list: undefined }),
    { description: "Hymn file", mimeType: "application/octet-stream" },
    async (uri, variables) => {
      requirePermission(context, "hymns", "view");
      const result = (await callServerFn(
        getHymnFileDownload,
        String(variables.fileId)
      )) as { base64: string; contentType: string };
      return {
        contents: [
          { blob: result.base64, mimeType: result.contentType, uri: uri.href },
        ],
      };
    }
  );

  return server;
};

export const handleMcpRequest = async (request: Request): Promise<Response> => {
  const caller = await getCaller(request);

  if (caller instanceof Response) {
    return caller;
  }

  const server = createMcpServer(caller);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
};
