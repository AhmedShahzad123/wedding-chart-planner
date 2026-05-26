import { GoogleGenerativeAI } from "@google/generative-ai";

const allowedTags = new Set([
  "vip",
  "kid",
  "child",
  "vegetarian",
  "vegan",
  "dietary",
  "accessibility",
  "wheelchair",
  "family",
  "friend",
  "work",
  "planner",
  "note"
]);

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function cleanName(value) {
  return String(value || "")
    .replace(/^[\s\-*•\d.)]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePlanningText(value) {
  return /^(bride|groom|bride side|groom side|family|friends|kids|children|parents|notes?|email|whatsapp|from whatsapp|table|guest list|maybe together)$/i.test(value);
}

function tagsForLine(line) {
  const tags = [];
  if (/vip|bride|groom|maid of honor|best man|parent/i.test(line)) tags.push("vip");
  if (/vegetarian/i.test(line)) tags.push("vegetarian");
  if (/vegan/i.test(line)) tags.push("vegan");
  if (/allerg|gluten|nut|halal|kosher|diet/i.test(line)) tags.push("dietary");
  if (/kid|child|children|baby|toddler|high chair|\(\d+\)/i.test(line)) tags.push("kid");
  if (/wheelchair|aisle|front|accessible|mobility|walker/i.test(line)) tags.push("accessibility");
  return [...new Set(tags)];
}

export function fallbackParse(input) {
  const guests = [];
  const constraints = [];
  const notes = [];
  const groups = [];
  let currentGroup = "";

  String(input)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const groupMatch = line.match(/^([A-Za-z][\w\s'&/-]{1,40}):\s*(.*)$/);
      const lineBody = groupMatch ? groupMatch[2].trim() : line;
      if (groupMatch) {
        currentGroup = groupMatch[1].trim();
        groups.push(currentGroup);
        if (!lineBody) return;
      }

      const avoid = line.match(/(?:do not|don't|avoid|not)\s+(?:seat\s+)?(.+?)\s+(?:with|next to|near|beside)\s+(.+)/i);
      if (avoid) {
        constraints.push({ type: "avoid", people: [cleanName(avoid[1]), cleanName(avoid[2])].filter(Boolean), note: line });
        notes.push(line);
        return;
      }

      const together = line.match(/(?:keep\s+)?(.+?)\s+(?:sits with|sit with|with|near|next to|beside|same table as)\s+(.+)/i);
      if (together && !/[,+&/]/.test(line)) {
        constraints.push({ type: "seatNear", people: [cleanName(together[1]), cleanName(together[2])].filter(Boolean), note: line });
      }

      if (/vegetarian|vegan|allergy|gluten|halal|kosher|wheelchair|aisle|front|near|together|kid|child|baby|high chair|note|whatsapp|email|planner/i.test(line)) {
        notes.push(line);
      }

      const withoutNotes = lineBody
        .replace(/\b(?:vegetarian|vegan|gluten free|halal|kosher|nut allergy|wheelchair|aisle seat|high chair|loves fruit)\b.*$/i, "")
        .trim();

      withoutNotes
        .split(/,|;|\+|&|\/|\band\b/i)
        .map(cleanName)
        .map((name) => name.replace(/^(bride side|groom side|family|friends|college friends|kids|parents|work)\s*:?\s*/i, "").trim())
        .filter((name) => name.length > 1)
        .filter((name) => !/^\d+\s*(kids?|children|guests?|people)$/i.test(name))
        .filter((name) => !looksLikePlanningText(name))
        .forEach((name, index) => {
          guests.push({
            id: `${slugify(name) || "guest"}-${guests.length + index}`,
            name,
            group: currentGroup,
            tags: tagsForLine(line),
            notes: tagsForLine(line).length ? line : ""
          });
        });
    });

  const normalized = normalizeParsed({ guests, constraints, notes, groups, suggestedTables: [] }, input, false);
  return { ...normalized, source: "fallback" };
}

export function normalizeParsed(parsed, input, allowFallback = true) {
  const fallback = allowFallback ? fallbackParse(input) : {};
  const rawGuests = Array.isArray(parsed?.guests) ? parsed.guests : fallback.guests || [];
  const rawConstraints = Array.isArray(parsed?.constraints) ? parsed.constraints : fallback.constraints || [];
  const seen = new Set();

  let guests = rawGuests
    .filter((guest) => guest?.name)
    .map((guest) => ({
      name: cleanName(guest.name),
      group: guest.group ? cleanName(guest.group) : "",
      tags: Array.isArray(guest.tags)
        ? guest.tags.map((tag) => String(tag).toLowerCase().trim()).filter((tag) => allowedTags.has(tag)).slice(0, 6)
        : [],
      notes: guest.notes ? String(guest.notes).replace(/\s+/g, " ").trim() : ""
    }))
    .filter((guest) => guest.name.length > 1)
    .filter((guest) => !looksLikePlanningText(guest.name))
    .filter((guest) => {
      const key = guest.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((guest, index) => ({ id: `${slugify(guest.name) || "guest"}-${index}`, ...guest }));

  const constraints = rawConstraints
    .filter((constraint) => constraint?.type)
    .map((constraint) => ({
      type: String(constraint.type),
      people: Array.isArray(constraint.people) ? constraint.people.map(cleanName).filter(Boolean) : [],
      note: constraint.note ? String(constraint.note).replace(/\s+/g, " ").trim() : ""
    }))
    .filter((constraint) => constraint.note || constraint.people.length);

  const guestNames = new Set(guests.map((guest) => guest.name.toLowerCase()));
  const constraintOnlyPeople = constraints
    .flatMap((constraint) => constraint.people)
    .map(cleanName)
    .filter((name) => name.length > 1 && !looksLikePlanningText(name))
    .filter((name) => !guestNames.has(name.toLowerCase()));

  if (constraintOnlyPeople.length) {
    guests = [
      ...guests,
      ...[...new Set(constraintOnlyPeople)].map((name, offset) => ({
        id: `${slugify(name) || "guest"}-${guests.length + offset}`,
        name,
        group: "",
        tags: [],
        notes: "Mentioned in seating instruction"
      }))
    ];
  }

  const groups = Array.isArray(parsed?.groups)
    ? [...new Set(parsed.groups.map(cleanName).filter(Boolean))]
    : [...new Set(guests.map((guest) => guest.group).filter(Boolean))];
  const notes = Array.isArray(parsed?.notes) ? parsed.notes.map(String).map((note) => note.trim()).filter(Boolean) : fallback.notes || [];
  const suggestedTables = Array.isArray(parsed?.suggestedTables)
    ? parsed.suggestedTables
        .filter((table) => table?.guests?.length)
        .map((table, index) => ({
          name: table.name ? cleanName(table.name) : `Suggested group ${index + 1}`,
          guests: Array.isArray(table.guests)
            ? table.guests.map(cleanName).filter((name) => guests.some((guest) => guest.name.toLowerCase() === name.toLowerCase()))
            : [],
          reason: table.reason ? String(table.reason).replace(/\s+/g, " ").trim() : ""
        }))
        .filter((table) => table.guests.length)
        .slice(0, 40)
    : [];

  return {
    guests,
    constraints,
    groups,
    notes,
    suggestedTables,
    summary: {
      guestCount: guests.length,
      groupCount: groups.length,
      noteCount: notes.length + guests.filter((guest) => guest.notes || guest.tags.length).length,
      constraintCount: constraints.length
    }
  };
}

export function buildGuestParserPrompt(input) {
  return `You are SeatFlow's guest-list import engine for a wedding/event seating chart product.

Your job: convert messy pasted text into structured data the user can review. Users paste from Excel, WhatsApp, emails, notes, texts, or stream-of-consciousness instructions.

Return ONLY valid JSON. No markdown. No explanation. Use this exact shape:
{
  "guests": [
    {"name": "Guest Name", "group": "", "tags": [], "notes": ""}
  ],
  "constraints": [
    {"type": "avoid|keepTogether|seatNear|specialNeed|dietary|accessibility", "people": ["Guest Name"], "note": ""}
  ],
  "groups": [],
  "notes": [],
  "suggestedTables": [
    {"name": "Suggested group name", "guests": ["Guest Name"], "reason": ""}
  ]
}

Critical extraction rules:
1. Extract actual attendee names only. Never create fake placeholder guests from counts like "3 kids", "plus 2", "family of 5", or "10 coworkers".
2. Preserve names as written, including age markers like "Lucas (6)" and titles like "Mrs. Thompson".
3. Split people joined by commas, semicolons, "+", "&", "/", and "and" when those are clearly separate names.
4. Do not split business/entity names if they are clearly one attendee, but for weddings assume "Sarah and John" means two guests unless written as a company or venue.
5. If a line has a group heading, assign that group to names after it. Examples: "Bride side:", "College friends:", "Work table:", "Kids".
6. If a line has "Name - note" or "Name (note)", keep the person and put the note in notes/tags when relevant. Do not delete age markers like "(6)".
7. Put dietary/accessibility/VIP/kid facts into tags and short guest notes. Allowed tags only: vip, kid, child, vegetarian, vegan, dietary, accessibility, wheelchair, family, friend, work, planner, note.
8. Convert "don't seat A near B", "avoid A with B", "A and B cannot sit together" into an avoid constraint.
9. Convert "keep A with B", "A sits with B", "A near B", "put X table together" into keepTogether or seatNear constraints.
10. Put planning instructions that are not guests into notes. Examples: "parents near front", "needs aisle", "from WhatsApp", "maybe together", "planner said".
11. If a person appears only inside a seating instruction, include that person in guests too.
12. suggestedTables should be helpful groupings only. Include only names that are present in guests. Suggested table names are internal suggestions, not final table labels.
13. If uncertain whether text is a guest or an instruction, prefer notes over inventing a guest.
14. Output should be useful for drag-and-drop seating, not perfect prose.

Examples:
Input: "Bride side: Sarah + John, Aunt Lina\\n3 kids\\nCousin Ali vegetarian\\nGrandma needs aisle"
Output guests: Sarah, John, Aunt Lina, Cousin Ali, Grandma. Notes include "3 kids". Cousin Ali tag vegetarian. Grandma tag accessibility.

Input: "Don't seat Omar near Aisha. Lucas (6) with Maya and Bilal."
Output guests: Omar, Aisha, Lucas (6), Maya, Bilal. Constraints: avoid Omar/Aisha, seatNear or keepTogether Lucas (6)/Maya/Bilal.

Pasted text:
${input}`;
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runtimeEnv(env) {
  return env || globalThis.process?.env || {};
}

async function generateWithRetry(model, prompt) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      lastError = error;
      if (![429, 500, 502, 503, 504].includes(error.status)) throw error;
      await wait(600 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function parseGuestInput(input, env) {
  const currentEnv = runtimeEnv(env);
  const cleanInput = String(input || "").trim();
  if (!cleanInput) {
    const error = new Error("Guest list is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!currentEnv.GEMINI_API_KEY) {
    return fallbackParse(cleanInput);
  }

  const genAI = new GoogleGenerativeAI(currentEnv.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: currentEnv.GEMINI_MODEL || "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
      topP: 0.25
    }
  });

  const result = await generateWithRetry(model, buildGuestParserPrompt(cleanInput));
  const parsed = parseModelJson(result.response.text());
  return { ...normalizeParsed(parsed, cleanInput), source: "gemini" };
}

export async function checkAiStatus(env) {
  const currentEnv = runtimeEnv(env);
  if (!currentEnv.GEMINI_API_KEY) {
    return {
      ok: false,
      configured: false,
      model: currentEnv.GEMINI_MODEL || "gemini-flash-lite-latest",
      message: "GEMINI_API_KEY is missing."
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(currentEnv.GEMINI_API_KEY);
    const modelName = currentEnv.GEMINI_MODEL || "gemini-flash-lite-latest";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0
      }
    });
    const result = await generateWithRetry(model, 'Return only this JSON: {"ok":true}');
    const parsed = parseModelJson(result.response.text());
    return {
      ok: parsed.ok === true,
      configured: true,
      model: modelName,
      message: parsed.ok === true ? "AI import is connected." : "AI responded, but not with the expected status."
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      model: currentEnv.GEMINI_MODEL || "gemini-flash-lite-latest",
      message: error.message
    };
  }
}
