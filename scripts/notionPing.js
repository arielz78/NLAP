/**
 * notionPing.js — read-only connectivity test for the Notion Personal Access Token.
 *
 * Confirms two things the claude.ai connector cannot do:
 *   1. the token authenticates at all
 *   2. database *descriptions* are readable (the connector cannot see them)
 *
 * Prints no secret material — only the token's length and 4-char prefix.
 * Usage: node scripts/notionPing.js
 */

require("dotenv").config({ path: __dirname + "/../NLAP_Airtable.env" });

const KEY = process.env.NOTION_PERSONAL_KEY;
const API = "https://api.notion.com/v1";
const HEADERS = {
  Authorization: `Bearer ${KEY}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

const plain = (rich) => (rich || []).map((t) => t.plain_text).join("");

async function main() {
  if (!KEY) {
    console.error("NOTION_PERSONAL_KEY not found in NLAP_Airtable.env");
    process.exit(1);
  }
  console.log(`token loaded — length ${KEY.length}, prefix ${KEY.slice(0, 4)}…`);

  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ filter: { property: "object", value: "database" } }),
  });
  const body = await res.json();

  if (body.object === "error") {
    console.error(`API error ${body.status} ${body.code}: ${body.message}`);
    process.exit(1);
  }

  console.log(`\ndatabases visible to the token: ${body.results.length}\n`);
  for (const db of body.results) {
    const title = plain(db.title) || "(untitled)";
    const desc = plain(db.description);
    console.log(`- ${title}  [${db.id}]`);
    if (desc) console.log(`    description: ${desc.slice(0, 200)}${desc.length > 200 ? "…" : ""}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
