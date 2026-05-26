import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

if (!/Minimal:\s*9/.test(source)) {
  throw new Error("Minimal template must render 9 tables per page.");
}

if (!/"Minimal 2":\s*6/.test(source)) {
  throw new Error("Minimal 2 template must render 6 tables per page.");
}

console.log("Template pagination smoke tests passed.");
