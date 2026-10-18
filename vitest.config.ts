import react from "@astrojs/react";
import { getViteConfig } from "astro/config";

// Astro's Vite config so tests can compile and render .astro components with the container API.
export default getViteConfig(
  {
    test: {
      include: ["test/**/*.test.{ts,tsx}"],
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
    },
  } as Parameters<typeof getViteConfig>[0],
  { integrations: [react()], logLevel: "error" },
);
