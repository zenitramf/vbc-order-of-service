import type { TeamsChannelQueueMessage } from "~/lib/order-service-types";

/**
 * Posting a published order to the Microsoft Teams channel goes through the
 * channel's email address: Teams renders the message as a channel post with
 * the PDF attached. Pure builders so the post format stays covered by tests.
 */

/** `app_settings` key holding the Teams channel email address. */
export const TEAMS_CHANNEL_EMAIL_KEY = "teams.channelEmail";

/** Body of the Teams channel post. */
export const TEAMS_CHANNEL_BODY = "see attached";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Subject of the Teams channel post: `Order of Service for YYYY-MM-DD`. */
export const buildTeamsChannelSubject = (serviceDate: string): string =>
  `Order of Service for ${serviceDate}`;

export const normalizeChannelEmail = (value: string): string =>
  value.trim().toLowerCase();

export const isValidChannelEmail = (value: string): boolean =>
  EMAIL_REGEX.test(value.trim());

export const buildTeamsChannelMessage = (input: {
  bucket: string;
  channelEmail: string;
  filename: string;
  objectKey: string;
  orderId: string;
  serviceDate: string;
}): TeamsChannelQueueMessage => ({
  attachment: {
    bucket: input.bucket,
    contentType: "application/pdf",
    filename: input.filename,
    objectKey: input.objectKey,
  },
  orderId: input.orderId,
  subject: buildTeamsChannelSubject(input.serviceDate),
  text: TEAMS_CHANNEL_BODY,
  to: normalizeChannelEmail(input.channelEmail),
  type: "teams-channel",
});
