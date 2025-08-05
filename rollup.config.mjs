import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import del from "rollup-plugin-delete";
import dts from "rollup-plugin-dts";

export default defineConfig([
  {
    input: "src/index.ts",
    strictDeprecations: true,
    output: [
      {
        dir: "dist/es",
        format: "es",
        exports: "named",
        sourcemap: true,
      },
    ],
    plugins: [
      del({ targets: "dist/es/*", hook: "buildStart", verbose: true }),
      typescript({
        sourceMap: true,
        declaration: true,
        declarationDir: "dist/es/types",
      }),
    ],
  },
  {
    input: "src/index.ts",
    strictDeprecations: true,
    output: [
      {
        dir: "dist/cjs",
        format: "cjs",
        exports: "named",
        sourcemap: true,
      },
    ],
    plugins: [
      del({ targets: "dist/cjs/*", hook: "buildStart", verbose: true }),
      typescript({
        sourceMap: true,
        declaration: false,
      }),
    ],
  },
  {
    input: "dist/es/types/index.d.ts",
    output: [
      {
        file: "dist/index.d.ts",
        format: "esm",
      },
    ],
    plugins: [
      dts(),
      del({
        targets: "dist/es/types/*",
        hook: "buildEnd",
        verbose: true,
      }),
    ],
  },
]);
