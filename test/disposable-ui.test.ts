import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPressDropWebServer } from "../src/web-server.ts";
import { normalizeSiteProfile } from "../src/wordpress/site-profile.ts";
import { WordPressClient } from "../src/wordpress/client.ts";

test("HTTP stays rejected outside a literal loopback test target", () => {
  for (const baseUrl of ["http://127.0.0.1:1234", "http://[::1]:1234"]) {
    assert.throws(() => normalizeSiteProfile({ id: "x", baseUrl }));
    assert.equal(normalizeSiteProfile({ id: "x", baseUrl }, { allowInsecureHttpForTests: true }).baseUrl, baseUrl);
    const server = createPressDropWebServer({ disposableTestSite: { baseUrl } }); server.close();
  }
  for (const baseUrl of ["http://example.test:1234", "http://192.168.1.1:1234", "http://localhost:1234", "http://127.0.0.2:1234", "http://127.0.0.1:1234/path", "https://127.0.0.1:1234", "http://127.0.0.1:1234?x=1"]) {
    assert.throws(() => createPressDropWebServer({ disposableTestSite: { baseUrl } }));
  }
  for (const baseUrl of ["http://example.test", "http://localhost", "http://192.168.1.1"]) {
    assert.throws(() => normalizeSiteProfile({ id: "x", baseUrl }, { allowInsecureHttpForTests: true }));
  }
});

test("normal UI rejects HTTP; test UI only accepts the launched instance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pressdrop-boundary-"));
  let requests = 0;
  const fetchImpl: typeof fetch = async () => { requests++; return new Response("[]"); };
  try {
    for (const mode of ["normal", "test"]) {
      const target = "http://127.0.0.1:1234";
      const server = createPressDropWebServer({ clientOptions: { fetchImpl }, ...(mode === "test" ? { disposableTestSite: { baseUrl: target } } : {}) });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as { address: string; port: number };
      assert.equal(address.address, "127.0.0.1");
      try {
        if (mode === "test") {
          const hostStatus = await new Promise<number>((resolve, reject) => {
            const req = request(`http://127.0.0.1:${address.port}/api/health`, { headers: { Host: "example.test" } }, (res) => { res.resume(); resolve(res.statusCode!); });
            req.on("error", reject); req.end();
          });
          assert.equal(hostStatus, 403);
          for (const headers of [{ Origin: "http://localhost:1234" }, { Origin: "https://example.test" }]) {
            const rejected = await fetch(`http://127.0.0.1:${address.port}/api/health`, { headers });
            assert.equal(rejected.status, 403);
          }
        }
        for (const baseUrl of [target, "http://127.0.0.1:1235", "http://192.168.1.1:1234", "https://example.test"]) {
          await writeFile(path.join(root, "site.json"), JSON.stringify({ id: "test", baseUrl }));
          const before = requests;
          const response = await fetch(`http://127.0.0.1:${address.port}/api/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleDir: "examples/basic", profilePath: path.join(root, "site.json"), username: "session", applicationPassword: "session" }) });
          if ((mode === "normal" && baseUrl.startsWith("http:")) || (mode === "test" && baseUrl !== target)) {
            assert.equal(response.status, 400); assert.equal(requests, before);
          } else assert.ok(requests > before);
        }
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("authenticated WordPress requests never follow redirects", async () => {
  let destinationRequests = 0;
  const destination = createServer((_req, res) => { destinationRequests++; res.end("[]"); });
  const source = createServer((_req, res) => { res.writeHead(307, { Location: `http://127.0.0.1:${(destination.address() as any).port}/escaped` }); res.end(); });
  await new Promise<void>((resolve) => destination.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  try {
    const profile = normalizeSiteProfile({ id: "redirect-test", baseUrl: `http://127.0.0.1:${(source.address() as any).port}` }, { allowInsecureHttpForTests: true });
    const client = new WordPressClient(profile, { username: "test", applicationPassword: "test-only" });
    await assert.rejects(() => client.resolveTerm("tags", "x"), /WordPress request failed/);
    assert.equal(destinationRequests, 0);
  } finally { await Promise.all([source, destination].map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); }
});

test("IPv6 test UI accepts its own origin and rejects another port", async () => {
  const server = createPressDropWebServer({ disposableTestSite: { baseUrl: "http://[::1]:1234" } });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "::1", resolve); });
  const address = server.address() as { address: string; port: number };
  assert.equal(address.address, "::1");
  const origin = `http://[::1]:${address.port}`;
  try {
    assert.equal((await fetch(`${origin}/api/health`, { headers: { Origin: origin } })).status, 200);
    assert.equal((await fetch(`${origin}/api/health`, { headers: { Origin: "http://[::1]:1234" } })).status, 403);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
