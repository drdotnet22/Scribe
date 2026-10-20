import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calc, display, isFormula } from "../src/shared/calc.ts";
import { dim, parseCutlist, personName } from "../src/shared/cutlist.ts";
import { cutlistVars, DEFAULT_HIDDEN_MATERIALS, materialsIn, orderGroups, plywoodGroups } from "../src/shared/outputs.ts";
import { blankInvoice, totals } from "../src/shared/invoice.ts";

const sample = readFileSync(new URL("./fixtures/sample-cutlist.txt", import.meta.url), "utf8");
const p = parseCutlist(sample);

test("formulas", () => {
  assert.equal(calc("=1169.59+52").v, 1221.59);
  assert.equal(calc("285.88").v, 285.88);
  assert.equal(calc("=100*5%").v, 5);
  assert.equal(calc("=2^3").v, 8);
  assert.equal(calc("").blank, true);
  assert.ok(calc("=alert(1)").err);
  assert.ok(calc("=1/0").err);
  assert.equal(calc("=doors_sqft*2", { doors_sqft: 10 }).v, 20);
  assert.equal(calc("=Doors_SqFt*2", { doors_sqft: 10 }).v, 20);
  assert.match(calc("=nope*2").err!, /Unknown name: nope/);
  assert.equal(display("=1378.2*1.15+14.7*7+10"), "1,697.83");
  assert.equal(isFormula("=5+5"), true);
  assert.equal(isFormula("12.50"), false);
});

test("dimensions", () => {
  assert.equal(dim("19 3/8").inches, 19.375);
  assert.equal(dim("3/4").inches, 0.75);
  assert.equal(dim("30").inches, 30);
  assert.equal(dim("16 27/32").inches, 16 + 27 / 32);
});

test("header, customer and ignored names", () => {
  assert.equal(p.customer, "Stotzfus, Virgil");
  assert.equal(personName(p.customer), "Virgil Stotzfus");
  assert.equal(p.date, "October 09, 2026");
  assert.deepEqual(p.room, { number: "1", name: "Kitchen" });
  assert.equal(p.cabinetCount, 19);
  assert.equal(JSON.stringify(p).includes("Stauffer"), false, "supplier name must not be kept");
  assert.deepEqual(p.warnings, []);
});

test("body parts", () => {
  assert.equal(p.bodyParts.length, 66);
  assert.equal(p.bodyParts.reduce((t, x) => t + x.qty, 0), 95);
  const birch = p.bodyParts.filter((x) => x.material === "3/4 Birch VC");
  assert.equal(birch.length, 50, "material heading repeated on page 4 is merged");
  assert.equal(birch.reduce((t, x) => t + x.qty, 0), 78);
  const shelf = p.bodyParts.find((x) => x.description === "ADJ.SHELVES")!;
  assert.equal(shelf.edge, "1L");
  const multi = p.bodyParts.find((x) => x.qty === 4 && x.description === "FINISHED END")!;
  assert.deepEqual(multi.refs.map((r) => `${r.cabinet}:${r.qty}`), ["1:2", "2:1", "7:1"]);
});

test("finished doors, drawer fronts and end panels", () => {
  const g = orderGroups(p);
  assert.deepEqual(g.map((x) => [x.heading, x.pieces]), [["Doors", 22], ["Drawer fronts", 13], ["End panels", 4]]);
  const doors = g[0];
  assert.equal(doors.style, "ECASE-SFP10");
  assert.equal(doors.frameMaterial, "3/4 Maple");
  assert.equal(doors.panelMaterial, "3/8 Maple");
  assert.ok(Math.abs(doors.sqft - 77.8) < 0.1);
  assert.deepEqual(doors.rows[0], { qty: 2, w: "19 3/8", h: "37 3/4", hinge: "Pair", refs: "#12" });
  assert.equal(doors.rows[3].refs, "#13 ×2, #14");
  assert.equal(g[1].rows[0].refs, "#4");
  assert.equal(g[1].showHinge, false);
});

test("plywood cutlist groups by material and drops hidden materials", () => {
  assert.deepEqual(materialsIn(p), ["Undefined Material", "1/4 Alma Ply", "3/8 Lauan Ply", "3/4 Birch VC", "9/16 Poplar", "3/8 Cherry"]);
  const groups = plywoodGroups(p, DEFAULT_HIDDEN_MATERIALS);
  assert.ok(!groups.some((x) => x.material === "Undefined Material"));
  assert.deepEqual(groups.map((x) => x.material), ["3/4 Birch VC", "9/16 Poplar", "3/8 Cherry", "3/8 Lauan Ply", "1/4 Alma Ply"]);
  const alma = groups.find((x) => x.material === "1/4 Alma Ply")!;
  assert.equal(alma.pieces, 6 + 13 + 2, "back panels + drawer bottoms + pull-out bottoms");
  const birch = groups.find((x) => x.material === "3/4 Birch VC")!;
  assert.equal(birch.pieces, 78);
  const widths = birch.rows.map((r) => dim(r.w).inches);
  assert.deepEqual(widths, [...widths].sort((a, b) => b - a), "widest first");
  assert.ok(birch.rows.every((r) => !("edge" in r)), "edge banding codes are never listed");
  const onlyBirch = plywoodGroups(p, materialsIn(p).filter((m) => m !== "3/4 Birch VC"));
  assert.equal(onlyBirch.length, 1);
});

test("numbers for invoice formulas", () => {
  const v = cutlistVars(p);
  assert.equal(v.doors_count, 22);
  assert.equal(v.drawerfronts_count, 13);
  assert.equal(v.endpanels_count, 4);
  assert.ok(Math.abs(v.doors_sqft - 77.8) < 0.1);
  assert.equal(calc("=doors_sqft*27.5", v).v, v.doors_sqft * 27.5);
});

test("invoice totals match the original spreadsheet", () => {
  const inv = blankInvoice();
  inv.cabinets[0] = { d: '44" floating vanity cabinet', a: "=1169.59+52" };
  inv.cabinets[1] = { d: "18x24x106 Linen tower", a: "=1378.2*1.15+14.7*7+10" };
  inv.accessories = [
    { d: "", a: "285.88" }, { d: "", a: "=84*1.35" }, { d: "", a: "151.25" },
    { d: "", a: "485.83" }, { d: "", a: "=14.72*18+364.38" },
  ];
  inv.recap = [{ label: "Door style", a: "=24.68*3+24.68*6*0.75" }];
  const t = totals(inv);
  assert.equal(t.cab.toFixed(2), "2919.42");
  assert.equal(t.acc.toFixed(2), "1665.70");
  assert.equal(t.grand.toFixed(2), "4770.22");
  inv.paid = "500";
  assert.equal(totals(inv).bal.toFixed(2), "4270.22");
});


test("revised cutlist is compared by pieces and needs no cabinet numbers", async () => {
  const { compareCutlists } = await import("../src/shared/diff.ts");
  const text = readFileSync(new URL("./fixtures/sample-cutlist.txt", import.meta.url), "utf8");
  const a = parseCutlist(text);
  assert.ok(compareCutlists(a, ["Undefined Material"], parseCutlist(text), 1).identical);
  const b = parseCutlist(text);
  const doors = b.sections.find((s) => s.heading === "FRAME AND PANEL DOORS")!;
  const cell = doors.rows[0].columns["Finished Size"][0];
  cell.qty += 2;
  const c = compareCutlists(a, ["Undefined Material"], b, 1);
  assert.ok(!c.identical);
  assert.ok(c.changes.some((x) => x.area === "Doors" && x.to - x.from === 2));
  assert.ok(c.vars.some((v) => v.name === "doors_sqft" && v.to > v.from));
});

test("drawer order rows come from the drawer boxes and match their fronts", async () => {
  const { drawerRows, drawerSpecies } = await import("../src/shared/outputs.ts");
  const p = parseCutlist(readFileSync(new URL("./fixtures/sample-cutlist.txt", import.meta.url), "utf8"));
  const rows = drawerRows(p);
  assert.equal(rows.length, 14);
  assert.equal(rows.reduce((t, r) => t + r.qty, 0), 15);          // 13 boxes + 2 pull-outs
  assert.deepEqual(rows[0], { qty: 1, height: "11 5/8", width: "35 7/8", depth: "20 1/2", front: "13 9/16 x 37 3/4", note: "" });
  assert.equal(rows.at(-1)!.note, "Pull-out");
  assert.equal(drawerRows(p, false).length, 13);
  assert.equal(drawerSpecies(p), "Poplar");
});
