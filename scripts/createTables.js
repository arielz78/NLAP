// createTables.js
// Creates tables in Airtable base appVXHOyQcgQAk1gV, skipping any that already exist.
// Requires: AIRTABLE_API_KEY environment variable

const BASE_ID = "appVXHOyQcgQAk1gV";
const API_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;

const apiKey = process.env.AIRTABLE_API_KEY;
if (!apiKey) {
  console.error("Error: AIRTABLE_API_KEY environment variable is not set.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

const tables = [
  {
    name: "IssueItems",
    fields: [
      {
        name: "Name",
        type: "singleLineText",
      },
      {
        name: "Section",
        type: "singleSelect",
        options: {
          choices: [
            { name: "For Families" },
            { name: "For Couples" },
            { name: "For Golden Age Readers" },
            { name: "Local Aroma" },
            { name: "Trust Me Recipe" },
          ],
        },
      },
      {
        name: "Slot",
        type: "number",
        options: {
          precision: 0,
        },
      },
      {
        name: "Lock",
        type: "checkbox",
        options: {
          icon: "check",
          color: "yellowBright",
        },
      },
      {
        name: "Notes",
        type: "multilineText",
      },
    ],
  },
];

async function getExistingTableNames() {
  const res = await fetch(API_URL, { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to fetch tables: ${res.status} ${JSON.stringify(data)}`);
  }
  return new Set(data.tables.map((t) => t.name));
}

async function createTable(table) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(table),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Failed to create table "${table.name}": ${res.status} ${JSON.stringify(data)}`
    );
  }
  return data;
}

async function main() {
  let existing;
  try {
    existing = await getExistingTableNames();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  for (const table of tables) {
    if (existing.has(table.name)) {
      console.log(`Skipping "${table.name}" — already exists.`);
      continue;
    }
    try {
      const result = await createTable(table);
      console.log(`Created table "${result.name}" (id: ${result.id})`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

main();
