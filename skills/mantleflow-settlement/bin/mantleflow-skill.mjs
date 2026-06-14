#!/usr/bin/env node

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const endpoint = (process.env.MANTLEFLOW_ENDPOINT || "http://localhost:3000").replace(/\/+$/, "");
const [tool = "catalog", invoiceId, third] = process.argv.slice(2);

const body = { tool };
if (invoiceId) body.invoiceId = invoiceId;

if (tool === "settlement_context" || tool === "autonomous_next_action") {
  if (third) body.account = third;
}

if (tool === "build_unsigned_call") {
  body.action = third;
}

let response;
try {
  response = await fetch(`${endpoint}/api/byreal/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
} catch (error) {
  if (tool === "catalog") {
    const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
    const localManifest = JSON.parse(readFileSync(join(skillDir, "skill.json"), "utf8"));
    console.log(JSON.stringify({ source: "local", endpoint, ...localManifest }, null, 2));
    process.exit(0);
  }
  throw error;
}

const text = await response.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { status: response.status, body: text };
}

if (!response.ok) {
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(parsed, null, 2));
