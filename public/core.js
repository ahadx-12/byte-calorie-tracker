export const KEY = "byte-diary-v1";
export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
export const uid = () => crypto.randomUUID();
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date, amount) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return localDate(d);
}
export function newProfile(name = "My diary") {
  return {
    id: uid(),
    name,
    goals: { calories: 2200, protein: 120, water: 2000 },
    entries: [],
    days: {},
    foods: [],
    favorites: [],
  };
}
export function initialState() {
  const p = newProfile();
  return { version: 1, active: p.id, profiles: [p] };
}
export function totals(entries) {
  return entries.reduce(
    (a, e) => {
      for (const k of ["calories", "protein", "carbs", "fat"])
        a[k] += e[k] || 0;
      return a;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
export function portion(food, grams) {
  return Object.fromEntries(
    ["calories", "protein", "carbs", "fat"].map((k) => [
      k,
      Math.round(food[k] * grams) / 100,
    ]),
  );
}
export function validDate(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    localDate(new Date(`${s}T12:00:00`)) === s
  );
}
const str = (v, max = 100) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const num = (v, max = 100000) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const nutrients = (o) =>
  ["calories", "protein", "carbs", "fat"].every((k) => num(o[k]));
export function validateState(s) {
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.profiles) ||
    s.profiles.length < 1 ||
    s.profiles.length > 5
  )
    throw Error("This is not a supported Byte Milad backup.");
  const ids = new Set();
  for (const p of s.profiles) {
    if (!p || !str(p.id) || ids.has(p.id) || !str(p.name, 40))
      throw Error("Invalid profile in backup.");
    ids.add(p.id);
    if (
      !p.goals ||
      !num(p.goals.calories, 10000) ||
      p.goals.calories < 1 ||
      !num(p.goals.protein, 1000) ||
      !num(p.goals.water, 10000)
    )
      throw Error("Invalid goals in backup.");
    if (
      !Array.isArray(p.entries) ||
      p.entries.length > 50000 ||
      !Array.isArray(p.foods) ||
      p.foods.length > 2000 ||
      !Array.isArray(p.favorites) ||
      !p.favorites.every((x) => str(x))
    )
      throw Error("Invalid food records in backup.");
    const entries = new Set();
    for (const e of p.entries) {
      if (
        !e ||
        !str(e.id) ||
        entries.has(e.id) ||
        !str(e.name) ||
        !validDate(e.date) ||
        !MEALS.includes(e.meal) ||
        !nutrients(e) ||
        !str(e.amount, 100) ||
        typeof e.estimated !== "boolean"
      )
        throw Error("Invalid diary entry in backup.");
      entries.add(e.id);
    }
    for (const f of p.foods)
      if (
        !f ||
        !str(f.id) ||
        !str(f.name) ||
        !nutrients(f) ||
        !num(f.serving, 10000) ||
        f.serving <= 0 ||
        !str(f.unit) ||
        (f.basis !== undefined && !["g", "ml"].includes(f.basis)) ||
        (f.packageSize != null &&
          (!num(f.packageSize, 10000) || f.packageSize <= 0)) ||
        (f.barcode != null && !/^\d{8,14}$/.test(f.barcode))
      )
        throw Error("Invalid saved food in backup.");
    if (!p.days || typeof p.days !== "object" || Array.isArray(p.days))
      throw Error("Invalid daily records.");
    for (const [date, d] of Object.entries(p.days))
      if (
        !validDate(date) ||
        !d ||
        !num(d.water, 20000) ||
        !(d.weight == null || (num(d.weight, 1000) && d.weight > 0))
      )
        throw Error("Invalid water or weight record.");
  }
  if (!ids.has(s.active)) throw Error("Missing active profile.");
  return s;
}
