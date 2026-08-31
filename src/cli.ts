import { generateGutenberg } from "./gutenberg.ts";
import { inspectBundle } from "./pipeline.ts";
import { PressDropError } from "./errors.ts";
import { loadSiteProfile } from "./wordpress/site-profile.ts";
import { JsonSubmissionStateStore } from "./wordpress/state.ts";
import { submitBundle } from "./wordpress/submit.ts";

function usage(): string {
  return [
    "Usage:",
    "  node --experimental-strip-types src/cli.ts inspect <bundle-directory>",
    "  node --experimental-strip-types src/cli.ts gutenberg <bundle-directory>",
    "  node --experimental-strip-types src/cli.ts submit <bundle-directory> <site-profile.json> [state-file]",
    "",
    "submit credentials: PRESSDROP_WP_USERNAME and PRESSDROP_WP_APP_PASSWORD",
  ].join("\n");
}

async function main(): Promise<void> {
  const [command, bundle = "examples/basic", profilePath, statePath = process.env.PRESSDROP_STATE_FILE ?? ".pressdrop/state.json"] = process.argv.slice(2);
  if (command === "inspect" || command === "gutenberg") {
    const result = await inspectBundle(bundle);
    if (command === "inspect") console.log(JSON.stringify(result, null, 2));
    else console.log(generateGutenberg(result.article));
    return;
  }

  if (command === "submit") {
    if (!profilePath) throw new PressDropError("SITE_PROFILE_ERROR", `submit requires a site profile path\n${usage()}`);
    const username = process.env.PRESSDROP_WP_USERNAME ?? "";
    const applicationPassword = process.env.PRESSDROP_WP_APP_PASSWORD ?? "";
    if (!username || !applicationPassword) {
      throw new PressDropError("AUTH_ERROR", "PRESSDROP_WP_USERNAME and PRESSDROP_WP_APP_PASSWORD are required for submit");
    }
    const profile = await loadSiteProfile(profilePath);
    const result = await submitBundle({
      bundleDir: bundle,
      profile,
      credentials: { username, applicationPassword },
      stateStore: new JsonSubmissionStateStore(statePath),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(usage());
  process.exitCode = 2;
}

main().catch((error: unknown) => {
  if (error instanceof PressDropError) {
    console.error(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details } }, null, 2));
    process.exitCode = 1;
    return;
  }
  throw error;
});
