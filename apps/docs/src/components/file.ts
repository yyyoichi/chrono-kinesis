import type { AstroInstance } from "astro";

const modules = import.meta.glob<AstroInstance>("/src/examples/**/*.astro", { eager: true });
const sources = import.meta.glob<string>("/src/examples/**/*.astro", {
  eager: true,
  query: "?raw",
  import: "default",
});
const filePaths = Object.keys(sources);
export function getSource(fileName: string) {
  const path = filePaths.find((p) => p.endsWith(fileName));
  if (!path) {
    throw new Error(`File ${fileName} not found`);
  }
  const m = modules[path];
  const s = sources[path];
  return {
    Component: m.default,
    source: s,
  };
}
