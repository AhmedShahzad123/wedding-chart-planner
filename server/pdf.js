import chromium from "@sparticuz/chromium";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

let browserPromise;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const embeddedFontCssCache = new Map();
const fontFiles = {
  "Abramo Script": "Abramo Script.woff2",
  "29LT Zarid Display": "29LT Zarid Display.woff2",
  "Kudryashev Display": "KudryashevDisplay.woff2",
  BDScript: "bdscript.woff2",
  Cardo: "Cardo-Regular.woff2"
};

export async function renderPdfFromHtml(html) {
  if (!html || typeof html !== "string") {
    const error = new Error("Printable HTML is required.");
    error.statusCode = 400;
    throw error;
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultTimeout(15000);
    await page.setContent(injectEmbeddedFonts(html), { waitUntil: "load", timeout: 15000 });
    await page.evaluate(async () => {
      const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await Promise.race([document.fonts?.ready || Promise.resolve(), timeout(3500)]);
      const images = [...document.images];
      await Promise.allSettled(images.map((image) => {
        if (image.complete) return Promise.resolve();
        const loaded = image.decode ? image.decode() : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
        return Promise.race([loaded, timeout(5000)]);
      }));
    });
    await page.emulateMediaType("print");
    return await page.pdf({
      format: "A4",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
      printBackground: true
    });
  } finally {
    await page.close();
  }
}

function injectEmbeddedFonts(html) {
  const embeddedFontCss = getEmbeddedFontCss(html);
  if (!embeddedFontCss) return html;
  const styleTag = `<style data-seatflow-pdf-fonts>${embeddedFontCss}</style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${styleTag}</head>`);
  return `${styleTag}${html}`;
}

function getEmbeddedFontCss(html) {
  const families = selectFontFamilies(html);
  const cacheKey = families.join("|");
  if (!embeddedFontCssCache.has(cacheKey)) {
    embeddedFontCssCache.set(cacheKey, buildEmbeddedFontCss(families));
  }
  return embeddedFontCssCache.get(cacheKey);
}

function selectFontFamilies(html) {
  if (html.includes("template-page-sage-garden")) return ["BDScript", "Cardo"];
  if (html.includes("template-page-minimal-2")) return ["Abramo Script", "29LT Zarid Display"];
  return ["Kudryashev Display", "29LT Zarid Display"];
}

function buildEmbeddedFontCss(families) {
  return families.map((family) => {
    const fontPath = path.join(rootDir, "public", "fonts", fontFiles[family]);
    const data = fs.readFileSync(fontPath).toString("base64");
    return `
      @font-face {
        font-family: "${family}";
        src: url("data:font/woff2;base64,${data}") format("woff2");
        font-display: block;
        font-style: normal;
        font-weight: 400;
      }
    `;
  }).join("\n");
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch(await getLaunchOptions()).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

async function getLaunchOptions() {
  if (isServerlessRuntime()) {
    const headless = "shell";
    return {
      args: puppeteer.defaultArgs({ args: chromium.args, headless }),
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless
    };
  }

  return {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: findLocalChromeExecutable(),
    headless: "new"
  };
}

function isServerlessRuntime() {
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);
}

function findLocalChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  const candidates = getChromeCandidates();
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (executablePath) return executablePath;

  throw new Error(
    "Could not find a local Chrome/Edge executable for PDF generation. Set PUPPETEER_EXECUTABLE_PATH to your browser executable."
  );
}

function getChromeCandidates() {
  if (process.platform === "win32") {
    const prefixes = [
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA
    ].filter(Boolean);

    return prefixes.flatMap((prefix) => [
      path.join(prefix, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(prefix, "Microsoft", "Edge", "Application", "msedge.exe")
    ]);
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")
    ];
  }

  return [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge"
  ];
}
