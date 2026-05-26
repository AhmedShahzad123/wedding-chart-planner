import "dotenv/config";
import { parseGuestInput } from "../server/parser.js";

const cases = [
  {
    name: "WhatsApp wedding notes",
    input: `Bride side: Sarah + John, Aunt Lina
3 kids
College friends table maybe together: Omar, Aisha, Lucas (6)
Cousin Ali vegetarian
Needs aisle seat: Grandma
Don't seat Omar near Uncle Bob
Keep parents near the front`,
    mustInclude: ["Sarah", "John", "Aunt Lina", "Omar", "Aisha", "Lucas (6)", "Cousin Ali", "Grandma", "Uncle Bob"],
    mustExclude: ["3 kids", "College friends table maybe together", "Keep parents near the front"]
  },
  {
    name: "Spreadsheet-ish rows",
    input: `Name, Group, Notes
Mrs. Thompson, VIP, wheelchair access
Mr. Thompson, VIP
Best Man, Wedding Party
Maid of Honor, Wedding Party
Nadia Khan, Work, vegan
Bilal Ahmed, Work, halal`,
    mustInclude: ["Mrs. Thompson", "Mr. Thompson", "Best Man", "Maid of Honor", "Nadia Khan", "Bilal Ahmed"],
    mustExclude: ["Name", "Group", "Notes"]
  },
  {
    name: "Stream of consciousness",
    input: `okay so put grandma rose and grandpa joe together, but don't put uncle mark by aunt lina.
kids are noah (8), mia (5), ethan (7) - maybe all same table.
friends: james/sophie/mike/zoe
planner note: venue wants parents close to entrance`,
    mustInclude: ["Grandma Rose", "Grandpa Joe", "Uncle Mark", "Aunt Lina", "Noah (8)", "Mia (5)", "Ethan (7)", "James", "Sophie", "Mike", "Zoe"],
    mustExclude: ["planner note", "venue wants parents close to entrance"]
  },
  {
    name: "Email paste with bullets",
    input: `Hi! Final list below:
- Bride: Emma
- Groom: Daniel
- Parents: Mr. Brown & Mrs. Brown; Mr. Clark and Mrs. Clark
- Cousins table: Karim, Rania, Dina, Salma, Yusuf
Please keep Karim away from Dina if possible.
Two extra babies no names yet.`,
    mustInclude: ["Emma", "Daniel", "Mr. Brown", "Mrs. Brown", "Mr. Clark", "Mrs. Clark", "Karim", "Rania", "Dina", "Salma", "Yusuf"],
    mustExclude: ["Two extra babies", "Final list below"]
  }
];

function includesName(result, name) {
  return result.guests.some((guest) => guest.name.toLowerCase() === name.toLowerCase());
}

for (const testCase of cases) {
  const result = await parseGuestInput(testCase.input);
  const names = result.guests.map((guest) => guest.name);
  const missing = testCase.mustInclude.filter((name) => !includesName(result, name));
  const bad = testCase.mustExclude.filter((name) => names.some((guestName) => guestName.toLowerCase() === name.toLowerCase()));

  console.log(`\n${testCase.name}`);
  console.log(`source=${result.source} guests=${result.guests.length} constraints=${result.constraints.length} tables=${result.suggestedTables.length}`);
  console.log(names.join(", "));

  if (missing.length || bad.length) {
    console.error(JSON.stringify({ missing, bad, result }, null, 2));
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log("\nParser smoke tests passed.");
}
