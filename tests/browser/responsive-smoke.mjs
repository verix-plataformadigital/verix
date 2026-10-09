import { pathToFileURL } from "node:url";

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) {
  throw new Error("PLAYWRIGHT_MODULE must point to the pinned Playwright installation.");
}

const { chromium, webkit } = await import(pathToFileURL(modulePath).href);
const baseURL = process.env.VERIX_V2_TEST_URL ?? "http://127.0.0.1:4173/";

const viewports = [
  { width: 320, height: 568, label: "small-phone-portrait" },
  { width: 360, height: 800, label: "phone-portrait" },
  { width: 390, height: 844, label: "large-phone-portrait" },
  { width: 844, height: 390, label: "phone-landscape" },
  { width: 768, height: 1024, label: "tablet-portrait" },
  { width: 1024, height: 768, label: "tablet-landscape" },
  { width: 1280, height: 800, label: "desktop" }
];

const moduleChecks = [
  { id: "main", selector: ".home-module" },
  { id: "vehicle", selector: ".vehicle-query-form" },
  { id: "history", selector: ".history-module" },
  { id: "cinemometer", selector: ".cin-form" },
  { id: "legislation", selector: ".legislation-module" },
  { id: "alcohol", selector: ".alcohol-table-wrap" },
  { id: "settings", selector: ".settings-module" },
  { id: "tools", selector: ".tools-table-wrap" },
  { id: "information", selector: ".information-module" }
];

const jobs = [
  { name: "Chromium", engine: chromium, dimensions: viewports },
  {
    name: "WebKit",
    engine: webkit,
    dimensions: viewports.filter((item) => [320, 390, 768].includes(item.width))
  }
];

let completedViewportChecks = 0;
let completedModuleChecks = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const job of jobs) {
  const browser = await job.engine.launch({ headless: true });
  try {
    for (const viewport of job.dimensions) {
      const hasTouch = viewport.width <= 1024;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch,
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      // Prevent telemetry and live operational network probes during UI tests.
      await page.route(/^https:\/\/[^/]+\.supabase\.co\//, (route) => route.abort());

      try {
        await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.locator(".verix-nav-item[data-module='main']").waitFor({
          state: "visible",
          timeout: 10_000
        });
        await page.locator(".home-module").waitFor({ state: "visible", timeout: 10_000 });

        const viewportState = await page.evaluate(() => {
          const nav = document.querySelector(".verix-nav");
          return {
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            navDisplay: getComputedStyle(nav).display,
            navClientWidth: nav.clientWidth,
            navScrollWidth: nav.scrollWidth
          };
        });

        assert(
          viewportState.documentWidth <= viewport.width + 1 &&
          viewportState.bodyWidth <= viewport.width + 1,
          job.name + " " + viewport.label + ": horizontal page overflow " + JSON.stringify(viewportState)
        );

        if (viewport.width <= 1024) {
          assert(
            viewportState.navDisplay === "flex",
            job.name + " " + viewport.label + ": navigation did not switch to a horizontal row"
          );
        }

        if (viewport.width <= 760) {
          const navLabelFont = await page.locator(".verix-nav-item[data-module='vehicle']").evaluate(
            (element) => Number.parseFloat(getComputedStyle(element).fontSize)
          );
          assert(navLabelFont >= 8, job.name + " " + viewport.label + ": module labels are too small");

          await page.locator(".verix-nav-item[data-module='vehicle']").click();
          await page.locator(".vehicle-query-form").waitFor({ state: "visible" });
          const plateFontSize = await page.locator(".vehicle-field input").first().evaluate(
            (element) => Number.parseFloat(getComputedStyle(element).fontSize)
          );
          assert(
            plateFontSize >= 16,
            job.name + " " + viewport.label + ": input font " + plateFontSize + "px can trigger iOS auto-zoom"
          );
          completedModuleChecks++;
          await page.locator(".verix-nav-item[data-module='main']").click();
          await page.locator(".home-module").waitFor({ state: "visible" });
        }

        const navTargetHeight = await page
          .locator(".verix-nav-item[data-module='vehicle']")
          .evaluate((element) => element.getBoundingClientRect().height);
        if (hasTouch) {
          assert(
            navTargetHeight >= 48,
            job.name + " " + viewport.label + ": touch target is only " + navTargetHeight + "px high"
          );
        }

        for (const module of moduleChecks) {
          const navButton = page.locator(".verix-nav-item[data-module='" + module.id + "']");
          await navButton.scrollIntoViewIfNeeded();
          await navButton.click();
          await page.locator(module.selector).waitFor({ state: "visible", timeout: 5_000 });

          const state = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth
          }));
          assert(
            state.documentWidth <= viewport.width + 1 && state.bodyWidth <= viewport.width + 1,
            job.name + " " + viewport.label + " after " + module.id + ": page overflow " + JSON.stringify(state)
          );
          assert(
            await navButton.getAttribute("aria-current") === "page",
            job.name + " " + viewport.label + ": " + module.id + " navigation state was not updated"
          );
          completedModuleChecks++;
        }

        if (viewport.width <= 390) {
          const scrollRegion = page.locator(".tools-table-wrap");
          assert(await scrollRegion.count() === 1, job.name + " " + viewport.label + ": road table wrapper missing");
          const dimensions = await scrollRegion.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          }));
          assert(
            dimensions.scrollWidth > dimensions.clientWidth,
            job.name + " " + viewport.label + ": road table should scroll inside its own region " + JSON.stringify(dimensions)
          );
        }

        assert(pageErrors.length === 0, job.name + " " + viewport.label + ": browser errors: " + pageErrors.join(" | "));
        completedViewportChecks++;
        console.log("PASS " + job.name + " " + viewport.width + "x" + viewport.height + " (" + viewport.label + ")");
      } catch (error) {
        const screenshotPath = (process.env.RUNNER_TEMP ?? "/tmp") + "/verix-responsive-" +
          job.name.toLowerCase() + "-" + viewport.width + "x" + viewport.height + ".png";
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        console.error("FAIL " + job.name + " " + viewport.width + "x" + viewport.height + "; screenshot: " + screenshotPath);
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

console.log(
  "Responsive browser regression passed: " + completedViewportChecks +
  " browser/viewports, " + completedModuleChecks + " module/layout checks; Chromium + WebKit."
);
