import { describe, expect, it } from "vitest";

import { authenticateMcpRequest, McpAuthError } from "~/mcp/auth";
import { requireMcpPermission } from "~/mcp/permissions";

describe("authenticateMcpRequest", () => {
  it("allows open access when MCP_API_TOKEN is unset", () => {
    const caller = authenticateMcpRequest(
      new Request("http://localhost/mcp"),
      {}
    );

    expect(caller.mode).toBe("dev-open");
    expect(caller.permissions).toEqual({ "*": ["*"] });
  });

  it("rejects missing bearer when token is configured", () => {
    expect(() =>
      authenticateMcpRequest(new Request("http://localhost/mcp"), {
        MCP_API_TOKEN: "secret",
      })
    ).toThrow(McpAuthError);
  });

  it("rejects an incorrect bearer token", () => {
    expect(() =>
      authenticateMcpRequest(
        new Request("http://localhost/mcp", {
          headers: { Authorization: "Bearer wrong" },
        }),
        { MCP_API_TOKEN: "secret" }
      )
    ).toThrow(/Invalid MCP API token/u);
  });

  it("accepts a matching bearer token", () => {
    const caller = authenticateMcpRequest(
      new Request("http://localhost/mcp", {
        headers: { Authorization: "Bearer secret" },
      }),
      { MCP_API_TOKEN: "secret" }
    );

    expect(caller.mode).toBe("bearer");
    expect(caller.subject).toBe("mcp-bearer");
  });
});

describe("requireMcpPermission", () => {
  it("allows wildcard callers", () => {
    expect(() =>
      requireMcpPermission(
        {
          mode: "bearer",
          permissions: { "*": ["*"] },
          subject: "x",
        },
        "orders",
        "view"
      )
    ).not.toThrow();
  });

  it("rejects missing resource permissions", () => {
    expect(() =>
      requireMcpPermission(
        {
          mode: "bearer",
          permissions: { hymns: ["view"] },
          subject: "x",
        },
        "orders",
        "view"
      )
    ).toThrow(/Permission denied/u);
  });
});
