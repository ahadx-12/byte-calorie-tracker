import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
async function quick(
  page,
  name = "Lunch plate",
  calories = "500",
  remember = false,
) {
  await page.getByRole("button", { name: "+ Add food", exact: true }).click();
  await page.getByRole("button", { name: "Quick entry", exact: true }).click();
  await page.getByLabel("Food or meal name").fill(name);
  await page.getByLabel("Calories (kcal)", { exact: true }).fill(calories);
  await page.getByLabel("Protein (g)", { exact: true }).fill("30");
  if (remember) await page.getByLabel("Save this meal for next time").check();
  await page.getByRole("button", { name: "Add to diary", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("food search, gram math, favorite, edit, delete and undo persist", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Add to Breakfast", exact: true })
    .click();
  await page.getByLabel("Search the food shelf").fill("White rice");
  await page
    .getByRole("button", { name: "Star White rice, cooked", exact: true })
    .click();
  await page.getByRole("button", { name: /White rice, cooked.*cup/ }).click();
  await page.getByLabel("Measure", { exact: true }).selectOption("grams");
  await page.getByLabel("Amount", { exact: true }).fill("200");
  await expect(page.locator("#portion-result")).toContainText("260");
  await page.getByRole("button", { name: "Add to diary", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("260");
  await page.reload();
  await expect(page.locator(".big-number")).toContainText("260");
  await page.getByRole("button", { name: "Edit White rice, cooked" }).click();
  await page.getByLabel("Calories (kcal)", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("300");
  await page.getByRole("button", { name: "Edit White rice, cooked" }).click();
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("0");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("300");
});
test("saved meals scale by servings, never fabricated grams", async ({
  page,
}) => {
  await quick(page, "My sandwich", "420", true);
  await page.getByRole("button", { name: "+ Add food", exact: true }).click();
  await page.getByLabel("Search the food shelf").fill("My sandwich");
  await page.getByRole("button", { name: /My sandwich.*420/ }).click();
  await expect(
    page.getByLabel("Measure", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await page.getByLabel("Amount", { exact: true }).fill("2");
  await expect(page.locator("#portion-result")).toContainText("840");
  await page.getByRole("button", { name: "Add to diary", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("1,260");
});
test("copy previous day, water and history weight", async ({ page }) => {
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await quick(page);
  await page.getByRole("button", { name: "Today", exact: true }).last().click();
  await page.getByRole("button", { name: "Copy previous day" }).click();
  await page.getByRole("button", { name: "Copy 1 entries" }).click();
  await expect(page.locator(".big-number")).toContainText("500");
  await page.getByRole("button", { name: "+ 250 ml" }).click();
  await expect(page.locator(".water-total")).toContainText("0.25");
  await page.getByRole("button", { name: "Remove 250 ml of water" }).click();
  await expect(page.locator(".water-total")).toContainText("0.0");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".stat").nth(1)).toContainText("2 / 7");
  await page.getByLabel("Weight (kg)").fill("75.5");
  await page.getByRole("button", { name: "Save weight" }).click();
  await expect(page.locator(".history-table")).toContainText("75.5");
  await page.getByRole("button", { name: /Delete weight for/ }).click();
  await expect(
    page.getByText("No weigh-ins yet.", { exact: false }),
  ).toBeVisible();
});
test("goals and profiles remain isolated after reload", async ({ page }) => {
  await quick(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Daily calories (kcal)").fill("2500");
  await page.getByRole("button", { name: "Save goals" }).click();
  await page.getByLabel("Current profile name").fill("Brother");
  await page.getByRole("button", { name: "Rename profile" }).click();
  await page.getByRole("button", { name: "+ New profile" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Guest");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .getByRole("button", { name: "Today", exact: true })
    .first()
    .click();
  await expect(page.locator(".big-number")).toHaveText("0kcal");
  await page.getByLabel("Active profile").selectOption({ label: "Brother" });
  await expect(page.locator(".big-number")).toContainText("500");
  await expect(page.locator(".summary-label")).toContainText("2,500");
  await page.reload();
  await expect(page.locator(".big-number")).toContainText("500");
});
test("backup export, validated restore, escaping and rejected corrupt backup", async ({
  page,
}) => {
  await quick(page, "<img src=x onerror=alert(1)>", "123");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await downloadEvent;
  const path = await download.path();
  await page.getByLabel("Daily calories (kcal)").fill("3100");
  await page.getByRole("button", { name: "Save goals" }).click();
  await page.locator("#import-file").setInputFiles(path);
  await page.getByRole("button", { name: "Replace and restore" }).click();
  await expect(page.getByLabel("Daily calories (kcal)")).toHaveValue("2200");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1}'),
    });
  await expect(page.locator("#toast")).toContainText("Could not restore");
  await page
    .getByRole("button", { name: "Today", exact: true })
    .first()
    .click();
  await expect(page.locator(".entry-name")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".entry img")).toHaveCount(0);
});
test("offline reload and logging work without a server", async ({
  page,
}, testInfo) => {
  // WebKit's emulated offline flag rejects navigation before consulting its service worker.
  // Stop a dedicated real server instead, so both engines exercise actual cached navigation.
  const port = testInfo.project.name.includes("webkit") ? 4186 : 4185;
  const server = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: { ...process.env, PORT: String(port) },
  });
  try {
    await once(server.stdout, "data");
    await page.goto(`http://127.0.0.1:${port}`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const before = await page.evaluate(() => performance.timeOrigin);
    server.kill();
    await once(server, "exit");
    await page.reload();
    expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(before);
    await expect(
      page.getByRole("heading", { name: "Make today count." }),
    ).toBeVisible();
    await quick(page, "Offline snack", "200");
    await page.reload();
    await expect(page.locator(".big-number")).toContainText("200");
  } finally {
    server.kill();
  }
});
test("all screens fit mobile width and dialog is keyboard accessible", async ({
  page,
}) => {
  for (const name of ["Today", "History", "Settings"]) {
    await page.getByRole("button", { name, exact: true }).first().click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Today", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "+ Add food", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("unreadable storage is preserved instead of silently overwritten", async ({
  page,
}) => {
  await page.evaluate(() => localStorage.setItem("byte-diary-v1", "broken"));
  await page.reload();
  await expect(page.locator("#storage-warning")).toBeVisible();
  await page.getByRole("button", { name: "+ 250 ml" }).click();
  expect(await page.evaluate(() => localStorage.getItem("byte-diary-v1"))).toBe(
    "broken",
  );
});
