import { generateGutenberg } from "./gutenberg.ts";
import { inspectBundle } from "./pipeline.ts";
import { PressDropError } from "./errors.ts";

async function main(): Promise<void> {
  const [command, bundle = "examples/basic"] = process.argv.slice(2);
  if (command !== "inspect" && command !== "gutenberg") {
    console.error("Usage: node --experimental-strip-types src/cli.ts <inspect|gutenberg> <bundle-directory>");
    process.exitCode = 2;
    return;
  }

  const result = await inspectBundle(bundle);
  if (command === "inspect") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(generateGutenberg(result.article));
}

main().catch((error: unknown) => {
  if (error instanceof PressDropError) {
    console.error(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details } }, null, 2));
    process.exitCode = 1;
    return;
  }
  throw error;
});
