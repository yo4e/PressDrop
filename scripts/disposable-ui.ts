// Explicit development launcher. No environment variable enables HTTP in product mode.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadNodeRuntime } from "@php-wasm/node";
import { bootWordPressAndRequestHandler } from "@wp-playground/wordpress";
import { testPng } from "./test-images.ts";
import { createPressDropWebServer } from "../src/web-server.ts";

const root = await mkdtemp(path.join(tmpdir(), "pressdrop-ui-test-"));
let handler: Awaited<ReturnType<typeof bootWordPressAndRequestHandler>> | undefined;
let ui: ReturnType<typeof createServer> | undefined;
const wp = createServer(async (req, res) => {
  try {
    if (!handler) { res.writeHead(503).end(); return; }
    if (req.headers.host !== new URL(wpUrl).host) { res.writeHead(403).end(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw new Error("Request too large");
      chunks.push(Buffer.from(chunk));
    }
    const response = await handler.request({ url: req.url!, method: req.method as any,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string")) as Record<string, string>,
      body: Buffer.concat(chunks) });
    res.writeHead(response.httpStatusCode, response.headers);
    res.end(response.bytes);
  } catch { res.writeHead(500).end("Disposable WordPress request failed"); }
});
await new Promise<void>((resolve) => wp.listen(0, "127.0.0.1", resolve));
const address = wp.address();
if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Not loopback");
const wpUrl = `http://127.0.0.1:${address.port}`;
async function cleanup() {
  // Remove our non-secret host files synchronously before any asynchronous teardown.
  rmSync(root, { recursive: true, force: true });
  if (handler) {
    const php = await handler.getPrimaryPhp();
    const counts = await php.run({ code: `<?php require '/wordpress/wp-load.php';
      echo json_encode(['drafts'=>(int)wp_count_posts()->draft,'published'=>(int)wp_count_posts()->publish,'media'=>(int)wp_count_posts('attachment')->inherit]);` });
    console.log("Disposable final counts:", counts.text);
  }
  ui?.closeAllConnections(); wp.closeAllConnections();
  await Promise.all([ui && new Promise<void>((resolve) => ui!.close(() => resolve())), new Promise<void>((resolve) => wp.close(() => resolve()))]);
  await handler?.[Symbol.asyncDispose]();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void cleanup().then(() => process.exit(0)); });
try {
  // No host filesystem mounts: PHP/SQLite/uploads and credentials stay in memory.
  const zip = await fetch("https://wordpress.org/wordpress-6.8.zip");
  if (!zip.ok) throw new Error("WordPress download failed");
  handler = await bootWordPressAndRequestHandler({
    createPhpRuntime: () => loadNodeRuntime("8.3"), maxPhpInstances: 1,
    siteUrl: wpUrl, cookieStore: false,
    constants: { WP_ENVIRONMENT_TYPE: "local", WP_DEBUG: false, WP_HTTP_BLOCK_EXTERNAL: true },
    wordPressZip: new File([await zip.arrayBuffer()], "wordpress.zip"),
    sqliteIntegrationPluginZip: new File([await readFile("node_modules/@wp-playground/cli/sqlite-database-integration.zip")], "sqlite.zip"),
  });
  const php = await handler.getPrimaryPhp();
  const adminPassword = randomBytes(32).toString("hex");
  const setup = await php.run({ code: `<?php require '/wordpress/wp-load.php';
    wp_set_password('${adminPassword}', 1);
    foreach(get_posts(['post_type'=>['post','page'],'post_status'=>'any','numberposts'=>-1]) as $post) wp_delete_post($post->ID,true);
    $user = wp_insert_user(['user_login'=>'pressdrop-session','user_pass'=>wp_generate_password(40),'user_email'=>'session@example.invalid','role'=>'author']);
    if(is_wp_error($user)) throw new Exception('User creation failed');
    $app=WP_Application_Passwords::create_new_application_password($user,['name'=>'Disposable PressDrop']);
    if(is_wp_error($app)) throw new Exception('Credential creation failed');
    foreach(['Workflow','WordPress'] as $term) wp_insert_term($term,'category');
    foreach(['Markdown','Gutenberg'] as $term) wp_insert_term($term,'post_tag');
    update_option('permalink_structure','/%postname%/');
    echo json_encode(['password'=>$app[0]]);` });
  const secret = JSON.parse(setup.text).password;
  const loginPath = "/__pressdrop_test_login.php";
  php.writeFile(`/wordpress${loginPath}`, `<?php require '/wordpress/wp-load.php'; wp_set_auth_cookie(1, false); wp_safe_redirect(admin_url()); exit;`);
  await writeFile(path.join(root, "site.json"), JSON.stringify({ id: "disposable-session", baseUrl: wpUrl, postType: "posts" }));
  await cp("examples/basic", path.join(root, "sample"), { recursive: true });
  for (const [index, name] of ["cover.png", "photo-01.png", "photo-02.png"].entries()) {
    await writeFile(path.join(root, "sample/images", name), testPng(index));
  }
  const manuscript = path.join(root, "sample/article.md");
  await writeFile(manuscript, (await readFile(manuscript, "utf8")).replace("ノートPCの横に置かれた原稿メモ", "青色の三つの矩形を示すテスト画像").replace("Gutenbergブロックの流れを示す図", "紫色の三つの矩形を示すテスト画像").replace("このIssueではWordPressへの送信は行わず、ローカルで再現可能な変換だけを完成させます。", "この原稿は使い捨てWordPressの下書き検証専用です。"));
  ui = createPressDropWebServer({ stateFile: path.join(root, "state.json"), disposableTestSite: { baseUrl: wpUrl },
    clientOptions: { fetchImpl: async (input, init) => {
      if (new URL(String(input)).origin !== wpUrl) throw new Error("Test request escaped loopback instance");
      return fetch(input, { ...init, redirect: "error", headers: { ...init?.headers,
        Authorization: `Basic ${Buffer.from(`pressdrop-session:${secret}`).toString("base64")}` } });
    } } });
  await new Promise<void>((resolve) => ui!.listen(0, "127.0.0.1", resolve));
  console.log(JSON.stringify({ mode: "DISPOSABLE TEST ONLY", ui: ui.address(), wordpress: wp.address(), bundleDir: path.join(root, "sample"), profilePath: path.join(root, "site.json"),
    uiCredentials: "Use session for both fields; real credentials stay in launcher memory", wordpressLogin: `${wpUrl}${loginPath}` }, null, 2));
  if (process.argv.includes("--smoke")) {
    const uiAddress = ui.address() as { address: string; port: number };
    if (uiAddress.address !== "127.0.0.1") throw new Error("UI escaped loopback");
    const uiUrl = `http://127.0.0.1:${uiAddress.port}`;
    async function api(route: string, body?: unknown) {
      const response = await fetch(`${uiUrl}/api/${route}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(result));
      return result;
    }
    const body = { bundleDir: path.join(root, "sample"), profilePath: path.join(root, "site.json"), username: "session", applicationPassword: "session" };
    const inspection = await api("inspect", { bundleDir: body.bundleDir });
    await api("preflight", body);
    const results = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = await api("submissions", { ...body, expectedSourceFingerprint: inspection.article.source.fingerprint });
      let job;
      for (let poll = 0; poll < 100; poll++) {
        job = await api(`submissions/${started.jobId}`);
        if (job.status !== "running") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (job?.status !== "completed") throw new Error(JSON.stringify(job));
      results.push(job.result);
    }
    if (results[0].reused || !results[1].reused || results[0].post.id !== results[1].post.id) throw new Error("Retry mismatch");
    console.log("UI API smoke:", JSON.stringify({ firstPost: results[0].post.id, retryPost: results[1].post.id, reused: results[1].reused, media: Object.keys(results[1].media).length }));
    const countResponse = await php.run({ code: `<?php require '/wordpress/wp-load.php';
      echo json_encode(['drafts'=>(int)wp_count_posts()->draft,'published'=>(int)wp_count_posts()->publish,'media'=>(int)wp_count_posts('attachment')->inherit]);` });
    const counts = JSON.parse(countResponse.text);
    if (counts.drafts !== 1 || counts.published !== 0 || counts.media !== 3) throw new Error("Unexpected remote draft/media counts");
    await cleanup();
  }

} catch (error) { await cleanup(); throw error; }
