import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  clean: true,
  publicDir: true,
  sourcemap: true,
  noExternal: [/.*/],
  treeshake: "smallest",
})
