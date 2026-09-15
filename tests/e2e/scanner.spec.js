import { test, expect } from "@playwright/test";
import ZXing from "@zxing/library";
// Request interception must happen in the page, not inside WebKit's service worker.
// The existing offline suite verifies the real service worker separately.
test.use({ serviceWorkers: "block" });

const code = "3017620422003";
const item = (value, unit = "g") => ({ value, unit, source: "packaging" });
const product = {
  status: "success",
  product: {
    product_name: "Test yogurt",
    quantity: "400 g",
    nutrition: {
      aggregated_set: {
        per: "100g",
        preparation: "as_sold",
        nutrients: {
          "energy-kcal": item(250, "kcal"),
          proteins: item(10),
          carbohydrates: item(30),
          fat: item(10),
        },
      },
    },
  },
};
function qrSvg(text = code) {
  const matrix = new ZXing.QRCodeWriter().encode(
    text,
    ZXing.BarcodeFormat.QR_CODE,
    280,
    280,
    new Map(),
  );
  const paths = [];
  for (let y = 0; y < matrix.getHeight(); y++)
    for (let x = 0; x < matrix.getWidth(); x++)
      if (matrix.get(x, y)) paths.push(`M${x} ${y}h1v1h-1z`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280"><rect width="280" height="280" fill="white"/><path d="${paths.join("")}" fill="black"/></svg>`;
}
function eanSvg() {
  const L = [
    "0001101",
    "0011001",
    "0010011",
    "0111101",
    "0100011",
    "0110001",
    "0101111",
    "0111011",
    "0110111",
    "0001011",
  ];
  const parity = [
    "LLLLLL",
    "LLGLGG",
    "LLGGLG",
    "LLGGGL",
    "LGLLGG",
    "LGGLLG",
    "LGGGLL",
    "LGLGLG",
    "LGLGGL",
    "LGGLGL",
  ][Number(code[0])];
  const inverse = (s) => [...s].map((c) => (c === "0" ? "1" : "0")).join("");
  let bits = "101";
  for (let i = 1; i <= 6; i++)
    bits +=
      parity[i - 1] === "L"
        ? L[code[i]]
        : inverse([...L[code[i]]].reverse().join(""));
  bits += "01010";
  for (let i = 7; i < 13; i++) bits += inverse(L[code[i]]);
  bits += "101";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="200"><rect width="460" height="200" fill="white"/>${[...bits].map((bit, i) => (bit === "1" ? `<rect x="${40 + i * 4}" y="25" width="4" height="150" fill="black"/>` : "")).join("")}</svg>`;
}
async function open(page) {
  await page.goto("/");
  await page.locator("#scan-food").click();
}
async function mockLookup(page, data = product, status = 200) {
  await page.route("https://world.openfoodfacts.org/api/**", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}
async function lookup(page) {
  await page.locator("#barcode-input").fill(code);
  await page.getByRole("button", { name: "Find product", exact: true }).click();
}

test("centered main actions, lookup, quarter-package log and offline saved product", async ({
  page,
  context,
}) => {
  await mockLookup(page);
  await page.goto("/");
  const log = await page.locator("#log-food").boundingBox(),
    scan = await page.locator("#scan-food").boundingBox();
  expect(log.width).toBeGreaterThan(scan.width);
  expect(Math.abs(log.y - scan.y)).toBeLessThan(2);
  await page.locator("#log-food").click();
  await expect(page.getByRole("button", { name: "Find a food" })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("#scan-food").click();
  await lookup(page);
  await expect(page.getByLabel("Product name")).toHaveValue("Test yogurt");
  await page
    .getByRole("button", { name: "25% of package", exact: true })
    .click();
  await expect(page.locator("#scan-portion-preview")).toContainText("250");
  await expect(page.locator("#scan-portion-preview")).toContainText("100 g");
  await page.getByRole("button", { name: "Add to diary", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("250");
  await page.reload();
  await context.setOffline(true);
  await page.locator("#scan-food").click();
  await lookup(page);
  await page
    .getByRole("button", { name: "50% of package", exact: true })
    .click();
  await expect(page.locator("#scan-portion-preview")).toContainText("500");
  await page.getByRole("button", { name: "Add to diary", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("750");
});
test("typed product QR and locally decoded QR and EAN photos reach the product", async ({
  page,
}) => {
  await mockLookup(page);
  await open(page);
  await page.locator("#barcode-input").fill(`https://id.example/01/0${code}`);
  await page.getByRole("button", { name: "Find product", exact: true }).click();
  await expect(page.getByLabel("Product name")).toHaveValue("Test yogurt");
  for (const [name, svg] of [
    ["qr.svg", qrSvg()],
    ["ean.svg", eanSvg()],
  ]) {
    await page.getByRole("button", { name: "‹ Back to scanner" }).click();
    await page
      .locator("#scan-photo")
      .setInputFiles({
        name,
        mimeType: "image/svg+xml",
        buffer: Buffer.from(svg),
      });
    await expect(page.getByLabel("Product name")).toHaveValue("Test yogurt");
  }
});
test("missing products and missing calories offer a manual label with per-serving math", async ({
  page,
}) => {
  await mockLookup(page, {}, 404);
  await open(page);
  await lookup(page);
  await expect(page.locator("#scan-status")).toContainText("Product not found");
  await page
    .getByRole("button", { name: "Enter the package label myself" })
    .click();
  await page.getByLabel("Product name").fill("Homemade label");
  await page.getByLabel("Label values per").fill("30");
  await page.getByLabel("Label calories (kcal)").fill("120");
  await page.getByLabel("Full package size").fill("240");
  await page
    .getByRole("button", { name: "25% of package", exact: true })
    .click();
  await expect(page.locator("#scan-portion-preview")).toContainText("240");
  await page.getByRole("button", { name: "Add to diary", exact: true }).click();
  await expect(page.locator(".big-number")).toContainText("240");
});
test("unrecognized QR, missing package size, liquid units and database failure", async ({
  page,
}) => {
  await mockLookup(page, {}, 503);
  await open(page);
  await page.locator("#barcode-input").fill("https://example.com/promo");
  await page.getByRole("button", { name: "Find product", exact: true }).click();
  await expect(page.locator("#scan-status")).toContainText(
    "No valid product barcode",
  );
  await lookup(page);
  await expect(page.locator("#scan-status")).toContainText("unavailable");
  await page
    .getByRole("button", { name: "Enter the package label myself" })
    .click();
  await page.getByLabel("Product name").fill("Milk");
  await page.getByLabel("Label calories (kcal)").fill("60");
  await page.getByLabel("Label unit", { exact: true }).selectOption("ml");
  await page
    .getByRole("button", { name: "50% of package", exact: true })
    .click();
  await expect(page.locator("#scan-portion-preview")).toContainText(
    "full package size",
  );
  await page.getByLabel("Full package size").fill("500");
  await expect(page.locator("#scan-portion-preview")).toContainText("150");
  await expect(page.locator("#scan-portion-preview")).toContainText("250 ml");
});
test("denied camera permission leaves photo and manual options usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await open(page);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.locator("#scan-status")).toContainText("denied");
  await expect(page.getByRole("button", { name: "Use a photo" })).toBeEnabled();
  await page
    .getByRole("button", { name: "Enter the package label myself" })
    .click();
  await expect(page.getByLabel("Product name")).toBeVisible();
});
test("a late camera permission result releases tracks after dialog closes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.resolveCamera = () =>
          resolve({
            getTracks: () => [
              {
                stop: () => {
                  window.cameraStopped = true;
                },
              },
            ],
          });
      });
  });
  await open(page);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof window.resolveCamera))
    .toBe("function");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.evaluate(() => window.resolveCamera());
  await expect.poll(() => page.evaluate(() => window.cameraStopped)).toBe(true);
});
test("real camera decoder reads a video stream and releases it on success", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Canvas camera fixture uses Chromium captureStream; WebKit is covered by real image decoding and permission lifecycle tests.",
  );
  await mockLookup(page);
  await page.addInitScript((svg) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 280;
      const image = new Image();
      image.src = "data:image/svg+xml;base64," + btoa(svg);
      await image.decode();
      canvas.getContext("2d").drawImage(image, 0, 0);
      const stream = canvas.captureStream(5);
      window.cameraTrack = stream.getVideoTracks()[0];
      return stream;
    };
  }, qrSvg());
  await open(page);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByLabel("Product name")).toHaveValue("Test yogurt");
  await expect
    .poll(() => page.evaluate(() => window.cameraTrack.readyState))
    .toBe("ended");
});
