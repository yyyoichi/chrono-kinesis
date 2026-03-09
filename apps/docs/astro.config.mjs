// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  trailingSlash: "never",
  integrations: [
    starlight({
      title: "chrono-kinesis",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/yyyoichi/chrono-kinesis" },
      ],
    }),
  ],
});
