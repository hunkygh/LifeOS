import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, "supabase", ".env");

function readEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

const envFile = readEnvFile(ENV_PATH);
const CLICKUP_API_KEY =
  process.env.LOCAL_CLICKUP_API_KEY ||
  process.env.CLICKUP_API_KEY ||
  envFile.LOCAL_CLICKUP_API_KEY ||
  envFile.CLICKUP_API_KEY;

const FUNCTION_URL =
  process.env.LIFEOS_WRITE_COMMENT_URL ||
  "http://127.0.0.1:54321/functions/v1/write-comment";

const TASK_ID =
  process.env.LIFEOS_DEFAULT_TARGET_TASK_ID ||
  "86age1dqa";

const NOTES = [
  "spoke w mike @ acme. likes it but needs to check w ops. call me thurs after 3. 7205550199",
  "vm left for jen. budget froze till april. ping friday 11ish if she doesn't text back. 303 555 8821",
  "met dan in parking lot lol not ready. ask in 2 wks. use cell 8015551212 not office",
  "sara / bluepeak - gatekeeper said call back after 4:30, owner traveling, maybe monday. 9705554433",
  "tony no answer x2. texted 'call tomorrow'. think his number is 602-555-1009. wants 2 trucks maybe",
];

function buildPayload(rawNote) {
  return {
    note: {
      raw_note: rawNote,
      note_type: "sales_note",
      target_id: TASK_ID,
      summary: rawNote,
      callback_time: null,
      phone: null,
      confidence: 1,
      missing_fields: [],
    },
  };
}

async function fetchComments() {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${TASK_ID}/comment`, {
    headers: {
      Authorization: CLICKUP_API_KEY,
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Could not fetch ClickUp comments (${response.status}): ${details}`);
  }

  const data = await response.json();
  return Array.isArray(data.comments) ? data.comments : [];
}

async function postNote(rawNote) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(rawNote)),
  });

  const bodyText = await response.text();
  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }

  if (!response.ok) {
    throw new Error(`write-comment returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function run() {
  if (!CLICKUP_API_KEY) {
    throw new Error("Missing ClickUp API key. Expected it in supabase/.env or environment.");
  }

  console.log("LifeOS V2 live comment smoke test");
  console.log(`Function URL: ${FUNCTION_URL}`);
  console.log(`Fixed task ID: ${TASK_ID}`);
  console.log("");

  for (let index = 0; index < NOTES.length; index += 1) {
    const rawNote = NOTES[index];
    const marker = `Raw note: ${rawNote}`;

    console.log(`Case ${index + 1}: sending note`);
    const beforeComments = await fetchComments();
    const beforeIds = new Set(beforeComments.map((comment) => String(comment.id)));

    const writeResult = await postNote(rawNote);
    const afterComments = await fetchComments();
    const newComment = afterComments.find((comment) => !beforeIds.has(String(comment.id)));
    const matchedComment = afterComments.find(
      (comment) => String(comment.comment_text || "").includes(marker)
    );

    if (!newComment && !matchedComment) {
      console.log("FAIL: no new comment found for this note");
      console.log("");
      continue;
    }

    const winningComment = matchedComment || newComment;
    console.log("PASS");
    console.log(`Comment ID: ${winningComment.id}`);
    console.log(`Comment text: ${winningComment.comment_text}`);
    console.log(`Writer returned success: ${Boolean(writeResult?.success)}`);
    console.log("");
  }
}

run().catch((error) => {
  console.error("Smoke test failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
