import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import app from "../app.js";

test("1. Local date helpers avoid UTC evening day-shift bug", () => {
  // Simulate 11:30 PM local time on Nov 7, 2026
  const lateEvening = new Date(2026, 10, 7, 23, 30, 0);
  const todayStr = app.daysFromNow(0, lateEvening);
  assert.equal(todayStr, "2026-11-07", "daysFromNow(0) at 11:30 PM local time must still be today");

  const inThreeDays = app.daysFromNow(3, lateEvening);
  assert.equal(inThreeDays, "2026-11-10");
  assert.equal(app.daysUntil(inThreeDays, lateEvening), 3);
  assert.equal(app.daysUntil(todayStr, lateEvening), 0);
  assert.equal(app.daysUntil("invalid-date", lateEvening), 0, "Malformed date should not throw or return NaN");
});

test("2. loadSubscriptions respects empty array [] when user clears all sample data", () => {
  const mockEmptyStorage = {
    getItem: () => "[]"
  };
  const loaded = app.loadSubscriptions(mockEmptyStorage);
  assert.equal(loaded.length, 0, "Cleared subscriptions [] should stay empty on reload");

  const mockFreshStorage = {
    getItem: () => null
  };
  const fresh = app.loadSubscriptions(mockFreshStorage);
  assert.equal(fresh.length, 8, "Fresh install should load 8 starter subscriptions");

  const mockCorruptStorage = {
    getItem: () => "{broken-json"
  };
  const fallback = app.loadSubscriptions(mockCorruptStorage);
  assert.equal(fallback.length, 8, "Corrupt storage should safely fall back without throwing");
});

test("3. Burn calculations handle monthly, yearly, weekly, and empty lists without NaN", () => {
  const emptyTotals = app.calculateTotals([]);
  assert.equal(emptyTotals.totalMonthly, 0);
  assert.equal(emptyTotals.daily, 0);

  const items = [
    { price: 10, cycle: "monthly", source: "apple" },
    { price: 120, cycle: "yearly", source: "google" }, // $10/mo
    { price: 12, cycle: "weekly", source: "capone" }   // $52/mo
  ];
  const totals = app.calculateTotals(items);
  assert.equal(totals.appleMonthly, 10);
  assert.equal(totals.googleMonthly, 10);
  assert.equal(totals.caponeMonthly, 52);
  assert.equal(totals.totalMonthly, 72);
  assert.equal(totals.totalYearly, 864);
});

test("4. Screenshot OCR parser handles multi-line iOS Settings layout & Free Trials", () => {
  const iosScreenshotText = `
    Subscriptions
    Active
    Apple TV+
    Individual Plan
    $9.99/month Free Trial
    Renews Nov 14
    iCloud+
    $2.99/month
    Strava
    Annual Plan $79.99/year
  `;

  const parsed = app.parseSubscriptionText(iosScreenshotText, "apple", new Date(2026, 10, 7));
  assert.equal(parsed.length, 3);

  // Should skip "Individual Plan" and grab "Apple TV+" from 2 lines above!
  assert.equal(parsed[0].name, "Apple TV+");
  assert.equal(parsed[0].price, 9.99);
  assert.equal(parsed[0].isTrial, true);

  assert.equal(parsed[1].name, "iCloud+");
  assert.equal(parsed[1].price, 2.99);
  assert.equal(parsed[1].isTrial, false);

  assert.equal(parsed[2].cycle, "yearly");
  assert.equal(parsed[2].price, 79.99);

  // Also test real iOS OCR artifacts from left-aligned app icons & One logo
  const realIosOcr = `
    0 AppleCare One
    $25.98/month
    one Premier
    $39.95/month
    ChatGPT
    ®) Pro Monthly
    $14.99/month
  `;
  const realParsed = app.parseSubscriptionText(realIosOcr, "apple", new Date(2026, 10, 7));
  assert.equal(realParsed[0].name, "AppleCare One");
  assert.equal(realParsed[1].name, "Apple One Premier");
  assert.equal(realParsed[2].name, "ChatGPT");

  // And test auto-sanitizing already-saved localStorage items
  const repaired = app.sanitizeSubscriptionList([
    { name: "0 AppleCare One", price: 25.98 },
    { name: "one Premier", price: 39.95 },
    { name: "®) Pro Monthly", price: 14.99 }
  ]);
  assert.equal(repaired[0].name, "AppleCare One");
  assert.equal(repaired[1].name, "Apple One Premier");
  assert.equal(repaired[2].name, "Pro Monthly");
});

test("5. Capital One CSV parser handles quoted commas and ignores payments", () => {
  const sampleCsv = [
    "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit",
    '2026-11-01,2026-11-02,1234,"NETFLIX.COM, LOS GATOS, CA",Entertainment,15.49,',
    '2026-11-02,2026-11-03,1234,"SPOTIFY USA, NEW YORK, NY",Entertainment,16.99,',
    '2026-11-03,2026-11-04,1234,"CAPITAL ONE MOBILE PYMT",Payment/Credit,,250.00'
  ].join("\n");

  const items = app.parseCapitalOneCsv(sampleCsv, new Date(2026, 10, 7));
  assert.equal(items.length, 2, "Should extract 2 subscriptions and ignore the payment row");
  assert.equal(items[0].name, "NETFLIX.COM, LOS GATOS, CA");
  assert.equal(items[0].price, 15.49);
  assert.equal(items[1].name, "SPOTIFY USA, NEW YORK, NY");
  assert.equal(items[1].price, 16.99);
});

test("6. iPhone .ics Calendar alarm generator handles valid and malformed dates safely", () => {
  const ics = app.buildIcsContent({
    id: "trial-1",
    name: "Apple Arcade",
    price: 6.99,
    cycle: "monthly",
    source: "apple",
    nextDate: "2026-11-12"
  });

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /TRIGGER:-PT24H/);
  assert.match(ics, /https:\/\/apps\.apple\.com\/account\/subscriptions/);

  // Test with missing/invalid date so it never throws RangeError
  const fallbackIcs = app.buildIcsContent({
    id: "bad-date",
    name: "Mystery Trial",
    price: 9.99,
    source: "capone",
    nextDate: ""
  });
  assert.match(fallbackIcs, /BEGIN:VEVENT/);
});

test("7. Every DOM element ID referenced in app.js exists in index.html", () => {
  const html = fs.readFileSync(path.resolve("index.html"), "utf8");
  const js = fs.readFileSync(path.resolve("app.js"), "utf8");

  const idMatches = [...js.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((m) => m[1]);
  const uniqueIds = [...new Set(idMatches)];

  assert.ok(uniqueIds.length > 15, "Should find DOM IDs in app.js");
  for (const id of uniqueIds) {
    assert.match(
      html,
      new RegExp(`id=["']${id}["']`),
      `Missing element with id="${id}" in index.html`
    );
  }
});
