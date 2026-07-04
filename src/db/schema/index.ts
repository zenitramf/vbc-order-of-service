// oxlint-disable no-barrel-file -- deliberate schema aggregator for drizzle-kit.
/**
 * Single schema index consumed by the Drizzle client factory and drizzle-kit.
 * Grouped by domain in sibling modules.
 */
export * from "./auth";
export * from "./hymns";
export * from "./orders";
export * from "./reference";
export * from "./roles";
export * from "./settings";
export * from "./teams";
