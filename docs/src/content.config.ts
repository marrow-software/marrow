import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Published pages live only under src/content/docs/. Sibling folders such as
// docs/agents/ (agent skill config) are intentionally outside this collection.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
