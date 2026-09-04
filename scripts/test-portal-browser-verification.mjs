import { chromium } from "playwright";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";

function probeHttps(hostname) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port: 443,
        method: "HEAD",
        path: "/",
        headers: {
          "User-Agent": "ShiftOryx-QA-Prober/1.0"
        },
        lookup: (host, options, cb) => {
          const callback = typeof options === "function" ? options : cb;
          const opts = typeof options === "object" ? options : {};
          const resolver = new dns.Resolver();
          resolver.setServers(["8.8.8.8", "1.1.1.1"]);
          resolver.resolve4(host, (err, addresses) => {
            if (err) return callback(err);
            if (!addresses || !addresses.length) return callback(new Error("No address found for " + host));
            if (opts.all) {
              callback(null, addresses.map((a) => ({ address: a, family: 4 })));
            } else {
              callback(null, addresses[0], 4);
            }
          });
        },
        timeout: 10000,
      },
      (res) => {
        resolve({ status: res.statusCode, statusText: res.statusMessage });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout probing ${hostname}`));
    });
    req.end();
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let filePath = path.join(distDir, parsedUrl.pathname);
  if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fsSync.existsSync(filePath) || !fsSync.statSync(filePath).isFile()) {
    filePath = path.join(distDir, "index.html");
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  fsSync.createReadStream(filePath).pipe(res);
});

server.listen(5199, "127.0.0.1", async () => {
  console.log("Local preview test server running on 127.0.0.1:5199");

  const browser = await chromium.launch({ headless: true });
  let failed = false;

  try {
    // -------------------------------------------------------------
    // Test 1: Host = shiftoryx.gr (Central Portal)
    // -------------------------------------------------------------
    console.log("\n--- Testing Host: shiftoryx.gr (Central Portal) ---");
    const centralContext = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const centralPage = await centralContext.newPage();

    await centralPage.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "shiftoryx.gr") {
        url.hostname = "127.0.0.1";
        url.port = "5199";
        url.protocol = "http:";
        const response = await fetch(url.toString(), {
          headers: route.request().headers(),
          method: route.request().method()
        });
        const body = await response.arrayBuffer();
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: Buffer.from(body)
        });
      } else {
        await route.continue();
      }
    });

    await centralPage.goto("http://shiftoryx.gr/");
    await centralPage.waitForLoadState("domcontentloaded");

    const centralModeAttr = await centralPage.locator("[data-tenant-mode]").first().getAttribute("data-tenant-mode");
    console.log(`data-tenant-mode on shiftoryx.gr: "${centralModeAttr}"`);
    if (centralModeAttr !== "central") throw new Error(`Expected data-tenant-mode=central, got ${centralModeAttr}`);

    const hasHyperspeed = await centralPage.locator("canvas").count();
    console.log(`Canvas count on shiftoryx.gr: ${hasHyperspeed}`);
    if (hasHyperspeed > 0) throw new Error("Hyperspeed canvas must NOT be rendered on central host!");

    const content = await centralPage.content();
    if (content.includes("BP Κάλλης") || content.includes("BP Kallis")) {
      throw new Error("BP Kallis branding found on shiftoryx.gr!");
    }
    console.log("✓ shiftoryx.gr: Central portal rendered, no Hyperspeed, no BP Kallis branding.");

    // Test mobile view on shiftoryx.gr
    await centralPage.setViewportSize({ width: 375, height: 667 });
    await centralPage.waitForTimeout(300);
    const mobileMode = await centralPage.locator("[data-tenant-mode]").first().getAttribute("data-tenant-mode");
    if (mobileMode !== "central") throw new Error("Mobile view failed central isolation!");
    console.log("✓ shiftoryx.gr (Mobile): Central portal verified.");

    await centralContext.close();

    // -------------------------------------------------------------
    // Test 2: Host = bp-kallis.shiftoryx.gr (Tenant App)
    // -------------------------------------------------------------
    console.log("\n--- Testing Host: bp-kallis.shiftoryx.gr (Primary Tenant) ---");
    const tenantContext = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const tenantPage = await tenantContext.newPage();

    await tenantPage.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "bp-kallis.shiftoryx.gr") {
        url.hostname = "127.0.0.1";
        url.port = "5199";
        url.protocol = "http:";
        const response = await fetch(url.toString(), {
          headers: route.request().headers(),
          method: route.request().method()
        });
        const body = await response.arrayBuffer();
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: Buffer.from(body)
        });
      } else {
        await route.continue();
      }
    });

    await tenantPage.goto("http://bp-kallis.shiftoryx.gr/");
    await tenantPage.waitForLoadState("domcontentloaded");

    const tenantModeAttr = await tenantPage.locator("[data-tenant-mode]").first().getAttribute("data-tenant-mode");
    console.log(`data-tenant-mode on bp-kallis.shiftoryx.gr: "${tenantModeAttr}"`);
    if (tenantModeAttr !== "tenant") throw new Error(`Expected data-tenant-mode=tenant, got ${tenantModeAttr}`);

    console.log("✓ bp-kallis.shiftoryx.gr: Tenant app rendered with data-tenant-mode=tenant.");
    await tenantContext.close();

    // -------------------------------------------------------------
    // Test 3: Host = admin.shiftoryx.gr (Reserved / Fail Closed)
    // -------------------------------------------------------------
    console.log("\n--- Testing Host: admin.shiftoryx.gr (Reserved Host Fail-Closed) ---");
    const reservedContext = await browser.newContext();
    const reservedPage = await reservedContext.newPage();

    await reservedPage.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "admin.shiftoryx.gr") {
        url.hostname = "127.0.0.1";
        url.port = "5199";
        url.protocol = "http:";
        const response = await fetch(url.toString(), {
          headers: route.request().headers(),
          method: route.request().method()
        });
        const body = await response.arrayBuffer();
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: Buffer.from(body)
        });
      } else {
        await route.continue();
      }
    });

    await reservedPage.goto("http://admin.shiftoryx.gr/");
    await reservedPage.waitForLoadState("domcontentloaded");

    const reservedModeAttr = await reservedPage.locator("[data-tenant-mode]").first().getAttribute("data-tenant-mode");
    console.log(`data-tenant-mode on admin.shiftoryx.gr: "${reservedModeAttr}"`);
    if (reservedModeAttr !== "reserved") throw new Error(`Expected data-tenant-mode=reserved, got ${reservedModeAttr}`);

    const reservedContent = await reservedPage.content();
    if (!reservedContent.includes("Μη υποστηριζόμενη διεύθυνση")) {
      throw new Error("Expected fail-closed error notice for admin.shiftoryx.gr!");
    }
    console.log("✓ admin.shiftoryx.gr: Correctly failed closed with safe error UI.");
    await reservedContext.close();

    // -------------------------------------------------------------
    // Test 4: Live Production HTTPS Health Probes
    // -------------------------------------------------------------
    console.log("\n--- Probing Live Production HTTPS Endpoints ---");
    for (const host of [
      "shiftoryx.gr",
      "bp-kallis.shiftoryx.gr",
      "bp-kallis.homelabshare.gr"
    ]) {
      const res = await probeHttps(host);
      console.log(`HEAD https://${host} -> HTTP ${res.status} ${res.statusText}`);
      if (res.status !== 200) throw new Error(`Endpoint ${host} returned status ${res.status}`);
    }
    console.log("✓ All live endpoints healthy (HTTP 200).");

  } catch (err) {
    console.error("Browser verification failed:", err);
    failed = true;
  } finally {
    await browser.close();
    server.close();
    process.exit(failed ? 1 : 0);
  }
});