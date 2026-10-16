import { afterEach, describe, expect, it, vi } from "vitest";

import { clearExchangeOAuthCache } from "~/lib/exchange-oauth";
import {
  SHAREPOINT_ORDER_OF_SERVICE_FOLDER_ID,
  SHAREPOINT_SITE_ID,
  buildSharePointCreateYearFolderBody,
  buildSharePointCreateYearFolderUrl,
  buildSharePointUploadUrl,
  buildSharePointYearFolderUrl,
  canUploadOrderToSharePoint,
  getSharePointPdfFilename,
  getSharePointServiceYear,
  uploadOrderPdfToSharePoint,
} from "~/lib/sharepoint-upload";

const CREDENTIALS = {
  clientId: "graph-client-id",
  clientSecret: "graph-secret-value",
  tenantId: "graph-tenant-id",
};
const PDF_BYTES = new TextEncoder().encode("%PDF-test-bytes");
const WEB_URL =
  "https://fresnovictory.sharepoint.com/sites/VictoryBaptistChurchofFresno/Shared%20Documents/Media%20Ministry/Order%20of%20Service/2026/2026-10-11%20-%20Sunday%20Order.pdf";

interface GraphStubOptions {
  createFolderStatus?: number;
  folderStatus?: number;
  tokenStatus?: number;
  uploadStatus?: number;
}

const stubGraphFetch = (options: GraphStubOptions = {}) => {
  const {
    createFolderStatus = 201,
    folderStatus = 200,
    tokenStatus = 200,
    uploadStatus = 201,
  } = options;
  const fetchMock = vi.fn(
    (url: string, init?: RequestInit): Promise<Response> => {
      let response: Response;

      if (url.includes("login.microsoftonline.com")) {
        response =
          tokenStatus === 200
            ? Response.json({ access_token: "graph-token", expires_in: 3599 })
            : Response.json(
                { error: "invalid_client" },
                { status: tokenStatus }
              );
      } else if (init?.method === "POST" && url.endsWith("/children")) {
        response = Response.json(
          { id: "year-folder-id" },
          { status: createFolderStatus }
        );
      } else if (init?.method === "PUT") {
        response = Response.json({ webUrl: WEB_URL }, { status: uploadStatus });
      } else {
        response = Response.json(
          folderStatus === 200
            ? { id: "year-folder-id" }
            : { error: "missing" },
          { status: folderStatus }
        );
      }

      return Promise.resolve(response);
    }
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
};

const uploadInput = {
  credentials: CREDENTIALS,
  filename: "2026-10-11 - Sunday Order.pdf",
  pdfBytes: PDF_BYTES,
  serviceDate: "2026-10-11",
};

afterEach(() => {
  clearExchangeOAuthCache();
  vi.unstubAllGlobals();
});

describe("sharepoint upload builders", () => {
  it("derives the year from the service date, not the publish date", () => {
    expect(getSharePointServiceYear("2026-10-11")).toBe("2026");
    expect(getSharePointServiceYear("2027-01-03")).toBe("2027");
  });

  it("takes the filename from the PDF object key basename", () => {
    expect(
      getSharePointPdfFilename("oos/order-id/2026-10-11 - Sunday Order.pdf")
    ).toBe("2026-10-11 - Sunday Order.pdf");
  });

  it("builds URL-encoded Graph URLs for the verified site and folders", () => {
    expect(SHAREPOINT_SITE_ID).toBe(
      "fresnovictory.sharepoint.com,7d2fd6e8-677b-4467-ab21-6ed9a880ef8e,8da1d638-f1c3-402b-ba30-8308f6f34aba"
    );
    expect(buildSharePointYearFolderUrl("2026")).toBe(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/root:/Media%20Ministry/Order%20of%20Service/2026`
    );
    expect(
      buildSharePointUploadUrl("2026", "2026-10-11 - Sunday Order.pdf")
    ).toBe(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/root:/Media%20Ministry/Order%20of%20Service/2026/2026-10-11%20-%20Sunday%20Order.pdf:/content`
    );
    expect(buildSharePointCreateYearFolderUrl()).toBe(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/items/${SHAREPOINT_ORDER_OF_SERVICE_FOLDER_ID}/children`
    );
    expect(SHAREPOINT_ORDER_OF_SERVICE_FOLDER_ID).toBe(
      "01HGAI5WIBGFJTQZH2BFF2ORTPIMT3FJM4"
    );
  });

  it("builds the create-folder body with fail conflict behavior", () => {
    expect(buildSharePointCreateYearFolderBody("2027")).toEqual({
      "@microsoft.graph.conflictBehavior": "fail",
      folder: {},
      name: "2027",
    });
  });
});

describe("canUploadOrderToSharePoint", () => {
  it("allows published orders with a PDF that were not uploaded yet", () => {
    expect(
      canUploadOrderToSharePoint({
        pdfObjectKey: "oos/id/2026-10-15 - Thursday Order of Service.pdf",
        status: "Published",
      })
    ).toBe(true);
  });

  it("hides the action once the uploaded flag is set", () => {
    expect(
      canUploadOrderToSharePoint({
        pdfObjectKey: "oos/id/2026-10-15 - Thursday Order of Service.pdf",
        sharepointUploadedAt: "2026-10-16T00:00:00.000Z",
        status: "Published",
      })
    ).toBe(false);
  });

  it("does not allow planning orders or orders without a PDF", () => {
    expect(
      canUploadOrderToSharePoint({
        pdfObjectKey: "oos/id/file.pdf",
        status: "Planning",
      })
    ).toBe(false);
    expect(canUploadOrderToSharePoint({ status: "Published" })).toBe(false);
  });
});

describe("uploadOrderPdfToSharePoint", () => {
  it("uploads the PDF when the year folder already exists", async () => {
    const fetchMock = stubGraphFetch();

    const result = await uploadOrderPdfToSharePoint(uploadInput);

    expect(result).toEqual({ uploaded: true, webUrl: WEB_URL });
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls).toHaveLength(3);
    expect(calls[1][0]).toBe(buildSharePointYearFolderUrl("2026"));
    expect(calls[2][0]).toBe(
      buildSharePointUploadUrl("2026", "2026-10-11 - Sunday Order.pdf")
    );
    expect(calls[2][1].method).toBe("PUT");
    expect(calls[2][1].body).toBe(PDF_BYTES);
    const headers = calls[2][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer graph-token");
    expect(headers["Content-Type"]).toBe("application/pdf");
  });

  it("creates the year folder on a 404, then uploads", async () => {
    const fetchMock = stubGraphFetch({ folderStatus: 404 });

    const result = await uploadOrderPdfToSharePoint({
      ...uploadInput,
      filename: "2027-01-03 - Sunday Order.pdf",
      serviceDate: "2027-01-03",
    });

    expect(result).toEqual({ uploaded: true, webUrl: WEB_URL });
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls).toHaveLength(4);
    expect(calls[2][0]).toBe(buildSharePointCreateYearFolderUrl());
    expect(calls[2][1].method).toBe("POST");
    expect(JSON.parse(calls[2][1].body as string)).toEqual({
      "@microsoft.graph.conflictBehavior": "fail",
      folder: {},
      name: "2027",
    });
    expect(calls[3][1].method).toBe("PUT");
  });

  it("treats a 409 from folder creation as already existing", async () => {
    stubGraphFetch({ createFolderStatus: 409, folderStatus: 404 });

    await expect(uploadOrderPdfToSharePoint(uploadInput)).resolves.toEqual({
      uploaded: true,
      webUrl: WEB_URL,
    });
  });

  it("reports not-configured without calling fetch when secrets are absent", async () => {
    const fetchMock = stubGraphFetch();

    await expect(
      uploadOrderPdfToSharePoint({ ...uploadInput, credentials: null })
    ).resolves.toEqual({ reason: "not-configured", uploaded: false });
    await expect(
      uploadOrderPdfToSharePoint({
        ...uploadInput,
        credentials: { ...CREDENTIALS, clientSecret: "  " },
      })
    ).resolves.toEqual({ reason: "not-configured", uploaded: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports auth-failed when Entra rejects the token request", async () => {
    stubGraphFetch({ tokenStatus: 401 });

    await expect(uploadOrderPdfToSharePoint(uploadInput)).resolves.toEqual({
      reason: "auth-failed",
      uploaded: false,
    });
  });

  it("reports folder-failed when the folder lookup fails", async () => {
    stubGraphFetch({ folderStatus: 500 });

    await expect(uploadOrderPdfToSharePoint(uploadInput)).resolves.toEqual({
      reason: "folder-failed",
      uploaded: false,
    });
  });

  it("reports upload-failed when the PUT fails", async () => {
    stubGraphFetch({ uploadStatus: 500 });

    await expect(uploadOrderPdfToSharePoint(uploadInput)).resolves.toEqual({
      reason: "upload-failed",
      uploaded: false,
    });
  });
});
