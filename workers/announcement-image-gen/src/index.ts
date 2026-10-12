/**
 * Slim Worker hosting the Rick chat agent Durable Object. (Named
 * `vbc-oos-announcement-image-gen` for historical reasons — the announcement
 * image-gen consumer that used to live here was removed.)
 *
 * No public HTTP surface — the portal reaches Rick through the cross-script
 * Durable Object binding, so model calls never share an isolate with
 * TanStack Start.
 */
import { RickAgent } from "./rick-agent";

export { RickAgent };

export default {
  // The portal reaches Rick through the cross-script Durable Object binding;
  // this Worker intentionally has no public HTTP surface.
  fetch(): Response {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
