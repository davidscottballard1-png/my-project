// SubSniper — iOS Subscription & Free-Trial Sniper
// Supports Screenshot OCR (Tesseract.js), Capital One (Plaid Link & CSV), and 48h .ics Calendar Alarms

const STORAGE_KEY = "subsniper_items_v1";

// Format local Date as YYYY-MM-DD (avoids UTC evening day-shift bugs)
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysFromNow(days, baseDate = new Date()) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  d.setDate(d.getDate() + Number(days || 0));
  return formatLocalDate(d);
}

function daysUntil(dateStr, nowDate = new Date()) {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getDefaultSubscriptions(baseDate = new Date()) {
  return [
    {
      id: "trial-1",
      name: "Apple Arcade",
      price: 6.99,
      cycle: "monthly",
      source: "apple",
      nextDate: daysFromNow(3, baseDate),
      isTrial: true,
      icon: "🕹️"
    },
    {
      id: "trial-2",
      name: "YouTube Premium",
      price: 13.99,
      cycle: "monthly",
      source: "google",
      nextDate: daysFromNow(5, baseDate),
      isTrial: true,
      icon: "▶️"
    },
    {
      id: "sub-1",
      name: "iCloud+ 2TB",
      price: 9.99,
      cycle: "monthly",
      source: "apple",
      nextDate: daysFromNow(9, baseDate),
      isTrial: false,
      icon: "☁️"
    },
    {
      id: "sub-2",
      name: "ChatGPT Plus",
      price: 19.99,
      cycle: "monthly",
      source: "apple",
      nextDate: daysFromNow(14, baseDate),
      isTrial: false,
      icon: "🤖"
    },
    {
      id: "sub-3",
      name: "Google One 2TB",
      price: 9.99,
      cycle: "monthly",
      source: "google",
      nextDate: daysFromNow(18, baseDate),
      isTrial: false,
      icon: "💎"
    },
    {
      id: "sub-4",
      name: "Netflix Standard",
      price: 15.49,
      cycle: "monthly",
      source: "capone",
      nextDate: daysFromNow(6, baseDate),
      isTrial: false,
      icon: "🎬"
    },
    {
      id: "sub-5",
      name: "Spotify Duo",
      price: 16.99,
      cycle: "monthly",
      source: "capone",
      nextDate: daysFromNow(11, baseDate),
      isTrial: false,
      icon: "🎧"
    },
    {
      id: "sub-6",
      name: "Xbox Game Pass",
      price: 19.99,
      cycle: "monthly",
      source: "capone",
      nextDate: daysFromNow(21, baseDate),
      isTrial: false,
      icon: "🎮"
    }
  ];
}

let subscriptions = [];
let activeFilter = "all";
let pendingOcrItems = [];
let pendingPlaidItems = [];
let toastTimer = null;

function loadSubscriptions(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    if (storage) {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        // Respect empty array [] when user clears all subscriptions, and auto-repair any OCR-truncated names!
        if (Array.isArray(parsed)) {
          return sanitizeSubscriptionList(parsed);
        }
      }
    }
  } catch (e) {
    console.warn("Could not read localStorage:", e);
  }
  return getDefaultSubscriptions();
}

function saveSubscriptions(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
    }
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

function showToast(msg) {
  if (typeof document === "undefined") return;
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function guessIcon(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("applecare") || n.includes("apple one") || n.includes("apple tv") || n.includes("apple music")) return "🍎";
  if (n.includes("netflix") || n.includes("hulu") || n.includes("max") || n.includes("disney") || n.includes("tv") || n.includes("paramount") || n.includes("peacock")) return "🎬";
  if (n.includes("spotify") || n.includes("music") || n.includes("audible") || n.includes("podcast")) return "🎧";
  if (n.includes("icloud") || n.includes("google one") || n.includes("dropbox") || n.includes("drive")) return "☁️";
  if (n.includes("game") || n.includes("steam") || n.includes("xbox") || n.includes("playstation") || n.includes("arcade") || n.includes("nintendo")) return "🎮";
  if (n.includes("youtube")) return "▶️";
  if (n.includes("chatgpt") || n.includes("claude") || n.includes("ai") || n.includes("copilot") || n.includes("pro monthly")) return "🤖";
  if (n.includes("amazon") || n.includes("prime") || n.includes("instacart") || n.includes("doordash") || n.includes("uber")) return "📦";
  if (n.includes("gym") || n.includes("fitness") || n.includes("strava") || n.includes("peloton") || n.includes("whoop")) return "💪";
  return "💳";
}

// Clean OCR artifacts from left-aligned app icons ("0 AppleCare One", "®) Pro Monthly", "One Premier" -> "one Premier")
function cleanScannedName(rawName) {
  let s = String(rawName || "").trim();
  // Strip leading non-alphanumeric symbol clusters (e.g. "®) ", "© ", "• ")
  s = s.replace(/^[^a-zA-Z0-9]+/, "").trim();
  // Strip isolated leading single digit/character caused by app icon OCR ("0 AppleCare One", "O Apple One")
  s = s.replace(/^(?:[0O®©™@|\]\[()!*~<>«»]{1,3}\s+)+/, "").trim();
  s = s.replace(/^[^a-zA-Z0-9]+/, "").trim();
  // Restore "Apple " when iOS uses the  Apple glyph before "One Premier / Family / Individual"
  if (/^one\s+(premier|family|individual)\b/i.test(s)) {
    s = "Apple " + s.charAt(0).toUpperCase() + s.slice(1);
  } else if (/^apple\s+one\s+premier$/i.test(s)) {
    s = "Apple One Premier";
  }
  return s || "Subscription";
}

function sanitizeSubscriptionList(list) {
  if (!Array.isArray(list)) return list;
  return list.map((item) => {
    if (!item || typeof item !== "object") return item;
    const cleanedName = cleanScannedName(item.name);
    const updatedIcon =
      !item.icon || item.icon === "💳" ? guessIcon(cleanedName) : item.icon;
    return {
      ...item,
      name: cleanedName,
      icon: updatedIcon
    };
  });
}

function toMonthlyEquivalent(price, cycle) {
  const p = Number(price);
  if (isNaN(p) || p < 0) return 0;
  if (cycle === "yearly") return p / 12;
  if (cycle === "weekly") return (p * 52) / 12;
  return p;
}

function calculateTotals(items) {
  let appleMonthly = 0;
  let googleMonthly = 0;
  let caponeMonthly = 0;

  (items || []).forEach((item) => {
    const m = toMonthlyEquivalent(item.price, item.cycle);
    if (item.source === "apple") appleMonthly += m;
    else if (item.source === "google") googleMonthly += m;
    else caponeMonthly += m;
  });

  const totalMonthly = appleMonthly + googleMonthly + caponeMonthly;
  const totalYearly = totalMonthly * 12;
  const daily = totalYearly / 365;

  return {
    appleMonthly,
    googleMonthly,
    caponeMonthly,
    totalMonthly,
    totalYearly,
    daily
  };
}

function getSourceMeta(source) {
  if (source === "apple") {
    return {
      label: "🍎 App Store",
      className: "source-apple",
      cancelUrl: "https://apps.apple.com/account/subscriptions",
      cancelLabel: "Open iOS App Store Subscriptions"
    };
  }
  if (source === "google") {
    return {
      label: "▶️ Google Play",
      className: "source-google",
      cancelUrl: "https://play.google.com/store/account/subscriptions",
      cancelLabel: "Open Google Play Subscriptions"
    };
  }
  return {
    label: "💳 Capital One",
    className: "source-capone",
    cancelUrl: "https://myaccounts.capitalone.com",
    cancelLabel: "Manage in Capital One / Eno"
  };
}

// Build .ics Calendar content (pure function for easy unit testing + safe date fallback)
function buildIcsContent(sub) {
  const meta = getSourceMeta(sub.source);
  const parts = String(sub.nextDate || "").split("-").map(Number);
  const validDate =
    parts.length === 3 && !parts.some(isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  // Set event on the day before renewal at 9:00 AM with a 24h prior trigger (=48h total notice)
  const alertDate = new Date(validDate.getTime() - 24 * 60 * 60 * 1000);
  const endDate = new Date(alertDate.getTime() + 30 * 60 * 1000);

  const formatIcsDate = (d) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const priceFormatted = (Number(sub.price) || 0).toFixed(2);
  const safeName = String(sub.name || "Subscription").replace(/[\r\n,;]/g, " ");

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SubSniper//iOS Free Trial Sniper//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:subsniper-${sub.id || "item"}-${Date.now()}@subsniper.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(alertDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:🎯 CANCEL FREE TRIAL: ${safeName} ($${priceFormatted})`,
    `DESCRIPTION:Your ${safeName} subscription/trial renews on ${sub.nextDate} for $${priceFormatted}/${sub.cycle || "monthly"}. Cancel link: ${meta.cancelUrl}`,
    `URL:${meta.cancelUrl}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    `DESCRIPTION:48h Warning: Cancel ${safeName} before $${priceFormatted} charge!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  return icsLines.join("\r\n");
}

function downloadIcsAlarm(sub) {
  const icsText = buildIcsContent(sub);
  const fileName = `cancel-${String(sub.name || "trial").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;

  try {
    const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("📅 48h iPhone Calendar Alarm Ready!");
  } catch (e) {
    // Fallback to data URI for embedded iOS webviews
    const dataUrl = "data:text/calendar;charset=utf-8," + encodeURIComponent(icsText);
    window.open(dataUrl, "_blank");
    showToast("📅 Calendar Alert Opened!");
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

// Parse OCR text from Apple App Store / Google Play / Capital One screenshots
function parseSubscriptionText(rawText, source = "apple", baseDate = new Date()) {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const detected = [];
  // Matches $9.99, $ 14.99, USD 9.99, or 9.99/month
  const priceRegex = /(?:\$\s*|USD\s*)(\d{1,3}(?:\.\d{2}))|(\d{1,3}\.\d{2})\s*(?:\/|\s*per\s*)(?:mo|month|yr|year|wk|week)/i;
  const ignoreNameWords = /^(renews.*|expires.*|active|subscriptions|your subscriptions|included|billing|payment|apple|google|capital one|monthly|annual|yearly|weekly|individual.*|family.*|student.*|annual plan|monthly plan|plan|free trial|trial|see all|manage)$/i;
  // Plan tier subtitles in iOS Settings (where the actual App Name is 1 line above the subtitle)
  const planTierSubtitleRegex = /^(pro|plus|premier|premium|standard|basic|individual|family|student|monthly|annual|yearly|weekly|plan|tier|subscription|1\s*month|1\s*year|\d+\s*(?:tb|gb))(?:\s+(?:plan|monthly|annual|yearly|weekly|subscription|tier))?$/i;

  const cleanLineCandidate = (str) =>
    cleanScannedName(
      String(str || "")
        .replace(priceRegex, "")
        .replace(/\/(month|mo|year|yr|week|wk)\b/gi, "")
        .replace(/\b(per\s+month|per\s+year|free\s+trial|trial|renews.*|expires.*|individual\s+plan|family\s+plan|student\s+plan|annual\s+plan|monthly\s+plan)\b/gi, "")
        .replace(/[-•|:$()]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(priceRegex);
    if (!match) continue;

    const priceVal = parseFloat(match[1] || match[2]);
    if (isNaN(priceVal) || priceVal <= 0 || priceVal > 600) continue;

    // Try extracting service name from current line first
    let nameCandidate = cleanLineCandidate(lines[i]);
    if (nameCandidate === "Subscription") nameCandidate = "";

    // If current line only had the price/plan tier, look 1 or 2 lines above (standard iOS Settings layout)
    if (nameCandidate.length < 3 || ignoreNameWords.test(nameCandidate) || planTierSubtitleRegex.test(nameCandidate)) {
      const line1Up = i - 1 >= 0 && !priceRegex.test(lines[i - 1]) ? cleanLineCandidate(lines[i - 1]) : "";
      const line2Up = i - 2 >= 0 && !priceRegex.test(lines[i - 2]) ? cleanLineCandidate(lines[i - 2]) : "";

      const isLine1Valid =
        line1Up.length >= 2 &&
        line1Up !== "Subscription" &&
        !ignoreNameWords.test(line1Up) &&
        !/^\d+$/.test(line1Up);
      const isLine2Valid =
        line2Up.length >= 2 &&
        line2Up !== "Subscription" &&
        !ignoreNameWords.test(line2Up) &&
        !planTierSubtitleRegex.test(line2Up) &&
        !/^\d+$/.test(line2Up);

      if (isLine1Valid && planTierSubtitleRegex.test(line1Up) && isLine2Valid) {
        // e.g. line2Up = "Apple One" (or "One") and line1Up = "Premier", or line2Up = "ChatGPT" and line1Up = "Pro Monthly"
        if (/^(apple\s+one|one)$/i.test(line2Up) && /^premier$/i.test(line1Up)) {
          nameCandidate = "Apple One Premier";
        } else {
          nameCandidate = line2Up;
        }
      } else if (isLine1Valid && !planTierSubtitleRegex.test(line1Up)) {
        nameCandidate = line1Up;
      } else if (isLine2Valid) {
        nameCandidate = line2Up;
      } else if (isLine1Valid) {
        nameCandidate = line1Up;
      }
    }

    nameCandidate = cleanScannedName(nameCandidate);
    if (!nameCandidate || nameCandidate.length < 2 || ignoreNameWords.test(nameCandidate)) {
      nameCandidate = "Scanned Subscription";
    }

    const contextWindow = [lines[i - 1] || "", lines[i], lines[i + 1] || ""].join(" ").toLowerCase();
    const cycle =
      contextWindow.includes("year") || contextWindow.includes("/yr") || contextWindow.includes("annual")
        ? "yearly"
        : contextWindow.includes("week") || contextWindow.includes("/wk")
        ? "weekly"
        : "monthly";
    const isTrial = contextWindow.includes("trial") || contextWindow.includes("free");

    detected.push({
      id: "ocr-" + Date.now() + "-" + detected.length,
      name: nameCandidate.slice(0, 36),
      price: priceVal,
      cycle,
      source,
      nextDate: daysFromNow(isTrial ? 4 : 14, baseDate),
      isTrial,
      icon: guessIcon(nameCandidate)
    });
  }

  return detected;
}

// RFC-4180 compliant CSV line splitter (handles commas inside quotes!)
function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse Capital One CSV export (handles quoted commas and dynamic headers)
function parseCapitalOneCsv(csvText, baseDate = new Date()) {
  if (!csvText || typeof csvText !== "string") return [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const descIdx = headers.findIndex((h) => h.includes("description") || h.includes("merchant") || h.includes("name"));
  const debitIdx = headers.findIndex((h) => h.includes("debit") || h.includes("amount") || h.includes("charge"));
  const catIdx = headers.findIndex((h) => h.includes("category"));

  const merchantMap = new Map();
  const ignoreCategories = /payment|credit|transfer|payroll|deposit|atm/i;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 2) continue;

    const category = catIdx >= 0 ? cols[catIdx] || "" : "";
    if (ignoreCategories.test(category)) continue;

    const description =
      (descIdx >= 0 ? cols[descIdx] : cols[3] || cols[1] || cols[0]) || "";
    if (ignoreCategories.test(description)) continue;

    let rawAmount = "";
    if (debitIdx >= 0 && cols[debitIdx]) {
      rawAmount = cols[debitIdx];
    } else {
      // Fallback: find the first column after description that looks like a positive dollar amount
      for (let c = 1; c < cols.length; c++) {
        if (c === descIdx) continue;
        if (/^\$?\d{1,3}(\.\d{2})$/.test(cols[c])) {
          rawAmount = cols[c];
          break;
        }
      }
    }

    const amount = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ""));
    if (!description || isNaN(amount) || amount <= 0.99 || amount > 400) continue;

    const cleanName = description
      .replace(/\b(recurring|payment|purchase|pos|visa|mastercard)\b/gi, "")
      .replace(/[0-9#*]{3,}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanName.length < 2) continue;

    if (!merchantMap.has(cleanName)) {
      merchantMap.set(cleanName, []);
    }
    merchantMap.get(cleanName).push(amount);
  }

  const found = [];
  merchantMap.forEach((amounts, merchant) => {
    const latestPrice = amounts[0];
    found.push({
      id: "capone-" + Date.now() + "-" + found.length,
      name: merchant.slice(0, 28),
      price: latestPrice,
      cycle: "monthly",
      source: "capone",
      nextDate: daysFromNow(10 + found.length * 3, baseDate),
      isTrial: false,
      icon: guessIcon(merchant)
    });
  });

  return found.slice(0, 12);
}

// Downscale large iPhone photos/screenshots on an offscreen canvas so mobile Safari OCR is fast & crash-free
function downscaleImageForOcr(file, maxDim = 1400) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function renderDashboard() {
  if (typeof document === "undefined") return;

  const {
    appleMonthly,
    googleMonthly,
    caponeMonthly,
    totalMonthly,
    totalYearly,
    daily
  } = calculateTotals(subscriptions);

  document.getElementById("monthlyTotal").innerHTML = `$${totalMonthly.toFixed(2)}<span>/mo</span>`;
  document.getElementById("dailyCost").textContent = `$${daily.toFixed(2)}/d`;
  document.getElementById("yearlyTotal").textContent = `$${Math.round(totalYearly)}/yr`;

  document.getElementById("sumApple").textContent = `$${appleMonthly.toFixed(0)}`;
  document.getElementById("sumGoogle").textContent = `$${googleMonthly.toFixed(0)}`;
  document.getElementById("sumCapOne").textContent = `$${caponeMonthly.toFixed(0)}`;

  // Fix: Reset segmented progress bars cleanly to 0% when totalMonthly === 0
  if (totalMonthly > 0) {
    document.getElementById("barApple").style.width = `${(appleMonthly / totalMonthly) * 100}%`;
    document.getElementById("barGoogle").style.width = `${(googleMonthly / totalMonthly) * 100}%`;
    document.getElementById("barCapOne").style.width = `${(caponeMonthly / totalMonthly) * 100}%`;
  } else {
    document.getElementById("barApple").style.width = "0%";
    document.getElementById("barGoogle").style.width = "0%";
    document.getElementById("barCapOne").style.width = "0%";
  }

  // Render Free Trial Sniper Radar
  const trials = subscriptions
    .filter((s) => s.isTrial)
    .sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));

  const trialList = document.getElementById("trialListContainer");
  document.getElementById("trialCountLabel").textContent = `${trials.length} active`;

  if (trials.length === 0) {
    trialList.innerHTML = `<div style="font-size:0.78rem; color:var(--text-secondary);">No active free trials right now. Tap <strong>Snipe Free Trial</strong> whenever you start one!</div>`;
  } else {
    trialList.innerHTML = trials
      .map((t) => {
        const dLeft = daysUntil(t.nextDate);
        const countdownText =
          dLeft < 0
            ? "Expired"
            : dLeft === 0
            ? "⚠️ Charges Today!"
            : `${dLeft} day${dLeft === 1 ? "" : "s"} left`;
        const meta = getSourceMeta(t.source);
        const cycleShort = t.cycle === "yearly" ? "yr" : t.cycle === "weekly" ? "wk" : "mo";

        return `
        <div class="trial-card">
          <div class="trial-top" onclick="openDetail('${escapeHtml(t.id)}')" style="cursor:pointer;">
            <div class="trial-name-wrap">
              <div class="sub-emoji">${t.icon || "🎯"}</div>
              <div>
                <div class="trial-name">${escapeHtml(t.name)}</div>
                <div class="trial-meta">${meta.label} • Then $${Number(t.price).toFixed(2)}/${cycleShort}</div>
              </div>
            </div>
            <div class="trial-countdown">${countdownText}</div>
          </div>
          <div class="trial-actions">
            <button type="button" class="btn-trial-action btn-ics" onclick="triggerIcs('${escapeHtml(t.id)}')">
              ⏰ 48h iOS Alarm
            </button>
            <a class="btn-trial-action btn-cancel-now" href="${meta.cancelUrl}" target="_blank" rel="noopener">
              ✂️ Cancel Now
            </a>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // Render Recurring Subscriptions List
  const filtered = subscriptions
    .filter((s) => (activeFilter === "all" ? true : s.source === activeFilter))
    .sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));

  document.getElementById("subCountLabel").textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;
  const subList = document.getElementById("subListContainer");

  if (filtered.length === 0) {
    subList.innerHTML = `
      <div class="status-box" style="text-align:center; padding: 20px;">
        <div style="margin-bottom:8px;">No subscriptions in this view yet.</div>
        <button type="button" class="btn-secondary" onclick="restoreSampleData()" style="max-width:220px; margin:0 auto;">
          🔄 Restore Sample Data
        </button>
      </div>
    `;
    return;
  }

  subList.innerHTML = filtered
    .map((s) => {
      const meta = getSourceMeta(s.source);
      const dLeft = daysUntil(s.nextDate);
      const soonClass = dLeft >= 0 && dLeft <= 5 ? "soon" : "";
      const renewsText =
        dLeft === 0
          ? "Charges today"
          : dLeft === 1
          ? "Charges tomorrow"
          : dLeft > 1
          ? `In ${dLeft} days (${s.nextDate})`
          : `Billed ${s.nextDate}`;

      return `
      <div class="sub-card" onclick="openDetail('${escapeHtml(s.id)}')">
        <div class="sub-left">
          <div class="sub-emoji">${s.icon || "💳"}</div>
          <div class="sub-info">
            <div class="sub-title-row">
              <span class="sub-name">${escapeHtml(s.name)}</span>
            </div>
            <div class="sub-meta-row">
              <span class="source-pill ${meta.className}">${meta.label}</span>
              ${s.isTrial ? `<span class="source-pill" style="background:rgba(245,158,11,0.2);color:#fde68a;">TRIAL</span>` : ""}
              <span class="sub-renews ${soonClass}">${renewsText}</span>
            </div>
          </div>
        </div>
        <div class="sub-right">
          <div class="sub-price">$${Number(s.price).toFixed(2)}</div>
          <div class="sub-cycle">/${s.cycle === "yearly" ? "yr" : s.cycle === "weekly" ? "wk" : "mo"}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

// Modal & Navigation Helpers (Fixes modal stacking & bottom-nav sync)
function closeAllModals() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".modal-backdrop.open").forEach((m) => m.classList.remove("open"));
}

function setActiveNav(navId) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".bottom-nav .nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.id === navId);
  });
}

function openModal(id) {
  if (typeof document === "undefined") return;
  closeAllModals();
  const el = document.getElementById(id);
  if (el) el.classList.add("open");

  if (id === "modalOcr") setActiveNav("navOcr");
  else if (id === "modalPlaid") setActiveNav("navPlaid");
  else if (id === "modalAdd") setActiveNav("navSniper");
}

function closeModal(id) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
  setActiveNav("navDashboard");
}

function renderOcrDetectedList() {
  if (typeof document === "undefined") return;
  const container = document.getElementById("ocrDetectedList");
  const area = document.getElementById("ocrResultsArea");
  if (pendingOcrItems.length === 0) {
    area.style.display = "none";
    return;
  }
  area.style.display = "block";
  container.innerHTML = pendingOcrItems
    .map(
      (item, idx) => `
    <div class="detected-item" style="gap:8px;">
      <div style="flex:1; min-width:0;">
        <input type="text" class="form-input" value="${escapeHtml(item.name)}" oninput="updateOcrItemName(${idx}, this.value)" onchange="updateOcrItemName(${idx}, this.value)" style="padding:6px 9px; font-size:0.84rem; margin-bottom:4px;" />
        <div style="font-size:0.72rem; color:var(--text-secondary);">
          ${getSourceMeta(item.source).label} ${item.isTrial ? "• 🎯 Free Trial" : ""}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <input type="number" step="0.01" class="form-input" value="${Number(item.price).toFixed(2)}" oninput="updateOcrItemPrice(${idx}, this.value)" onchange="updateOcrItemPrice(${idx}, this.value)" style="width:82px; padding:6px 8px; font-size:0.84rem; text-align:right;" />
        <button type="button" class="btn-close" onclick="removeOcrItem(${idx})" title="Remove">✕</button>
      </div>
    </div>
  `
    )
    .join("");
}

function renderPlaidDetectedList() {
  if (typeof document === "undefined") return;
  const area = document.getElementById("plaidResultsArea");
  const list = document.getElementById("plaidDetectedList");
  if (pendingPlaidItems.length === 0) {
    area.style.display = "none";
    return;
  }
  area.style.display = "block";
  list.innerHTML = pendingPlaidItems
    .map(
      (item, idx) => `
    <div class="detected-item">
      <div>
        <div style="font-weight:700; font-size:0.9rem;">${item.icon} ${escapeHtml(item.name)}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">💳 Capital One Recurring Charge</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-weight:800; color:#fda4af;">$${Number(item.price).toFixed(2)}/mo</span>
        <button type="button" class="btn-close" onclick="removePlaidItem(${idx})" title="Remove">✕</button>
      </div>
    </div>
  `
    )
    .join("");
}

// Global handlers attached to window when in browser
if (typeof window !== "undefined") {
  window.triggerIcs = function (id) {
    const sub = subscriptions.find((s) => s.id === id);
    if (sub) downloadIcsAlarm(sub);
  };

  window.updateOcrItemName = function (idx, val) {
    if (pendingOcrItems[idx]) {
      pendingOcrItems[idx].name = String(val || "").trim() || "Subscription";
      pendingOcrItems[idx].icon = guessIcon(pendingOcrItems[idx].name);
    }
  };

  window.updateOcrItemPrice = function (idx, val) {
    const p = parseFloat(val);
    if (pendingOcrItems[idx] && !isNaN(p) && p > 0) {
      pendingOcrItems[idx].price = p;
    }
  };

  window.removeOcrItem = function (idx) {
    pendingOcrItems.splice(idx, 1);
    renderOcrDetectedList();
  };

  window.removePlaidItem = function (idx) {
    pendingPlaidItems.splice(idx, 1);
    renderPlaidDetectedList();
  };

  window.restoreSampleData = function () {
    subscriptions = getDefaultSubscriptions();
    saveSubscriptions();
    renderDashboard();
    showToast("🔄 Sample subscriptions restored!");
  };

  window.openEditSub = function (id) {
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) return;
    document.getElementById("modalAddTitle").textContent = "✏️ Edit Subscription";
    document.getElementById("inputEditId").value = sub.id;
    document.getElementById("inputName").value = sub.name;
    document.getElementById("inputPrice").value = sub.price;
    document.getElementById("inputCycle").value = sub.cycle;
    document.getElementById("inputSource").value = sub.source;
    document.getElementById("inputDate").value = sub.nextDate;
    document.getElementById("inputIsTrial").value = String(Boolean(sub.isTrial));
    document.getElementById("btnSubmitSubForm").textContent = "Save Changes";
    openModal("modalAdd");
  };

  window.openDetail = function (id) {
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) return;
    const meta = getSourceMeta(sub.source);
    const monthly = toMonthlyEquivalent(sub.price, sub.cycle);
    const yearly = monthly * 12;

    document.getElementById("detailTitle").textContent = `${sub.icon || "💳"} ${sub.name}`;
    document.getElementById("detailBody").innerHTML = `
      <div class="status-box" style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Billed via:</span>
          <strong>${meta.label}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Price:</span>
          <strong>$${Number(sub.price).toFixed(2)} / ${sub.cycle}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Annual Impact:</span>
          <strong>$${yearly.toFixed(2)} / year</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span>Next Renewal Date:</span>
          <strong>${sub.nextDate}</strong>
        </div>
      </div>

      <a href="${meta.cancelUrl}" target="_blank" rel="noopener" class="btn-primary" style="display:block; text-align:center; text-decoration:none; margin-bottom:8px;">
        ✂️ ${meta.cancelLabel}
      </a>

      <button type="button" class="btn-secondary" onclick="triggerIcs('${escapeHtml(sub.id)}')">
        ⏰ Add 48-Hour Cancel Alert to iPhone Calendar
      </button>

      <button type="button" class="btn-secondary" onclick="openEditSub('${escapeHtml(sub.id)}')">
        ✏️ Edit Subscription Details
      </button>

      <button type="button" class="btn-danger" onclick="deleteSub('${escapeHtml(sub.id)}')">
        🗑️ Remove from SubSniper
      </button>
    `;
    openModal("modalDetail");
  };

  window.deleteSub = function (id) {
    subscriptions = subscriptions.filter((s) => s.id !== id);
    saveSubscriptions();
    closeModal("modalDetail");
    renderDashboard();
    showToast("🗑️ Removed subscription");
  };
}

function initApp() {
  if (typeof document === "undefined") return;
  subscriptions = loadSubscriptions();
  saveSubscriptions();
  const dateInput = document.getElementById("inputDate");
  if (dateInput) dateInput.value = daysFromNow(7);
  renderDashboard();

  // Filter buttons
  document.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      renderDashboard();
    });
  });

  // Dashboard nav item (closes any open modal and returns to top)
  const navDash = document.getElementById("navDashboard");
  if (navDash) {
    navDash.addEventListener("click", () => {
      closeAllModals();
      setActiveNav("navDashboard");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Open Modals from Quick Actions & Bottom Nav
  document.getElementById("btnOpenOcr").addEventListener("click", () => openModal("modalOcr"));
  document.getElementById("navOcr").addEventListener("click", () => openModal("modalOcr"));

  document.getElementById("btnOpenPlaid").addEventListener("click", () => openModal("modalPlaid"));
  document.getElementById("navPlaid").addEventListener("click", () => openModal("modalPlaid"));

  const openSniperForm = (isTrialDefault) => {
    document.getElementById("subForm").reset();
    document.getElementById("inputEditId").value = "";
    document.getElementById("inputDate").value = daysFromNow(isTrialDefault ? 7 : 30);
    document.getElementById("modalAddTitle").textContent = isTrialDefault
      ? "🎯 Snipe a Free Trial"
      : "＋ Add Subscription";
    document.getElementById("inputIsTrial").value = isTrialDefault ? "true" : "false";
    document.getElementById("btnSubmitSubForm").textContent = isTrialDefault
      ? "Save & Activate Sniper"
      : "Add Subscription";
    openModal("modalAdd");
  };

  document.getElementById("btnOpenSniper").addEventListener("click", () => openSniperForm(true));
  document.getElementById("navSniper").addEventListener("click", () => openSniperForm(true));
  document.getElementById("btnAddManual").addEventListener("click", () => openSniperForm(false));

  // Clear All Sample Data button
  const btnClearAll = document.getElementById("btnClearAll");
  if (btnClearAll) {
    btnClearAll.addEventListener("click", () => {
      if (subscriptions.length === 0) {
        subscriptions = getDefaultSubscriptions();
        saveSubscriptions();
        renderDashboard();
        showToast("🔄 Restored sample subscriptions");
      } else {
        subscriptions = [];
        saveSubscriptions();
        renderDashboard();
        showToast("🧹 Cleared all subscriptions!");
      }
    });
  }

  // Close buttons
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  // Close backdrop on tap outside sheet
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("open");
        setActiveNav("navDashboard");
      }
    });
  });

  // Add or Edit Subscription Form Submit
  document.getElementById("subForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const editId = document.getElementById("inputEditId").value.trim();
    const name = document.getElementById("inputName").value.trim();
    const price = parseFloat(document.getElementById("inputPrice").value);
    const cycle = document.getElementById("inputCycle").value;
    const source = document.getElementById("inputSource").value;
    const nextDate = document.getElementById("inputDate").value || daysFromNow(7);
    const isTrial = document.getElementById("inputIsTrial").value === "true";

    if (!name || isNaN(price) || price <= 0) {
      showToast("⚠️ Enter a valid name and price");
      return;
    }

    if (editId) {
      const idx = subscriptions.findIndex((s) => s.id === editId);
      if (idx !== -1) {
        subscriptions[idx] = {
          ...subscriptions[idx],
          name,
          price,
          cycle,
          source,
          nextDate,
          isTrial,
          icon: guessIcon(name)
        };
      }
      showToast("✅ Subscription Updated!");
    } else {
      subscriptions.unshift({
        id: "sub-" + Date.now(),
        name,
        price,
        cycle,
        source,
        nextDate,
        isTrial,
        icon: guessIcon(name)
      });
      showToast(isTrial ? "🎯 Trial Sniped! Tap 48h Alarm to save to Calendar" : "✅ Subscription Added!");
    }

    saveSubscriptions();
    renderDashboard();
    closeModal("modalAdd");
    e.target.reset();
    document.getElementById("inputEditId").value = "";
    document.getElementById("inputDate").value = daysFromNow(7);
  });

  // Screenshot OCR Upload Handler (Tesseract.js with downscaling & fallback)
  document.getElementById("ocrFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const source = document.getElementById("ocrSourceSelect").value;
    const progressBox = document.getElementById("ocrProgressBox");
    const statusText = document.getElementById("ocrStatusText");
    progressBox.style.display = "block";
    statusText.textContent = "🔍 Optimizing & scanning screenshot...";

    try {
      if (window.Tesseract) {
        const optimizedBlob = await downscaleImageForOcr(file);
        const result = await window.Tesseract.recognize(optimizedBlob, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              statusText.textContent = `🔍 Scanning screenshot... ${Math.round((m.progress || 0) * 100)}%`;
            }
          }
        });
        const extracted = parseSubscriptionText(result.data.text, source);
        if (extracted.length > 0) {
          progressBox.style.display = "none";
          pendingOcrItems = extracted;
          renderOcrDetectedList();
          showToast(`📸 Found ${extracted.length} subscription(s)!`);
        } else {
          // Provide an editable item so the user isn't stuck if screenshot had no $ signs
          pendingOcrItems = [
            {
              id: "ocr-" + Date.now(),
              name: "Scanned App (Tap to edit)",
              price: 9.99,
              cycle: "monthly",
              source,
              nextDate: daysFromNow(7),
              isTrial: false,
              icon: "📱"
            }
          ];
          statusText.textContent = "ℹ️ Couldn't spot a clear $ price in that screenshot—edit the item below to import:";
          renderOcrDetectedList();
        }
      } else {
        statusText.textContent = "⚠️ OCR engine still loading—try the Sample Scan or tap again in a second.";
      }
    } catch (err) {
      statusText.textContent = "⚠️ Could not read image file. Try a standard PNG/JPG screenshot.";
    } finally {
      // Reset input so choosing the same photo again triggers change event
      e.target.value = "";
    }
  });

  // Demo Instant OCR Scan Button
  document.getElementById("btnDemoOcrScan").addEventListener("click", () => {
    const source = document.getElementById("ocrSourceSelect").value;
    const sampleText =
      source === "apple"
        ? "Apple TV+\nIndividual Plan\n$9.99/month Free Trial\nStrava Summit\n$11.99/month\nFantastical\n$4.99/month"
        : source === "google"
        ? "Disney+ Duo\n$14.99/month\nFitbit Premium\n$9.99/month Free Trial"
        : "Audible Membership\n$14.95/month\nAmazon Prime\n$14.99/month";

    pendingOcrItems = parseSubscriptionText(sampleText, source);
    document.getElementById("ocrProgressBox").style.display = "none";
    renderOcrDetectedList();
    showToast(`✨ Scanned ${pendingOcrItems.length} subscriptions!`);
  });

  // Import All OCR Items
  document.getElementById("btnImportAllOcr").addEventListener("click", () => {
    if (pendingOcrItems.length === 0) return;
    subscriptions = [...pendingOcrItems, ...subscriptions];
    pendingOcrItems = [];
    saveSubscriptions();
    renderOcrDetectedList();
    renderDashboard();
    closeModal("modalOcr");
    showToast("📸 Imported scanned subscriptions!");
  });

  // Plaid Link Button
  document.getElementById("btnLaunchPlaid").addEventListener("click", () => {
    const customToken = document.getElementById("customPlaidToken").value.trim();
    if (customToken && window.Plaid) {
      const handler = window.Plaid.create({
        token: customToken,
        onSuccess: () => {
          showToast("🏦 Plaid Link Connected!");
        }
      });
      handler.open();
      return;
    }

    const btn = document.getElementById("btnLaunchPlaid");
    btn.textContent = "🔄 Scanning Capital One Recurring Charges...";
    setTimeout(() => {
      btn.textContent = "🔗 Test Capital One Plaid Link Flow";
      pendingPlaidItems = [
        {
          id: "plaid-" + Date.now() + "-1",
          name: "Max (HBO) Ad-Free",
          price: 16.99,
          cycle: "monthly",
          source: "capone",
          nextDate: daysFromNow(8),
          isTrial: false,
          icon: "🎬"
        },
        {
          id: "plaid-" + Date.now() + "-2",
          name: "Amazon Prime Video",
          price: 14.99,
          cycle: "monthly",
          source: "capone",
          nextDate: daysFromNow(12),
          isTrial: false,
          icon: "📦"
        },
        {
          id: "plaid-" + Date.now() + "-3",
          name: "Paramount+ Trial",
          price: 11.99,
          cycle: "monthly",
          source: "capone",
          nextDate: daysFromNow(2),
          isTrial: true,
          icon: "🎯"
        }
      ];
      renderPlaidDetectedList();
      showToast("🏦 Found 3 recurring Capital One charges!");
    }, 600);
  });

  // Capital One CSV Upload
  document.getElementById("csvFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const items = parseCapitalOneCsv(String(evt.target.result || ""));
      if (items.length > 0) {
        pendingPlaidItems = items;
        renderPlaidDetectedList();
        showToast(`📄 Found ${items.length} Capital One charges!`);
      } else {
        showToast("⚠️ No recurring charges found in CSV");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  // Import Plaid / Capital One Items
  document.getElementById("btnImportPlaid").addEventListener("click", () => {
    if (pendingPlaidItems.length === 0) return;
    subscriptions = [...pendingPlaidItems, ...subscriptions];
    pendingPlaidItems = [];
    saveSubscriptions();
    renderPlaidDetectedList();
    renderDashboard();
    closeModal("modalPlaid");
    showToast("💳 Capital One subscriptions synced!");
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}

// Export functions for Node.js Unit Test Suite
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STORAGE_KEY,
    formatLocalDate,
    daysFromNow,
    daysUntil,
    getDefaultSubscriptions,
    loadSubscriptions,
    toMonthlyEquivalent,
    calculateTotals,
    getSourceMeta,
    buildIcsContent,
    cleanScannedName,
    sanitizeSubscriptionList,
    parseSubscriptionText,
    splitCsvLine,
    parseCapitalOneCsv,
    escapeHtml
  };
}
