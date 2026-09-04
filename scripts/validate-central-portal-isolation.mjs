import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveTenantHostContext } from "../src/utils/tenantHostContext.js";

console.log("--- RUNNING CENTRAL PORTAL ISOLATION VALIDATION SUITE ---");

// ============================================================================
// 1. HOST CONTEXT RESOLUTION & TENANT ISOLATION
// ============================================================================
console.log("1. Testing host context resolution and non-fallback invariants...");

// 1.1 Central Host: shiftoryx.gr
const centralPrimary = resolveTenantHostContext("shiftoryx.gr");
assert.equal(centralPrimary.mode, "central", "shiftoryx.gr mode must be central");
assert.equal(centralPrimary.family, "primary", "shiftoryx.gr family must be primary");
assert.equal(centralPrimary.tenantSlug, undefined, "shiftoryx.gr MUST NOT have tenantSlug");
assert.notEqual(centralPrimary.tenantSlug, "bp-kallis", "shiftoryx.gr MUST NOT fall back to default tenant slug");

// 1.2 Legacy Central Host: gas.homelabshare.gr
const centralLegacy = resolveTenantHostContext("gas.homelabshare.gr");
assert.equal(centralLegacy.mode, "central", "gas.homelabshare.gr mode must be central");
assert.equal(centralLegacy.family, "legacy", "gas.homelabshare.gr family must be legacy");
assert.equal(centralLegacy.tenantSlug, undefined, "gas.homelabshare.gr MUST NOT have tenantSlug");
assert.notEqual(centralLegacy.tenantSlug, "bp-kallis", "gas.homelabshare.gr MUST NOT fall back to default tenant slug");

// 1.3 Primary Tenant Host: bp-kallis.shiftoryx.gr
const tenantPrimary = resolveTenantHostContext("bp-kallis.shiftoryx.gr");
assert.equal(tenantPrimary.mode, "tenant", "bp-kallis.shiftoryx.gr mode must be tenant");
assert.equal(tenantPrimary.tenantSlug, "bp-kallis", "bp-kallis.shiftoryx.gr tenantSlug must be bp-kallis");
assert.equal(tenantPrimary.family, "primary", "bp-kallis.shiftoryx.gr family must be primary");

// 1.4 Legacy Tenant Host: bp-kallis.homelabshare.gr
const tenantLegacy = resolveTenantHostContext("bp-kallis.homelabshare.gr");
assert.equal(tenantLegacy.mode, "tenant", "bp-kallis.homelabshare.gr mode must be tenant");
assert.equal(tenantLegacy.tenantSlug, "bp-kallis", "bp-kallis.homelabshare.gr tenantSlug must be bp-kallis");
assert.equal(tenantLegacy.family, "legacy", "bp-kallis.homelabshare.gr family must be legacy");

// 1.5 Reserved Subdomain Host: admin.shiftoryx.gr (fail-closed)
const reservedAdmin = resolveTenantHostContext("admin.shiftoryx.gr");
assert.equal(reservedAdmin.mode, "reserved", "admin.shiftoryx.gr mode must be reserved");
assert.equal(reservedAdmin.tenantSlug, undefined, "admin.shiftoryx.gr MUST NOT resolve to a tenant");
assert.notEqual(reservedAdmin.tenantSlug, "bp-kallis", "admin.shiftoryx.gr MUST NOT resolve to bp-kallis");

// 1.6 Deep/Invalid Subdomain: foo.bar.shiftoryx.gr (fail-closed)
const nestedSubdomain = resolveTenantHostContext("foo.bar.shiftoryx.gr");
assert.equal(nestedSubdomain.mode, "unknown", "foo.bar.shiftoryx.gr mode must be unknown");
assert.equal(nestedSubdomain.tenantSlug, undefined, "foo.bar.shiftoryx.gr MUST NOT resolve to a tenant");

// 1.7 Spoofed/Evil Domain: evilshiftoryx.gr (fail-closed)
const evilHost = resolveTenantHostContext("evilshiftoryx.gr");
assert.equal(evilHost.mode, "unknown", "evilshiftoryx.gr mode must be unknown");
assert.equal(evilHost.tenantSlug, undefined, "evilshiftoryx.gr MUST NOT resolve to a tenant");

console.log("✓ Host context resolution invariants verified.");

// ============================================================================
// 2. COMPONENT BOUNDARY & ZERO TENANT UI LEAKAGE IN CENTRAL PORTAL
// ============================================================================
console.log("2. Inspecting component boundaries and central isolation...");

const appCode = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const centralPortalCode = readFileSync(new URL("../src/components/portal/CentralPortal.jsx", import.meta.url), "utf8");
const tenantAppCode = readFileSync(new URL("../src/components/tenant/TenantApp.jsx", import.meta.url), "utf8");
const invalidHostCode = readFileSync(new URL("../src/components/portal/InvalidHostNotice.jsx", import.meta.url), "utf8");

// App.jsx routing assertions
assert.ok(appCode.includes("CentralPortal"), "App.jsx must import and use CentralPortal");
assert.ok(appCode.includes("TenantApp"), "App.jsx must import and use TenantApp");
assert.ok(appCode.includes("InvalidHostNotice"), "App.jsx must import and use InvalidHostNotice");

// Central host separation in App.jsx
assert.ok(
  appCode.includes("tenantHostContext.mode === 'central'") ||
  appCode.includes("tenantHostContext.mode === \"central\""),
  "App.jsx must explicitly branch on central mode"
);

// CentralPortal.jsx isolation assertions
assert.ok(!centralPortalCode.includes("Hyperspeed"), "CentralPortal must NOT import or render Hyperspeed");
assert.ok(!centralPortalCode.includes("MainDashboard"), "CentralPortal must NOT import or render MainDashboard");
assert.ok(!centralPortalCode.includes("bp-kallis"), "CentralPortal must NOT contain hardcoded bp-kallis");
assert.ok(centralPortalCode.includes("data-tenant-mode=\"central\""), "CentralPortal must set data-tenant-mode=central");

// TenantApp.jsx isolation assertions
assert.ok(tenantAppCode.includes("Hyperspeed"), "TenantApp must contain Hyperspeed animation");
assert.ok(tenantAppCode.includes("classList.add(\"dark\")"), "TenantApp must maintain dark theme for tenant app");
assert.ok(tenantAppCode.includes("data-tenant-mode={hostContext.mode}"), "TenantApp must track tenant hostContext mode");

// InvalidHostNotice.jsx fail-closed assertions
assert.ok(!invalidHostCode.includes("Hyperspeed"), "InvalidHostNotice must NOT render Hyperspeed");
assert.ok(!invalidHostCode.includes("MainDashboard"), "InvalidHostNotice must NOT render MainDashboard");
assert.ok(!invalidHostCode.includes("bp-kallis"), "InvalidHostNotice must NOT render bp-kallis");

console.log("✓ Component boundary and isolation invariants verified.");

console.log("--- ALL CENTRAL PORTAL ISOLATION TESTS PASSED ---");