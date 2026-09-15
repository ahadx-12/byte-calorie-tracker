import test from "node:test";
import assert from "node:assert/strict";
import {
  productCode,
  validGTIN,
  normalizeProduct,
  productPortion,
} from "../public/scan-model.js";

test("valid GTIN and product QR payloads are accepted; arbitrary URLs are rejected", () => {
  assert.equal(productCode("3017 6204 22003"), "3017620422003");
  assert.equal(
    productCode("https://id.example/01/03017620422003/10/lot"),
    "3017620422003",
  );
  assert.equal(
    productCode(
      "https://world.openfoodfacts.org/product/3017620422003/nutella",
    ),
    "3017620422003",
  );
  assert.equal(productCode("(01)03017620422003"), "3017620422003");
  assert.ok(validGTIN("012345678905"));
  assert.throws(() => productCode("3017620422004"));
  assert.throws(() => productCode("https://example.com/promo"));
  assert.throws(() => productCode("javascript:alert(1)"));
});
test("quarter, half and measured amounts scale calories and every macro", () => {
  const label = {
    calories: 250,
    protein: 10,
    carbs: 30,
    fat: 10,
    labelAmount: 100,
    packageSize: 400,
  };
  assert.deepEqual(productPortion({ ...label, mode: "percent", amount: 25 }), {
    eaten: 100,
    calories: 250,
    protein: 10,
    carbs: 30,
    fat: 10,
  });
  assert.equal(
    productPortion({ ...label, mode: "percent", amount: 50 }).calories,
    500,
  );
  assert.equal(
    productPortion({ ...label, mode: "amount", amount: 40 }).calories,
    100,
  );
  assert.equal(
    productPortion({ ...label, labelAmount: 50, mode: "amount", amount: 100 })
      .calories,
    500,
  );
  assert.throws(() =>
    productPortion({ ...label, packageSize: 0, mode: "percent", amount: 25 }),
  );
  assert.throws(() =>
    productPortion({ ...label, calories: NaN, mode: "amount", amount: 25 }),
  );
});
test("current API nutrition is read with its unit; prepared and estimated values are excluded", () => {
  const item = (value, unit = "g", source = "packaging") => ({
    value,
    unit,
    source,
  });
  const product = {
    product_name: "Drink",
    quantity: "1 l",
    nutrition: {
      aggregated_set: {
        per: "100ml",
        preparation: "as_sold",
        nutrients: {
          "energy-kcal": item(45, "kcal"),
          proteins: item(1),
          fat: item(2, "g", "estimate"),
        },
      },
    },
  };
  const parsed = normalizeProduct(product, "012345678905");
  assert.equal(parsed.basis, "ml");
  assert.equal(parsed.packageSize, 1000);
  assert.equal(parsed.calories, 45);
  assert.equal(parsed.protein, 1);
  assert.equal(parsed.fat, null);
  product.nutrition.aggregated_set.preparation = "prepared";
  assert.equal(normalizeProduct(product, "012345678905").calories, null);
});
test("legacy kcal zero is preserved and kJ conversion is explicit", () => {
  assert.equal(
    normalizeProduct({ nutriments: { "energy-kcal_100g": 0 } }, "012345678905")
      .calories,
    0,
  );
  assert.equal(
    normalizeProduct(
      { nutriments: { "energy-kj_100g": 418.4 } },
      "012345678905",
    ).calories,
    100,
  );
  assert.equal(
    normalizeProduct({ quantity: "6 x 100 g" }, "012345678905").packageSize,
    null,
  );
  assert.equal(
    normalizeProduct({ quantity: "400 g", nutriments: {} }, "012345678905")
      .calories,
    null,
  );
});
