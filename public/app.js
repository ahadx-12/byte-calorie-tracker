import {
  KEY,
  MEALS,
  uid,
  localDate,
  shiftDate,
  newProfile,
  initialState,
  totals,
  portion,
  validateState,
} from "./core.js";
import { FOODS } from "./foods.js";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (n) => Math.round(n).toLocaleString();
let state,
  storageError = "",
  corrupt = false;
try {
  const raw = localStorage.getItem(KEY);
  state = raw ? validateState(JSON.parse(raw)) : initialState();
} catch {
  state = initialState();
  storageError =
    "Your saved diary could not be opened. Existing data has not been overwritten. Export the stored data in Settings before restoring a backup.";
  corrupt = true;
}
let date = localDate(),
  tab = "today",
  weekEnd = localDate(),
  toastTimer,
  modalMeal = "Breakfast",
  foodMode = "search";
const profile = () => state.profiles.find((p) => p.id === state.active);
const entries = () => profile().entries.filter((e) => e.date === date);
const day = () => profile().days[date] || { water: 0, weight: null };
function save() {
  if (corrupt) {
    toast("Restore a valid backup before making changes.");
    return false;
  }
  try {
    validateState(state);
    localStorage.setItem(KEY, JSON.stringify(state));
    storageError = "";
    return true;
  } catch {
    storageError =
      "Changes could not be saved on this device. Export a backup now to keep this session’s changes.";
    return false;
  }
}
function changed(message = "Saved on this device") {
  const ok = save();
  render();
  if (message) toast(ok ? message : storageError);
}
function toast(message, undo) {
  clearTimeout(toastTimer);
  $("#toast").innerHTML =
    `<span>${esc(message)}</span>${undo ? '<button id="undo">Undo</button>' : ""}`;
  $("#toast").classList.add("show");
  if (undo)
    $("#undo").onclick = () => {
      undo();
      $("#toast").classList.remove("show");
    };
  toastTimer = setTimeout(
    () => $("#toast").classList.remove("show"),
    undo ? 12000 : 5000,
  );
}
function openModal(title, html) {
  $("#dialog-title").textContent = title;
  $("#dialog-content").innerHTML = html;
  if (!$("#dialog").open) $("#dialog").showModal();
}
function closeModal() {
  $("#dialog").close();
}
$("#close-dialog").onclick = closeModal;
$("#dialog").addEventListener("click", (e) => {
  if (e.target === $("#dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function dateControls() {
  return `<div class="date-nav"><button id="prev-date" aria-label="Previous day">‹</button><label class="sr-only" for="diary-date">Diary date</label><input id="diary-date" type="date" value="${date}" max="${localDate()}" min="2000-01-01"><button id="next-date" aria-label="Next day" ${date >= localDate() ? "disabled" : ""}>›</button><button id="go-today" class="small">Today</button></div>`;
}
function render() {
  $("#profile").innerHTML = state.profiles
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === state.active ? "selected" : ""}>${esc(p.name)}</option>`,
    )
    .join("");
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#main").innerHTML =
    (storageError
      ? `<div id="storage-warning" role="alert">${esc(storageError)}</div>`
      : "") +
    (tab === "today"
      ? todayView()
      : tab === "history"
        ? historyView()
        : settingsView());
  $("#save-status").textContent = storageError
    ? "Storage needs attention"
    : navigator.onLine
      ? "Saved on this device"
      : "Offline · saved on this device";
  if (tab === "today") bindToday();
  else if (tab === "history") bindHistory();
  else bindSettings();
}
$("#profile").onchange = (e) => {
  state.active = e.target.value;
  changed("Profile switched");
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      render();
    }),
);
function todayView() {
  const p = profile(),
    t = totals(entries()),
    left = p.goals.calories - t.calories,
    water = day().water;
  return `
 <div class="page-heading"><div><div class="eyebrow">YOUR DAILY CHECK-IN</div><h1>${date === localDate() ? "Make today count." : new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}</h1></div>${dateControls()}</div><button id="mobile-log" class="primary mobile-log">+ Log food</button>
 <div class="dashboard"><section><div class="summary"><div class="summary-top"><div class="calories"><div class="eyebrow">CALORIES SO FAR</div><div class="big-number">${fmt(t.calories)}<small>kcal</small></div><div class="summary-label">of your ${fmt(p.goals.calories)} kcal daily goal</div></div><div class="remaining"><strong>${fmt(Math.abs(left))}</strong><span>${left >= 0 ? "remaining" : "above goal"}</span></div></div><div class="meter" role="progressbar" aria-label="Daily calories" aria-valuenow="${Math.round(t.calories)}" aria-valuemin="0" aria-valuemax="${Math.max(p.goals.calories, Math.round(t.calories))}"><span style="width:${Math.min(100, (t.calories / p.goals.calories) * 100)}%;${left < 0 ? "background:var(--red)" : ""}"></span></div><div class="macro-row"><div><small>Protein</small><strong>${fmt(t.protein)}g</strong> <small>/ ${p.goals.protein}g goal</small></div><div><small>Carbs</small><strong>${fmt(t.carbs)}g</strong><small>logged today</small></div><div><small>Fat</small><strong>${fmt(t.fat)}g</strong><small>logged today</small></div></div></div>
 <div class="section-title"><h2>The food diary</h2><button id="copy-yesterday" class="text-button">Copy previous day</button></div>
 ${MEALS.map((meal, i) => {
   const list = entries().filter((e) => e.meal === meal);
   return `<section class="meal" aria-label="${meal}"><div class="meal-head"><div class="meal-title"><span class="meal-index">0${i + 1}</span><h3>${meal}</h3></div><div class="meal-tools"><span>${fmt(totals(list).calories)} kcal</span><button class="add-small" data-add="${meal}" aria-label="Add to ${meal}">+</button></div></div>${list.length ? list.map((e) => `<div class="entry"><div class="entry-info"><div class="entry-name">${esc(e.name)}</div><div class="entry-detail">${esc(e.amount)} · ${e.estimated ? "estimate" : "label / custom"}</div></div><div class="entry-actions"><strong>${fmt(e.calories)}</strong><button class="ghost" data-edit="${esc(e.id)}" aria-label="Edit ${esc(e.name)}">Edit</button></div></div>`).join("") : `<div class="empty-meal">Nothing logged yet. Add something when you’re ready.</div>`}</section>`;
 }).join("")}
 </section><aside class="side-column"><section class="side-card quick-card"><h2>Ate something?</h2><p>A few taps, and it’s in the diary.</p><button id="add-food">+ Add food</button></section><section class="side-card"><div class="eyebrow">LITTLE HABITS</div><h2>Water break</h2><div class="water-total">${(water / 1000).toFixed(2).replace(/0$/, "")} <small>/ ${(p.goals.water / 1000).toFixed(1)} L</small></div><div class="meter" role="progressbar" aria-label="Water goal" aria-valuenow="${water}" aria-valuemin="0" aria-valuemax="${Math.max(p.goals.water, water, 1)}"><span style="width:${p.goals.water ? Math.min(100, (water / p.goals.water) * 100) : 0}%"></span></div><div class="water-buttons"><button class="small" data-water="250">+ 250 ml</button><button class="small" data-water="-250" ${water === 0 ? "disabled" : ""} aria-label="Remove 250 ml of water">−</button></div></section><section class="side-card"><div class="eyebrow">ON REPEAT</div><h2>Your favorites</h2><p>Star a food to keep it close.</p><div class="starters">${
   [...FOODS, ...p.foods]
     .filter((f) => p.favorites.includes(f.id))
     .slice(0, 6)
     .map(
       (f) =>
         `<button class="starter" data-fav-add="${esc(f.id)}">+ ${esc(f.name)}</button>`,
     )
     .join("") || '<span class="help">Your shortcuts will appear here.</span>'
 }</div></section><section class="side-card note-card"><div class="eyebrow">A NOTE FROM BYTE</div><p>Close counts. A useful estimate is better than an empty diary. Use grams or a package label when you can.</p></section></aside></div>`;
}
function bindToday() {
  $("#prev-date").onclick = () => {
    date = shiftDate(date, -1);
    render();
  };
  $("#next-date").onclick = () => {
    date = shiftDate(date, 1);
    render();
  };
  $("#go-today").onclick = () => {
    date = localDate();
    render();
  };
  $("#diary-date").onchange = (e) => {
    if (e.target.validity.valid && e.target.value) {
      date = e.target.value;
      render();
    }
  };
  $("#mobile-log").onclick = () => foodPicker();
  $("#add-food").onclick = () => foodPicker();
  document
    .querySelectorAll("[data-add]")
    .forEach((b) => (b.onclick = () => foodPicker(b.dataset.add)));
  document
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => editEntry(b.dataset.edit)));
  document.querySelectorAll("[data-water]").forEach(
    (b) =>
      (b.onclick = () => {
        profile().days[date] = {
          ...day(),
          water: Math.min(
            20000,
            Math.max(0, day().water + Number(b.dataset.water)),
          ),
        };
        changed("Water updated");
      }),
  );
  document.querySelectorAll("[data-fav-add]").forEach(
    (b) =>
      (b.onclick = () => {
        modalMeal = "Snacks";
        portionForm(
          [...FOODS, ...profile().foods].find((f) => f.id === b.dataset.favAdd),
        );
      }),
  );
  $("#copy-yesterday").onclick = () => {
    const prev = profile().entries.filter(
      (e) => e.date === shiftDate(date, -1),
    );
    if (!prev.length) {
      toast("No food logged on the previous day.");
      return;
    }
    openModal(
      "Copy the previous day?",
      `<p>Add ${prev.length} food entries (${fmt(totals(prev).calories)} kcal) to this day? Existing entries will stay.</p><div class="button-row"><button id="confirm-copy" class="primary">Copy ${prev.length} entries</button><button id="cancel-copy">Cancel</button></div>`,
    );
    $("#cancel-copy").onclick = closeModal;
    $("#confirm-copy").onclick = () => {
      const copied = prev.map((e) => ({ ...e, id: uid(), date }));
      const target = profile();
      target.entries.push(...copied);
      closeModal();
      changed("Previous day copied");
      toast("Previous day copied", () => {
        target.entries = target.entries.filter(
          (e) => !copied.some((c) => c.id === e.id),
        );
        changed("Copy undone");
      });
    };
  };
}
function mealSelect(selected = modalMeal) {
  return `<label class="field">Meal<select name="meal">${MEALS.map((m) => `<option ${m === selected ? "selected" : ""}>${m}</option>`).join("")}</select></label>`;
}
function foodPicker(meal = "Snacks", mode = "search") {
  modalMeal = meal;
  foodMode = mode;
  openModal(
    "Add food",
    `<div class="modal-tabs"><button id="mode-search" class="${mode === "search" ? "active" : ""}">Find a food</button><button id="mode-quick" class="${mode === "quick" ? "active" : ""}">Quick entry</button></div><div id="food-body"></div>`,
  );
  $("#mode-search").onclick = () => foodPicker(modalMeal, "search");
  $("#mode-quick").onclick = () => foodPicker(modalMeal, "quick");
  if (mode === "quick") {
    quickForm();
    return;
  }
  $("#food-body").innerHTML =
    `<label class="field search-wrap">Search the food shelf<input id="food-search" type="search" placeholder="Try eggs, rice, banana…" autocomplete="off"></label><p class="help">${FOODS.length} common foods + your saved foods. Generic portions are estimates.</p><div id="food-results" class="food-list"></div><p class="help" style="margin-top:12px">Can’t find it? Use Quick entry with the calories from its label.</p>`;
  const show = () => {
    const q = $("#food-search").value.toLowerCase().trim();
    const foods = [...profile().foods, ...FOODS]
      .filter((f) => f.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(profile().favorites.includes(b.id)) -
          Number(profile().favorites.includes(a.id)),
      );
    $("#food-results").innerHTML = foods.length
      ? foods
          .map(
            (f) =>
              `<div class="food-row"><button class="food-pick" data-food="${esc(f.id)}">${esc(f.name)}<small>${fmt((f.calories * f.serving) / 100)} kcal / ${esc(f.unit)}${f.id.startsWith("base-") ? ` · ${f.serving} g` : ""}</small></button><button class="favorite" data-star="${esc(f.id)}" aria-label="${profile().favorites.includes(f.id) ? "Unstar" : "Star"} ${esc(f.name)}" aria-pressed="${profile().favorites.includes(f.id)}">${profile().favorites.includes(f.id) ? "★" : "☆"}</button></div>`,
          )
          .join("")
      : '<div class="empty-state">No matches. Quick entry works for any food.</div>';
    document
      .querySelectorAll("[data-food]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            portionForm(foods.find((f) => f.id === b.dataset.food))),
      );
    document.querySelectorAll("[data-star]").forEach(
      (b) =>
        (b.onclick = () => {
          const f = profile().favorites,
            i = f.indexOf(b.dataset.star);
          if (i < 0) f.push(b.dataset.star);
          else f.splice(i, 1);
          save();
          show();
          render();
        }),
    );
  };
  $("#food-search").oninput = show;
  show();
}
function portionForm(food) {
  const custom = !food.id.startsWith("base-");
  openModal(
    food.name,
    `<button id="back-food" class="text-button">‹ Back to foods</button><form id="portion-form">${mealSelect()}<div class="form-grid"><label class="field">Amount<input name="quantity" type="number" value="1" min="0.01" max="10000" step="0.01" required inputmode="decimal"></label><label class="field">Measure<select name="measure" aria-label="Measure"><option value="serving">${esc(food.unit)}${custom ? "" : ` (${food.serving} g)`}</option>${custom ? "" : '<option value="grams">grams</option>'}</select></label></div><div id="portion-result" class="portion-preview"></div><p class="help">${food.estimated === false ? "Calculated from your saved label values." : "Generic food estimate. Brand, recipe and cooking method can change the numbers. Household portions are approximate."}</p><div class="button-row"><button class="primary" type="submit">Add to diary</button></div></form>`,
  );
  $("#back-food").onclick = () => foodPicker(modalMeal);
  const f = $("#portion-form");
  const update = () => {
    const grams =
      Number(f.elements.quantity.value) *
      (f.elements.measure.value === "grams" ? 1 : food.serving);
    const t = portion(food, grams);
    $("#portion-result").innerHTML =
      `<div><strong>${fmt(t.calories)}</strong> kcal<small class="help" style="display:block">${custom ? `${f.elements.quantity.value} serving(s)` : `${fmt(grams)} g total`}</small></div><span>P ${fmt(t.protein)}g<br>C ${fmt(t.carbs)}g · F ${fmt(t.fat)}g</span>`;
  };
  f.oninput = update;
  update();
  f.onsubmit = (e) => {
    e.preventDefault();
    const q = Number(f.elements.quantity.value),
      grams = q * (f.elements.measure.value === "grams" ? 1 : food.serving);
    if (grams > 10000) {
      toast("Please use a portion of 10,000 g or less.");
      return;
    }
    const t = portion(food, grams);
    if (Object.values(t).some((v) => v > 100000)) {
      toast("That portion is too large.");
      return;
    }
    profile().entries.push({
      id: uid(),
      name: food.name,
      date,
      meal: f.elements.meal.value,
      amount:
        f.elements.measure.value === "grams"
          ? `${q} g`
          : `${q} × ${food.unit}${custom ? "" : ` (${Math.round(grams * 10) / 10} g)`}`,
      estimated: food.estimated !== false,
      ...t,
    });
    closeModal();
    changed(`${food.name} added`);
  };
}
function quickForm(entry) {
  const editing = !!entry;
  const html = `<form id="quick-form"><label class="field">Food or meal name<input name="name" maxlength="100" value="${esc(entry?.name || "")}" placeholder="e.g. Homemade sandwich" required></label>${mealSelect(entry?.meal)}<div class="form-grid"><label class="field">Calories (kcal)<input name="calories" type="number" min="0" max="100000" step="0.01" value="${entry?.calories ?? ""}" required inputmode="decimal"></label><label class="field">Portion description<input name="amount" maxlength="100" value="${esc(entry?.amount || "1 serving")}" required></label><label class="field">Protein (g)<input name="protein" type="number" min="0" max="100000" step="0.01" value="${entry?.protein ?? 0}" inputmode="decimal" required></label><label class="field">Carbs (g)<input name="carbs" type="number" min="0" max="100000" step="0.01" value="${entry?.carbs ?? 0}" inputmode="decimal" required></label><label class="field">Fat (g)<input name="fat" type="number" min="0" max="100000" step="0.01" value="${entry?.fat ?? 0}" inputmode="decimal" required></label></div><p class="help">Enter totals for the whole portion. Unknown macros can stay at zero; calorie totals use the value you enter.</p><label class="check"><input type="checkbox" name="estimated" ${entry?.estimated === false ? "" : "checked"}>This is an estimate</label>${!editing ? '<label class="check"><input name="remember" type="checkbox">Save this meal for next time</label>' : ""}<div class="button-row"><button class="primary" type="submit">${editing ? "Save changes" : "Add to diary"}</button>${editing ? '<button type="button" class="ghost" id="delete-entry">Delete entry</button>' : ""}</div></form>`;
  if (editing) openModal("Edit entry", html);
  else $("#food-body").innerHTML = html;
  const f = $("#quick-form");
  f.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(f);
    if (!data.get("name").trim() || !data.get("amount").trim()) {
      toast("Enter a food name and portion.");
      return;
    }
    const record = {
      id: entry?.id || uid(),
      date: entry?.date || date,
      name: data.get("name").trim(),
      amount: data.get("amount").trim(),
      meal: data.get("meal"),
      estimated: data.has("estimated"),
      ...Object.fromEntries(
        ["calories", "protein", "carbs", "fat"].map((k) => [
          k,
          Number(data.get(k)),
        ]),
      ),
    };
    if (editing)
      profile().entries = profile().entries.map((e) =>
        e.id === entry.id ? record : e,
      );
    else profile().entries.push(record);
    if (data.has("remember")) {
      profile().foods.push({
        id: uid(),
        name: record.name,
        calories: record.calories,
        protein: record.protein,
        carbs: record.carbs,
        fat: record.fat,
        serving: 100,
        unit: record.amount,
        estimated: record.estimated,
      });
    }
    closeModal();
    changed(editing ? "Entry updated" : "Food added");
  };
  if (editing)
    $("#delete-entry").onclick = () => {
      const p = profile(),
        index = p.entries.findIndex((e) => e.id === entry.id);
      p.entries.splice(index, 1);
      closeModal();
      changed("Entry deleted");
      toast("Entry deleted", () => {
        p.entries.splice(index, 0, entry);
        changed("Entry restored");
      });
    };
}
function editEntry(id) {
  quickForm(profile().entries.find((e) => e.id === id));
}
function historyView() {
  const p = profile(),
    days = Array.from({ length: 7 }, (_, i) => shiftDate(weekEnd, i - 6));
  const values = days.map((d) => totals(p.entries.filter((e) => e.date === d)));
  const logged = days.filter((d) => p.entries.some((e) => e.date === d));
  const avg = logged.length
    ? values.reduce((a, t) => a + t.calories, 0) / logged.length
    : 0;
  const max = Math.max(p.goals.calories, ...values.map((t) => t.calories), 1);
  const weights = Object.entries(p.days)
    .filter(([, d]) => d.weight)
    .sort(([a], [b]) => a.localeCompare(b));
  return `<div class="page-heading"><div><div class="eyebrow">THE BIGGER PICTURE</div><h1>A week at a glance.</h1></div><div class="date-nav"><button id="prev-week" aria-label="Previous week">‹</button><span style="font-size:13px">${days[0].slice(5)} — ${weekEnd.slice(5)}</span><button id="next-week" aria-label="Next week" ${weekEnd >= localDate() ? "disabled" : ""}>›</button></div></div><div class="week-summary"><div class="stat"><strong>${fmt(avg)}</strong><small>kcal / logged day</small></div><div class="stat"><strong>${logged.length} / 7</strong><small>days with food logs</small></div><div class="stat"><strong>${weights.length ? weights.at(-1)[1].weight + " kg" : "—"}</strong><small>latest weight${weights.length ? " · " + weights.at(-1)[0].slice(5) : ""}</small></div></div><section class="panel"><div class="section-title"><h2>Daily calories</h2><span class="help">Current goal: ${fmt(p.goals.calories)} kcal</span></div><div class="chart">${days.map((d, i) => `<div class="chart-col"><span class="chart-value">${fmt(values[i].calories)}</span><button class="chart-bar ${d === localDate() ? "current" : ""}" style="height:${Math.max(2, (values[i].calories / max) * 155)}px" data-history-date="${d}" aria-label="Open ${d}: ${fmt(values[i].calories)} calories"></button><span>${new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}</span></div>`).join("")}</div><p class="help" style="margin-top:16px">Tap a bar to open that day. Empty days are excluded from the average; partially logged days are included.</p></section><div class="settings-grid"><section class="panel"><h2>Weight check-in</h2><p>Optional. Keep a simple record over time.</p><form id="weight-form"><label class="field">Date<input name="date" type="date" max="${localDate()}" min="2000-01-01" value="${date}" required></label><div class="weight-row"><label class="field">Weight (kg)<input name="weight" type="number" min="1" max="1000" step="0.1" placeholder="e.g. 75.5" inputmode="decimal" required></label><button class="primary">Save weight</button></div></form></section><section class="panel"><h2>Recent weigh-ins</h2>${
    weights.length
      ? `<table class="history-table"><thead><tr><th>Date</th><th>Weight</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${weights
          .slice(-7)
          .reverse()
          .map(
            ([d, v]) =>
              `<tr><td>${d}</td><td>${v.weight} kg</td><td><button class="text-button" data-delete-weight="${d}" aria-label="Delete weight for ${d}">Remove</button></td></tr>`,
          )
          .join("")}</tbody></table>`
      : "<p>No weigh-ins yet. Add one whenever it’s useful.</p>"
  }</section></div>`;
}
function bindHistory() {
  $("#prev-week").onclick = () => {
    weekEnd = shiftDate(weekEnd, -7);
    render();
  };
  $("#next-week").onclick = () => {
    weekEnd =
      shiftDate(weekEnd, 7) > localDate() ? localDate() : shiftDate(weekEnd, 7);
    render();
  };
  document.querySelectorAll("[data-history-date]").forEach(
    (b) =>
      (b.onclick = () => {
        date = b.dataset.historyDate;
        tab = "today";
        render();
      }),
  );
  $("#weight-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      d = f.get("date");
    profile().days[d] = {
      water: 0,
      ...profile().days[d],
      weight: Number(f.get("weight")),
    };
    changed("Weight saved");
  };
  document.querySelectorAll("[data-delete-weight]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = profile(),
          d = b.dataset.deleteWeight,
          w = p.days[d].weight;
        p.days[d].weight = null;
        changed("Weight removed");
        toast("Weight removed", () => {
          p.days[d].weight = w;
          changed("Weight restored");
        });
      }),
  );
}
function settingsView() {
  const p = profile();
  return `<div class="page-heading"><div><div class="eyebrow">MAKE IT YOURS</div><h1>Your diary, your way.</h1></div></div><div class="settings-grid"><div><section class="panel"><h2>Daily goals</h2><p>Choose targets that work for you. These are tracking preferences, not personalized recommendations.</p><form id="goals-form"><label class="field">Daily calories (kcal)<input name="calories" type="number" min="1" max="10000" step="1" value="${p.goals.calories}" required></label><div class="form-grid"><label class="field">Protein (g)<input name="protein" type="number" min="0" max="1000" step="1" value="${p.goals.protein}" required></label><label class="field">Water (ml)<input name="water" type="number" min="0" max="10000" step="1" value="${p.goals.water}" required></label></div><button class="primary">Save goals</button></form></section><section class="panel"><h2>Profiles</h2><p>Up to five diaries on this device. Each has its own food logs and goals.</p><form id="rename-form"><label class="field">Current profile name<input name="name" maxlength="40" value="${esc(p.name)}" required></label><button>Rename profile</button></form><div class="button-row"><button id="new-profile" ${state.profiles.length >= 5 ? "disabled" : ""}>+ New profile</button></div></section></div><div><section class="panel"><h2>Keep a copy</h2><p>Your diary lives in this browser. Export a backup before clearing browser data, changing devices, or moving to a different website address.</p><div class="button-row"><button id="export" class="primary">Export backup</button><button id="import">Restore backup</button></div><input id="import-file" class="sr-only" type="file" accept=".json,application/json"><p class="help" style="margin-top:14px">Includes all profiles, goals, saved foods and history. Restore replaces this device’s diary.</p>${corrupt ? '<button id="export-raw">Export unreadable stored data</button>' : ""}<div class="install-tip"><h3>Keep BYTE on your iPhone</h3><p>In Safari, tap Share → Add to Home Screen. Open it once online; it will then work offline. Export a backup from this browser before switching to the Home Screen app.</p></div></section><section class="panel"><h2>Your food shelf</h2><p>${FOODS.length} built-in foods · ${p.foods.length} saved meals</p>${p.foods.length ? p.foods.map((f) => `<div class="entry"><div class="entry-info"><div class="entry-name">${esc(f.name)}</div><div class="entry-detail">${fmt(f.calories)} kcal / ${esc(f.unit)}</div></div><button class="text-button" data-remove-food="${esc(f.id)}" aria-label="Remove saved food ${esc(f.name)}">Remove</button></div>`).join("") : '<p class="help">Use “Save this meal for next time” in Quick entry.</p>'}</section><section class="panel"><h2>Small by design.</h2><p>No account, ads, trackers, paid APIs, or cloud storage. Nothing you log is sent to a server. Profiles are convenient separation, not password protection.</p><p class="help">Built-in foods use rounded generic estimates. Use your package label for branded foods, weigh portions when practical, and log oils and sauces separately. Saved meals use one reusable portion; they do not have a known gram weight.</p><a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener noreferrer" class="help">Look up more detailed nutrition at USDA FoodData Central ↗</a></section></div></div>`;
}
function download(content, name) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function bindSettings() {
  $("#goals-form").onsubmit = (e) => {
    e.preventDefault();
    profile().goals = Object.fromEntries(
      Array.from(new FormData(e.target), ([k, v]) => [k, Number(v)]),
    );
    changed("Goals saved");
  };
  $("#rename-form").onsubmit = (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get("name").trim();
    if (!name) {
      toast("Enter a profile name.");
      return;
    }
    profile().name = name;
    changed("Profile renamed");
  };
  $("#new-profile").onclick = () => {
    openModal(
      "New profile",
      '<form id="profile-form"><label class="field">Name<input name="name" maxlength="40" placeholder="e.g. Alex" required></label><button class="primary">Create profile</button></form>',
    );
    $("#profile-form").onsubmit = (e) => {
      e.preventDefault();
      if (state.profiles.length >= 5) return;
      const name = new FormData(e.target).get("name").trim();
      if (!name) {
        toast("Enter a profile name.");
        return;
      }
      const p = newProfile(name);
      state.profiles.push(p);
      state.active = p.id;
      closeModal();
      changed("Profile created");
    };
  };
  $("#export").onclick = () => {
    download(JSON.stringify(state, null, 2), `byte-backup-${localDate()}.json`);
    toast("Backup exported");
  };
  if ($("#export-raw"))
    $("#export-raw").onclick = () => {
      try {
        download(
          localStorage.getItem(KEY) || "",
          `byte-recovery-${localDate()}.json`,
        );
      } catch {
        toast("Browser storage cannot be read.");
      }
    };
  $("#import").onclick = () => $("#import-file").click();
  $("#import-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw Error("Backup is too large (maximum 10 MB).");
      const incoming = validateState(JSON.parse(await file.text()));
      openModal(
        "Restore this backup?",
        `<p>Replace all current diaries with <strong>${incoming.profiles.length} profile(s)</strong> and <strong>${incoming.profiles.reduce((n, p) => n + p.entries.length, 0)} food entries</strong> from this backup?</p><p class="help" style="margin-top:12px">Export the current diary first if you want to keep it.</p><div class="button-row"><button class="primary" id="confirm-restore">Replace and restore</button><button id="cancel-restore">Cancel</button></div>`,
      );
      $("#cancel-restore").onclick = closeModal;
      $("#confirm-restore").onclick = () => {
        try {
          localStorage.setItem(KEY, JSON.stringify(incoming));
          state = incoming;
          corrupt = false;
          storageError = "";
          closeModal();
          render();
          toast("Backup restored");
        } catch {
          toast("Cannot restore: browser storage is unavailable or full.");
        }
      };
    } catch (err) {
      toast(`Could not restore. ${err.message}`);
    } finally {
      e.target.value = "";
    }
  };
  document.querySelectorAll("[data-remove-food]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = profile(),
          f = p.foods.find((f) => f.id === b.dataset.removeFood),
          wasFavorite = p.favorites.includes(f.id);
        p.foods = p.foods.filter((x) => x.id !== f.id);
        p.favorites = p.favorites.filter((id) => id !== f.id);
        changed("Saved food removed");
        toast("Saved food removed", () => {
          p.foods.push(f);
          if (wasFavorite) p.favorites.push(f.id);
          changed("Saved food restored");
        });
      }),
  );
}
window.addEventListener("online", render);
window.addEventListener("offline", render);
window.addEventListener("storage", (e) => {
  if (e.key === KEY && e.newValue) {
    try {
      state = validateState(JSON.parse(e.newValue));
      storageError = "";
      corrupt = false;
      closeModal();
      render();
      toast("Diary updated from another tab");
    } catch {
      toast("Another tab wrote unreadable data. Export a backup.");
    }
  }
});
render();
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() =>
      toast("Offline setup unavailable. The diary still works online."),
    );
