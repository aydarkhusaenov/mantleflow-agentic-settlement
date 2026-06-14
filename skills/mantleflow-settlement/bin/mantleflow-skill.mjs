#!/usr/bin/env node

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

const response = await fetch(`${endpoint}/api/byreal/skill`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

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
