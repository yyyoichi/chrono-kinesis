// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://chrono-kinesis.yyyoichi.com",
  trailingSlash: "never",
  build: {
    format: "preserve",
  },
  integrations: [
    starlight({
      title: "chrono-kinesis",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/yyyoichi/chrono-kinesis" },
      ],
      sidebar: [
        { label: 'Home', link: '/' },
        {
          label: 'Examples',
          items: [
            { label: 'Pointer', slug: 'examples/pointer' },
            { label: 'Dialog', slug: 'examples/dialog' },
            { label: 'Drag', slug: 'examples/drag' },
            { label: 'Viewport', slug: 'examples/viewport' },
          ],
        },
        {
          label: 'Reference',
          items: [
            // @ts-ignore
            {
              autogenerate: {
                directory: 'reference',
              },
            },
          ],
        },
      ],
    }),
  ],
});
