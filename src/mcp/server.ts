import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  getDashboardData,
  getHymn,
  getHymnOptions,
  getHymns,
  getMonthPlan,
  getMonthPlanningSettings,
  getOrder,
  getOrders,
  getPublishReadiness,
  getReferenceData,
  getTeam,
  getTeamMember,
  getTeamMembers,
  getTeams,
  getTemplate,
  getTemplates,
} from "~/lib/order-service-data";
import type { McpCaller } from "~/mcp/auth";
import { requireMcpPermission } from "~/mcp/permissions";
import { jsonToolResult, withToolErrors } from "~/mcp/response";

const textResource = (uri: string, value: unknown) => ({
  contents: [
    {
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2),
      uri,
    },
  ],
});

/**
 * Build a fresh McpServer for one request (MCP SDK ≥ 1.26 requires this for
 * stateless Workers to avoid cross-client response leakage).
 */
export const createVbcMcpServer = (caller: McpCaller): McpServer => {
  const server = new McpServer({
    name: "vbc-order-of-service",
    version: "0.1.0",
  });

  server.registerTool(
    "get_dashboard",
    {
      description:
        "Dashboard summary: upcoming/previous orders, counts, and next Sunday.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "orders", "view");
        return jsonToolResult(await getDashboardData());
      })
  );

  server.registerTool(
    "list_orders",
    {
      description: "List all orders of service (newest service date first).",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "orders", "view");
        return jsonToolResult(await getOrders());
      })
  );

  server.registerTool(
    "get_order",
    {
      description: "Get one order of service including full order JSON.",
      inputSchema: {
        orderId: z.string().min(1).describe("Order of service id"),
      },
    },
    ({ orderId }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "orders", "view");
        const order = await getOrder({ data: orderId });

        if (!order) {
          throw new Error(`Order not found: ${orderId}`);
        }

        return jsonToolResult(order);
      })
  );

  server.registerTool(
    "check_publish_readiness",
    {
      description:
        "Report whether an order can be published: missing hymns and unstaffed required teams. Does not call CraftMyPDF or send email.",
      inputSchema: {
        orderId: z.string().min(1).describe("Order of service id"),
      },
    },
    ({ orderId }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "orders", "view");
        return jsonToolResult(await getPublishReadiness({ data: orderId }));
      })
  );

  server.registerTool(
    "list_templates",
    {
      description: "List reusable order-of-service templates.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "templates", "view");
        return jsonToolResult(await getTemplates());
      })
  );

  server.registerTool(
    "get_template",
    {
      description: "Get one template including full template JSON.",
      inputSchema: {
        templateId: z.string().min(1).describe("Template id"),
      },
    },
    ({ templateId }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "templates", "view");
        const template = await getTemplate({ data: templateId });

        if (!template) {
          throw new Error(`Template not found: ${templateId}`);
        }

        return jsonToolResult(template);
      })
  );

  server.registerTool(
    "get_month_plan",
    {
      description:
        "Load the month planner for YYYY-MM. Defaults to a non-mutating peek (autoCreate=false). Pass autoCreate=true to create missing configured orders.",
      inputSchema: {
        autoCreate: z
          .boolean()
          .optional()
          .describe(
            "When true, create missing orders for configured weekdays. Default false for MCP."
          ),
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/u)
          .optional()
          .describe("Month as YYYY-MM; defaults to current month"),
      },
    },
    ({ autoCreate, month }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "orders", "view");
        return jsonToolResult(
          await getMonthPlan({
            data: {
              autoCreate: autoCreate ?? false,
              month: month ?? "",
            },
          })
        );
      })
  );

  server.registerTool(
    "list_hymns",
    {
      description:
        "List hymns with music key, source, last played, and recent play count.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "hymns", "view");
        return jsonToolResult(await getHymns());
      })
  );

  server.registerTool(
    "list_hymn_options",
    {
      description: "Lightweight hymn picker options for drafting orders.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "hymns", "view");
        return jsonToolResult(await getHymnOptions());
      })
  );

  server.registerTool(
    "get_hymn",
    {
      description: "Get one hymn including Markdown lyrics.",
      inputSchema: {
        hymnId: z.string().min(1).describe("Hymn id"),
      },
    },
    ({ hymnId }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "hymns", "view");
        const hymn = await getHymn({ data: hymnId });

        if (!hymn) {
          throw new Error(`Hymn not found: ${hymnId}`);
        }

        return jsonToolResult(hymn);
      })
  );

  server.registerTool(
    "list_teams",
    {
      description: "List teams with parent and member counts.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "teams", "view");
        return jsonToolResult(await getTeams());
      })
  );

  server.registerTool(
    "get_team",
    {
      description: "Get one team and its members.",
      inputSchema: {
        teamId: z.string().min(1).describe("Team id"),
      },
    },
    ({ teamId }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "teams", "view");
        const team = await getTeam({ data: teamId });

        if (!team) {
          throw new Error(`Team not found: ${teamId}`);
        }

        return jsonToolResult(team);
      })
  );

  server.registerTool(
    "list_members",
    {
      description: "List team members with team memberships.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "members", "view");
        return jsonToolResult(await getTeamMembers());
      })
  );

  server.registerTool(
    "get_member",
    {
      description: "Get one team member.",
      inputSchema: {
        memberId: z.string().min(1).describe("Member id"),
      },
    },
    ({ memberId }) =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "members", "view");
        const member = await getTeamMember({ data: memberId });

        if (!member) {
          throw new Error(`Member not found: ${memberId}`);
        }

        return jsonToolResult(member);
      })
  );

  server.registerTool(
    "get_reference_data",
    {
      description:
        "Catalog of service types, activity types, and hymn sources.",
      inputSchema: {},
    },
    () =>
      withToolErrors(async () => {
        requireMcpPermission(caller, "orders", "view");
        return jsonToolResult(await getReferenceData());
      })
  );

  server.registerResource(
    "dashboard",
    "vbc://dashboard",
    {
      description: "Dashboard summary snapshot",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "orders", "view");
      return textResource(uri.href, await getDashboardData());
    }
  );

  server.registerResource(
    "reference",
    "vbc://reference",
    {
      description: "Reference catalogs",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "orders", "view");
      return textResource(uri.href, await getReferenceData());
    }
  );

  server.registerResource(
    "orders",
    "vbc://orders",
    {
      description: "All order summaries",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "orders", "view");
      return textResource(uri.href, await getOrders());
    }
  );

  server.registerResource(
    "order",
    new ResourceTemplate("vbc://orders/{orderId}", {
      list: undefined,
    }),
    {
      description: "Single order of service",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      requireMcpPermission(caller, "orders", "view");
      const orderId = String(variables.orderId ?? "");
      const order = await getOrder({ data: orderId });

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      return textResource(uri.href, order);
    }
  );

  server.registerResource(
    "templates",
    "vbc://templates",
    {
      description: "Template summaries",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "templates", "view");
      return textResource(uri.href, await getTemplates());
    }
  );

  server.registerResource(
    "template",
    new ResourceTemplate("vbc://templates/{templateId}", {
      list: undefined,
    }),
    {
      description: "Single template",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      requireMcpPermission(caller, "templates", "view");
      const templateId = String(variables.templateId ?? "");
      const template = await getTemplate({ data: templateId });

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      return textResource(uri.href, template);
    }
  );

  server.registerResource(
    "hymns",
    "vbc://hymns",
    {
      description: "Hymn library",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "hymns", "view");
      return textResource(uri.href, await getHymns());
    }
  );

  server.registerResource(
    "hymn",
    new ResourceTemplate("vbc://hymns/{hymnId}", {
      list: undefined,
    }),
    {
      description: "Single hymn",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      requireMcpPermission(caller, "hymns", "view");
      const hymnId = String(variables.hymnId ?? "");
      const hymn = await getHymn({ data: hymnId });

      if (!hymn) {
        throw new Error(`Hymn not found: ${hymnId}`);
      }

      return textResource(uri.href, hymn);
    }
  );

  server.registerResource(
    "teams",
    "vbc://teams",
    {
      description: "Teams list",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "teams", "view");
      return textResource(uri.href, await getTeams());
    }
  );

  server.registerResource(
    "members",
    "vbc://members",
    {
      description: "Team members list",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "members", "view");
      return textResource(uri.href, await getTeamMembers());
    }
  );

  server.registerResource(
    "planner-settings",
    "vbc://planner/settings",
    {
      description: "Month planning weekday/template settings",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpPermission(caller, "settings", "view");
      return textResource(uri.href, await getMonthPlanningSettings());
    }
  );

  server.registerResource(
    "planner-month",
    new ResourceTemplate("vbc://planner/{month}", {
      list: undefined,
    }),
    {
      description:
        "Month plan peek for YYYY-MM (never auto-creates orders via this resource)",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      requireMcpPermission(caller, "orders", "view");
      const month = String(variables.month ?? "");
      return textResource(
        uri.href,
        await getMonthPlan({
          data: { autoCreate: false, month },
        })
      );
    }
  );

  server.registerPrompt(
    "publish_readiness_check",
    {
      argsSchema: {
        orderId: z.string().describe("Order of service id to inspect"),
      },
      description:
        "Inspect an order for missing hymns and unstaffed required teams before publishing.",
    },
    ({ orderId }) => ({
      messages: [
        {
          content: {
            text: `Check publish readiness for order ${orderId}. Call check_publish_readiness with this orderId, then summarize blockers and what to fix. Do not publish or send email.`,
            type: "text",
          },
          role: "user",
        },
      ],
    })
  );

  server.registerPrompt(
    "hymn_rotation_suggestions",
    {
      argsSchema: {
        musicKey: z
          .string()
          .optional()
          .describe("Optional preferred music key filter"),
        theme: z
          .string()
          .optional()
          .describe("Optional theme or scripture focus"),
      },
      description:
        "Suggest hymns that avoid recently played ones for an order or service theme.",
    },
    ({ musicKey, theme }) => ({
      messages: [
        {
          content: {
            text: [
              "Suggest hymns for the next order of service.",
              "Use list_hymns (or list_hymn_options) and prefer lower timesPlayedLastSixMonths and older lastPlayed.",
              musicKey ? `Prefer music key: ${musicKey}.` : "",
              theme ? `Theme/context: ${theme}.` : "",
              "Return a short ranked list with hymn id, number, name, and why each fits. Do not mutate any data.",
            ]
              .filter(Boolean)
              .join(" "),
            type: "text",
          },
          role: "user",
        },
      ],
    })
  );

  server.registerPrompt(
    "month_staffing_review",
    {
      argsSchema: {
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/u)
          .describe("Month as YYYY-MM"),
      },
      description:
        "Review a month for missing orders and unstaffed required teams.",
    },
    ({ month }) => ({
      messages: [
        {
          content: {
            text: `Review month staffing for ${month}. Call get_month_plan with autoCreate=false, then check_publish_readiness for each planning order that has required teams. Summarize missing orders and unstaffed teams. Do not mutate data.`,
            type: "text",
          },
          role: "user",
        },
      ],
    })
  );

  return server;
};
