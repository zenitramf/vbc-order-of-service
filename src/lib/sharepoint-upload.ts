import { getMicrosoftGraphAccessToken } from "~/lib/exchange-oauth";
import type { ExchangeOAuthCredentials } from "~/lib/exchange-oauth";
import type { SharePointUploadResult } from "~/lib/order-service-types";

/**
 * Uploading a published order PDF to SharePoint via Microsoft Graph.
 *
 * Target: the VictoryBaptistChurchofFresno site's default drive (Documents /
 * Shared Documents), under `Media Ministry/Order of Service/<Year>/`, where
 * `<Year>` comes from the order's service date. Pure builders keep the URLs
 * and payloads covered by tests; the upload itself never throws because
 * publishing has already succeeded by the time it runs.
 */

export const SHAREPOINT_SITE_ID =
  "fresnovictory.sharepoint.com,7d2fd6e8-677b-4467-ab21-6ed9a880ef8e,8da1d638-f1c3-402b-ba30-8308f6f34aba";

/** Documents (Shared Documents), the site's default drive. */
export const SHAREPOINT_DRIVE_ID =
  "b!6NYvfXtnZ0SrIW7ZqIDvjjjWoY3D8StAujCDCPbzSrpmbW4Es7dHS4VtHxV0YMAh";

export const SHAREPOINT_MEDIA_MINISTRY_FOLDER_ID =
  "01HGAI5WMHR5ZTFB24CJCYMDY2SCVI4HD3";
export const SHAREPOINT_ORDER_OF_SERVICE_FOLDER_ID =
  "01HGAI5WIBGFJTQZH2BFF2ORTPIMT3FJM4";

const GRAPH_API_BASE_URL = "https://graph.microsoft.com/v1.0";
const ORDER_OF_SERVICE_FOLDER_PATH = "Media Ministry/Order of Service";

/** Year folder for an order: first four chars of its YYYY-MM-DD service date. */
export const getSharePointServiceYear = (serviceDate: string): string =>
  serviceDate.slice(0, 4);

/** SharePoint filename: the basename of the existing R2 PDF object key. */
export const getSharePointPdfFilename = (pdfObjectKey: string): string =>
  pdfObjectKey.split("/").at(-1) ?? pdfObjectKey;

const encodeGraphPath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const buildSharePointYearFolderUrl = (year: string): string =>
  `${GRAPH_API_BASE_URL}/sites/${SHAREPOINT_SITE_ID}/drive/root:/${encodeGraphPath(`${ORDER_OF_SERVICE_FOLDER_PATH}/${year}`)}`;

export const buildSharePointCreateYearFolderUrl = (): string =>
  `${GRAPH_API_BASE_URL}/sites/${SHAREPOINT_SITE_ID}/drive/items/${SHAREPOINT_ORDER_OF_SERVICE_FOLDER_ID}/children`;

export const buildSharePointCreateYearFolderBody = (year: string) => ({
  "@microsoft.graph.conflictBehavior": "fail",
  folder: {},
  name: year,
});

export const buildSharePointUploadUrl = (
  year: string,
  filename: string
): string =>
  `${GRAPH_API_BASE_URL}/sites/${SHAREPOINT_SITE_ID}/drive/root:/${encodeGraphPath(`${ORDER_OF_SERVICE_FOLDER_PATH}/${year}/${filename}`)}:/content`;

const isGraphConfigured = (
  credentials: ExchangeOAuthCredentials | null | undefined
): credentials is ExchangeOAuthCredentials =>
  Boolean(
    credentials?.tenantId.trim() &&
    credentials.clientId.trim() &&
    credentials.clientSecret.trim()
  );

/** True when the year folder exists or was created (409 = already exists). */
const ensureSharePointYearFolder = async (
  accessToken: string,
  year: string
): Promise<boolean> => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const lookup = await fetch(buildSharePointYearFolderUrl(year), { headers });

  if (lookup.ok) {
    return true;
  }

  if (lookup.status !== 404) {
    return false;
  }

  const created = await fetch(buildSharePointCreateYearFolderUrl(), {
    body: JSON.stringify(buildSharePointCreateYearFolderBody(year)),
    headers: { ...headers, "Content-Type": "application/json" },
    method: "POST",
  });

  return created.ok || created.status === 409;
};

/**
 * Upload a published order PDF to its SharePoint year folder. Never throws:
 * every failure is reported through the result so publishing still succeeds.
 */
export const uploadOrderPdfToSharePoint = async (input: {
  credentials: ExchangeOAuthCredentials | null | undefined;
  filename: string;
  pdfBytes: ArrayBuffer | Uint8Array<ArrayBuffer>;
  serviceDate: string;
}): Promise<SharePointUploadResult> => {
  if (!isGraphConfigured(input.credentials)) {
    return { reason: "not-configured", uploaded: false };
  }

  let accessToken: string;

  try {
    accessToken = await getMicrosoftGraphAccessToken(input.credentials);
  } catch (error) {
    console.error("Unable to get a Microsoft Graph access token.", error);
    return { reason: "auth-failed", uploaded: false };
  }

  const year = getSharePointServiceYear(input.serviceDate);

  try {
    if (!(await ensureSharePointYearFolder(accessToken, year))) {
      return { reason: "folder-failed", uploaded: false };
    }
  } catch (error) {
    console.error("Unable to ensure the SharePoint year folder.", error);
    return { reason: "folder-failed", uploaded: false };
  }

  try {
    const response = await fetch(
      buildSharePointUploadUrl(year, input.filename),
      {
        body: input.pdfBytes,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/pdf",
        },
        method: "PUT",
      }
    );

    if (!response.ok) {
      return { reason: "upload-failed", uploaded: false };
    }

    const payload = (await response.json().catch(() => null)) as {
      webUrl?: unknown;
    } | null;
    const webUrl =
      typeof payload?.webUrl === "string" && payload.webUrl.length > 0
        ? payload.webUrl
        : undefined;

    return { uploaded: true, ...(webUrl ? { webUrl } : {}) };
  } catch (error) {
    console.error("Unable to upload the order PDF to SharePoint.", error);
    return { reason: "upload-failed", uploaded: false };
  }
};
