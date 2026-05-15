// addField.js
// One-time script: adds "Added to Base" text field to IssueItems table.

require("dotenv").config({ path: require("path").join(__dirname, "../NLAP_Airtable.env") }); 
// 1) there's .env file to maintain security of API keys  
// 2) the "translation": The dotenv package reads that plain text file and "pastes" those secrets onto the Virtual Clipboard (process.env).
// 3) require('dotenv') means that this script needs dotenv or the .env file turned into JSON using dotenv package to work
// 4) configure or .config() means to set up. It gives instructions on how code should behave
// 5) finish the inside of {} tmr

const BASE_ID       = "appVXHOyQcgQAk1gV";
const ISSUEITEMS_ID = "tblrz2fZYUhxpZph2";

async function main() {
  if (!process.env.AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY not set");

  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${ISSUEITEMS_ID}/fields`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Added to Base",
        type: "singleLineText",
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(`Airtable error: ${JSON.stringify(data)}`);
  console.log(`Created field: ${data.name} (${data.id})`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
