const esbuild = require("esbuild");
const fs = require("fs").promises;
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const textFileNamespace = "text-file";

/**
 * @type {import('esbuild').Plugin}
 */
const textFilePlugin = {
  name: "text-file",
  setup(build) {
    build.onResolve({ filter: /\.lua$/ }, (args) => {
      const resolvedPath = path.resolve(args.resolveDir, args.path);
      return {
        path: resolvedPath,
        namespace: textFileNamespace,
      };
    });
    build.onLoad(
      { filter: /.*/, namespace: textFileNamespace },
      async (args) => {
        const contents = await fs.readFile(args.path, "utf8");
        return {
          contents,
          watchFiles: [args.path],
          loader: "text",
        };
      }
    );
  },
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
      textFilePlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
