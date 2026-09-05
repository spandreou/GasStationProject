import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

console.log("--- RUNNING VERCEL SPA ROUTING CONFIG VALIDATION ---");

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

// 1. Check rewrites existence
assert.ok(Array.isArray(vercelConfig.rewrites), "vercel.json must have a 'rewrites' array");
assert.equal(vercelConfig.rewrites.length, 1, "vercel.json should have exactly 1 SPA fallback rewrite");

const spaRewrite = vercelConfig.rewrites[0];
assert.equal(spaRewrite.destination, "/index.html", "Rewrite destination must be /index.html");

// 2. Validate source regex behavior
// Pattern: /((?!assets/|api/|.*\\.[\\w]+$).*)
const sourceRegex = new RegExp(`^${spaRewrite.source.replace(":path*", ".*")}$`);

console.log("Testing pattern:", spaRewrite.source);

// SPA routes that MUST rewrite to index.html
const routesShouldRewrite = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/select-tenant",
  "/stores",
  "/app",
  "/request-token",
  "/admin",
  "/admin-console",
  "/any/nested/client/route"
];

for (const route of routesShouldRewrite) {
  assert.match(route, sourceRegex, `Route '${route}' must match SPA rewrite pattern`);
}

// Static assets and API routes that MUST NOT rewrite to index.html
const routesShouldNotRewrite = [
  "/assets/index-B_93c1.js",
  "/assets/index-D_81b2.css",
  "/assets/vendor-chunk.js",
  "/api/auth-broker",
  "/api/v1/status",
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/logo.png"
];

for (const route of routesShouldNotRewrite) {
  assert.doesNotMatch(route, sourceRegex, `Static/API path '${route}' must NOT match SPA rewrite pattern`);
}

// 3. Ensure security headers are intact
assert.ok(Array.isArray(vercelConfig.headers), "vercel.json must have a 'headers' array");
const globalHeaderEntry = vercelConfig.headers.find(h => h.source === "/:path*");
assert.ok(globalHeaderEntry, "Global headers for /:path* must exist");

const headerKeys = globalHeaderEntry.headers.map(h => h.key);
const requiredHeaders = [
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Content-Security-Policy"
];

for (const header of requiredHeaders) {
  assert.ok(headerKeys.includes(header), `Header '${header}' must be present in global headers`);
}

console.log("✓ All Vercel SPA routing and security header tests passed.");
