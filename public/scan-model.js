// Pure scanner parsing and portion arithmetic. No camera or network access here.
export function validGTIN(code) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((n, d, i) => n + d * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function productCode(raw) {
  const text = String(raw).trim();
  if (text.length > 2048)
    throw Error(
      "That code is too long. Try the barcode below the printed numbers.",
    );
  let code = text.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code)) {
    // GS1 element strings and Digital Links carry GTIN in AI 01.
    const gs1 = text.match(/^(?:\]d2|\]C1)?(?:\(01\)|01)(\d{14})(?:\D|$)/);
    if (gs1) code = gs1[1];
    else {
      let url;
      try {
        url = new URL(text);
      } catch {
        /* Show a useful message below. */
      }
      if (url && ["https:", "http:"].includes(url.protocol)) {
        code =
          url.pathname.match(
            /\/(?:01|product|produit)\/(\d{8,14})(?:\/|$)/,
          )?.[1] ||
          ["gtin", "ean", "barcode"]
            .map((k) => url.searchParams.get(k))
            .find(Boolean) ||
          "";
      } else code = "";
    }
  }
  if (!validGTIN(code))
    throw Error(
      "No valid product barcode found. Try the package’s EAN/UPC barcode or enter its printed numbers. Ordinary website QR codes do not contain nutrition data.",
    );
  // Open Food Facts represents zero-padded GTINs in their shorter form.
  while (code.length > 13 && code.startsWith("0")) code = code.slice(1);
  return code;
}

const number = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null;
function quantity(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i);
  if (!match) return null;
  const u = match[2].toLowerCase();
  return {
    amount:
      Number(match[1].replace(",", ".")) *
      ({ kg: 1000, l: 1000, cl: 10 }[u] || 1),
    unit: ["ml", "cl", "l"].includes(u) ? "ml" : "g",
  };
}
export function normalizeProduct(product, code) {
  const n = { ...product.nutriments };
  const aggregate = product.nutrition?.aggregated_set;
  const supportedAggregate =
    aggregate?.preparation === "as_sold" &&
    ["100g", "100ml"].includes(aggregate.per);
  if (supportedAggregate) {
    for (const key of [
      "energy-kcal",
      "energy-kj",
      "proteins",
      "carbohydrates",
      "fat",
    ]) {
      const item = aggregate.nutrients?.[key];
      const unit =
        key === "energy-kcal" ? "kcal" : key === "energy-kj" ? "kJ" : "g";
      if (item && item.source !== "estimate" && item.unit === unit)
        n[`${key}_100g`] = item.value;
    }
  }
  const pkg =
    quantity(
      `${product.product_quantity || ""} ${product.product_quantity_unit || ""}`,
    ) || quantity(product.quantity);
  const serving = quantity(product.serving_size);
  const basis = supportedAggregate
    ? aggregate.per === "100ml"
      ? "ml"
      : "g"
    : pkg?.unit || serving?.unit || "g";
  const kcal = number(n["energy-kcal_100g"]);
  const kj =
    number(n["energy-kj_100g"]) ??
    (n.energy_unit === "kJ" ? number(n.energy_100g) : null);
  const bounded = (v, max) => (v !== null && v <= max ? v : null);
  return {
    barcode: code,
    name: String(
      product.product_name ||
        product.product_name_en ||
        product.brands ||
        "Scanned product",
    ).slice(0, 100),
    brand: String(product.brands || "").slice(0, 100),
    basis,
    packageSize:
      pkg?.unit === basis && pkg.amount > 0 && pkg.amount <= 10000
        ? pkg.amount
        : null,
    labelServing:
      serving?.unit === basis && serving.amount > 0 ? serving.amount : null,
    calories: bounded(
      kcal ?? (kj === null ? null : Math.round((kj / 4.184) * 100) / 100),
      1000,
    ),
    protein: bounded(number(n.proteins_100g), 100),
    carbs: bounded(number(n.carbohydrates_100g), 100),
    fat: bounded(number(n.fat_100g), 100),
    source: "openfoodfacts",
  };
}

export function productPortion({
  calories,
  protein = 0,
  carbs = 0,
  fat = 0,
  labelAmount = 100,
  amount,
  mode,
  packageSize,
}) {
  if (!Number.isFinite(labelAmount) || labelAmount <= 0 || labelAmount > 10000)
    throw Error("Enter the weight or volume covered by the label values.");
  if (!Number.isFinite(amount) || amount <= 0)
    throw Error("Enter how much you ate.");
  if (
    mode === "percent" &&
    (!Number.isFinite(packageSize) ||
      packageSize <= 0 ||
      packageSize > 10000 ||
      amount > 100)
  )
    throw Error("Enter the full package size and a percentage from 0 to 100.");
  const eaten = mode === "percent" ? (packageSize * amount) / 100 : amount;
  if (eaten > 10000)
    throw Error("Please enter a portion of 10,000 g/ml or less.");
  const values = { calories, protein, carbs, fat };
  if (
    Object.values(values).some(
      (v) => !Number.isFinite(v) || v < 0 || v > 100000,
    )
  )
    throw Error("Enter valid nutrition values from the label.");
  const nutrients = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      Math.round(((v * eaten) / labelAmount) * 100) / 100,
    ]),
  );
  if (Object.values(nutrients).some((v) => v > 100000))
    throw Error("That portion is too large.");
  return { eaten, ...nutrients };
}
