import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  validateState,
  portion,
  totals,
  shiftDate,
  validDate,
} from "../public/core.js";
import { FOODS } from "../public/foods.js";
test("portion math preserves precision and scales cooked rice from 100g", () => {
  assert.deepEqual(
    portion(
      FOODS.find((f) => f.name === "White rice, cooked"),
      200,
    ),
    { calories: 260, protein: 5.4, carbs: 56.4, fat: 0.6 },
  );
  assert.equal(
    totals([{ calories: 12.5 }, { calories: 10.25 }]).calories,
    22.75,
  );
});
test("calendar arithmetic handles month, year and leap boundaries", () => {
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(validDate("2026-02-30"), false);
});
test("backups reject corrupt records, unsupported versions and nonfinite numbers", () => {
  const s = initialState();
  assert.equal(validateState(s), s);
  for (const bad of [
    { ...s, version: 2 },
    { ...s, profiles: [] },
    { ...s, active: "missing" },
  ])
    assert.throws(() => validateState(bad));
  s.profiles[0].goals.calories = NaN;
  assert.throws(() => validateState(s));
});
test("backup validator protects nested food and day values", () => {
  const s = initialState();
  s.profiles[0].days["2026-02-30"] = { water: 250 };
  assert.throws(() => validateState(s));
  delete s.profiles[0].days["2026-02-30"];
  s.profiles[0].foods = [{ id: "1", name: "Bad", serving: 0 }];
  assert.throws(() => validateState(s));
});
test("all built-in food estimates are finite with valid serving weights", () => {
  assert.equal(FOODS.length, 40);
  for (const f of FOODS) {
    assert.ok(f.serving > 0);
    for (const k of ["calories", "protein", "carbs", "fat"])
      assert.ok(Number.isFinite(f[k]) && f[k] >= 0);
  }
});
