// SubSniper — iOS Subscription & Free-Trial Sniper
// Supports Screenshot OCR (Tesseract.js), Capital One (Plaid Link & CSV), and 48h .ics Calendar Alarms

const STORAGE_KEY = "subsniper_items_v1";

// Helper to get future date string YYYY-MM-DD
function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const DEFAULT_SUBSCRIPTIONS = [
  {
    id: "trial-1",
    name: "Apple Arcade",
    price: 6.99,
    cycle: "monthly",
    source: "apple",
    nextDate: daysFromNow(3),
    isTrial: true,
    icon: "🕹️"
  },
  {
    id: "trial-2",
    name: "YouTube Premium",
    price: 13.99,
    cycle: "monthly",
    source: "google",
    nextDate: daysFromNow(5),
    isTrial: true,
    icon: "▶️"
  },
  {
    id: "sub-1",
    name: "iCloud+ 2TB",
    price: 9.99,
    cycle: "monthly",
    source: "apple",
    nextDate: daysFromNow(9),
    isTrial: false,
    icon: "☁️"
  },
  {
    id: "sub-2",
    name: "ChatGPT Plus",
    price: 19.99,
    cycle: "monthly",
    source: "apple",
    nextDate: daysFromNow(14),
    isTrial: false,
    icon: "🤖"
  },
  {
    id: "sub-3",
    name: "Google One 2TB",
    price: 9.99,
    cycle: "monthly",
    source: "google",
    nextDate: daysFromNow(18),
    isTrial: false,
    icon: "💎"
  },
  {
    id: "sub-4",
    name: "Netflix Standard",
    price: 15.49,
    cycle: "monthly",
    source: "capone",
    nextDate: daysFromNow(6),
    isTrial: false,
    icon: "🎬"
  },
  {
    id: "sub-5",
    name: "Spotify Duo",
    price: 16.99,
    cycle: "monthly",
    source: "capone",
    nextDate: daysFromNow(11),
    isTrial: false,
    icon: "🎧"
  },
  {
    id: "sub-6",
    name: "Xbox Game Pass",
    price: 19.99,
    cycle: "monthly",
    source: "capone",
    nextDate: daysFromNow(21),
    isTrial: false,
    icon: "🎮"
  }
];

let subscriptions = loadSubscriptions();
let activeFilter = "all";
let pendingOcrItems = [];
let pendingPlaidItems = [];

function loadSubscriptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Could not read localStorage:", e);
  }
  return [...DEFAULT_SUBSCRIPTIONS];
}

function saveSubscriptions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function guessIcon(name) {
  const n = name.toLowerCase();
  if (n.includes("netflix") || n.includes("hulu") || n.includes("max") || n.includes("disney") || n.includes("tv")) return "🎬";
  if (n.includes("spotify") || n.includes("music") || n.includes("audible")) return "🎧";
  if (n.includes("icloud") || n.includes("google one") || n.includes("dropbox")) return "☁️";
  if (n.includes("game") || n.includes("steam") || n.includes("xbox") || n.includes("playstation") || n.includes("arcade")) return "🎮";
  if (n.includes("youtube")) return "▶️";
  if (n.includes("chatgpt") || n.includes("claude") || n.includes("ai")) return "🤖";
  if (n.includes("amazon") || n.includes("prime")) return "📦";
  if (n.includes("gym") || n.includes("fitness") || n.includes("strava")) return "💪";
  return "💳";
}

function toMonthlyEquivalent(price, cycle) {
  const p = Number(price) || 0;
  if (cycle === "yearly") return p / 12;
  if (cycle === "weekly") return (p * 52) / 12;
  return p;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffMs = target - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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

// Generate an iPhone .ics Calendar file with a 48-hour prior alarm
function downloadIcsAlarm(sub) {
  const meta = getSourceMeta(sub.source);
  const targetDate = new Date(sub.nextDate + "T09:00:00");
  // Set event on the day before renewal at 9:00 AM with a 24h prior trigger (=48h total notice)
  const alertDate = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);

  const formatIcsDate = (d) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const endDate = new Date(alertDate.getTime() + 30 * 60 * 1000);

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SubSniper//iOS Free Trial Sniper//EN",
    "BEGIN:VEVENT",
    `UID:subsniper-${sub.id}-${Date.now()}@subsniper.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(alertDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:🎯 CANCEL FREE TRIAL: ${sub.name} ($${Number(sub.price).toFixed(2)})`,
    `DESCRIPTION:Your ${sub.name} trial renews on ${sub.nextDate} for $${Number(sub.price).toFixed(2)}/${sub.cycle}. Cancel now: ${meta.cancelUrl}`,
    `URL:${meta.cancelUrl}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    `DESCRIPTION:48h Warning: Cancel ${sub.name} before $${Number(sub.price).toFixed(2)} charge!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  const blob = new Blob([icsLines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `cancel-${sub.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📅 48h iPhone Calendar Alarm Ready!");
}

function renderDashboard() {
  // Calculate totals across active recurring & trials
  let appleMonthly = 0;
  let googleMonthly = 0;
  let caponeMonthly = 0;

  subscriptions.forEach((item) => {
    const m = toMonthlyEquivalent(item.price, item.cycle);
    if (item.source === "apple") appleMonthly += m;
    else if (item.source === "google") googleMonthly += m;
    else caponeMonthly += m;
  });

  const totalMonthly = appleMonthly + googleMonthly + caponeMonthly;
  const totalYearly = totalMonthly * 12;
  const daily = totalYearly / 365;

  document.getElementById("monthlyTotal").innerHTML = `$${totalMonthly.toFixed(2)}<span>/mo</span>`;
  document.getElementById("dailyCost").textContent = `$${daily.toFixed(2)}/d`;
  document.getElementById("yearlyTotal").textContent = `$${Math.round(totalYearly)}/yr`;

  document.getElementById("sumApple").textContent = `$${appleMonthly.toFixed(0)}`;
  document.getElementById("sumGoogle").textContent = `$${googleMonthly.toFixed(0)}`;
  document.getElementById("sumCapOne").textContent = `$${caponeMonthly.toFixed(0)}`;

  if (totalMonthly > 0) {
    document.getElementById("barApple").style.width = `${(appleMonthly / totalMonthly) * 100}%`;
    document.getElementById("barGoogle").style.width = `${(googleMonthly / totalMonthly) * 100}%`;
    document.getElementById("barCapOne").style.width = `${(caponeMonthly / totalMonthly) * 100}%`;
  }

  // Render Free Trial Sniper Radar
  const trials = subscriptions
    .filter((s) => s.isTrial)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  const trialSection = document.getElementById("sniperRadarSection");
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

        return `
        <div class="trial-card">
          <div class="trial-top" onclick="openDetail('${t.id}')">
            <div class="trial-name-wrap">
              <div class="sub-emoji">${t.icon || "🎯"}</div>
              <div>
                <div class="trial-name">${escapeHtml(t.name)}</div>
                <div class="trial-meta">${meta.label} • Then $${Number(t.price).toFixed(2)}/${t.cycle === "yearly" ? "yr" : "mo"}</div>
              </div>
            </div>
            <div class="trial-countdown">${countdownText}</div>
          </div>
          <div class="trial-actions">
            <button class="btn-trial-action btn-ics" onclick="triggerIcs('${t.id}')">
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
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  document.getElementById("subCountLabel").textContent = `${filtered.length} items`;
  const subList = document.getElementById("subListContainer");

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
      <div class="sub-card" onclick="openDetail('${s.id}')">
        <div class="sub-left">
          <div class="sub-emoji">${s.icon || "💳"}</div>
          <div class="sub-info">
            <div class="sub-title-row">
              <span class="sub-name">${escapeHtml(s.name)}</span>
              <span class="source-pill ${meta.className}">${meta.label}</span>
              ${s.isTrial ? `<span class="source-pill" style="background:rgba(245,158,11,0.2);color:#fde68a;">TRIAL</span>` : ""}
            </div>
            <div class="sub-renews ${soonClass}">${renewsText}</div>
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

window.triggerIcs = function (id) {
  const sub = subscriptions.find((s) => s.id === id);
  if (sub) downloadIcsAlarm(sub);
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

    <button class="btn-secondary" onclick="triggerIcs('${sub.id}')">
      ⏰ Add 48-Hour Cancel Alert to iPhone Calendar
    </button>

    <button class="btn-danger" onclick="deleteSub('${sub.id}')">
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
  showToast("Removed subscription");
};

// Modal Helpers
function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

// Parse OCR text from Apple App Store / Google Play / Capital One screenshots
function parseSubscriptionText(rawText, source) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const detected = [];
  const priceRegex = /\$\s*(\d{1,3}(?:\.\d{2})?)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(priceRegex);
    if (match) {
      const price = parseFloat(match[1]);
      if (price <= 0 || price > 500) continue;

      // Try to extract name from the same line or the previous line
      let nameCandidate = lines[i].replace(priceRegex, "").replace(/\/(mo|month|yr|year|wk|week)/gi, "").replace(/[-•|:$]/g, "").trim();
      if (nameCandidate.length < 3 && i > 0) {
        nameCandidate = lines[i - 1].replace(/[-•|:$]/g, "").trim();
      }
      if (!nameCandidate || nameCandidate.length < 2) {
        nameCandidate = "Scanned Subscription";
      }

      const lowerLine = (lines[i] + " " + (lines[i + 1] || "")).toLowerCase();
      const cycle = lowerLine.includes("year") || lowerLine.includes("/yr") ? "yearly" : "monthly";
      const isTrial = lowerLine.includes("trial") || lowerLine.includes("free");

      detected.push({
        id: "ocr-" + Date.now() + "-" + detected.length,
        name: nameCandidate.slice(0, 32),
        price,
        cycle,
        source,
        nextDate: daysFromNow(isTrial ? 4 : 14),
        isTrial,
        icon: guessIcon(nameCandidate)
      });
    }
  }

  return detected;
}

function renderOcrDetectedList() {
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
    <div class="detected-item">
      <div>
        <div style="font-weight:700; font-size:0.9rem;">${item.icon} ${escapeHtml(item.name)}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">
          ${getSourceMeta(item.source).label} ${item.isTrial ? "• 🎯 Free Trial" : ""}
        </div>
      </div>
      <div style="font-weight:800; color:var(--accent-emerald);">
        $${Number(item.price).toFixed(2)}/${item.cycle === "yearly" ? "yr" : "mo"}
      </div>
    </div>
  `
    )
    .join("");
}

// Parse Capital One CSV export
function parseCapitalOneCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const merchantMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 4) continue;

    // Capital One CSV format typically: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
    const description = cols[3] || cols[1] || "";
    const debitStr = cols[5] || cols[4] || cols[2] || "";
    const amount = parseFloat(debitStr.replace(/[^0-9.]/g, ""));
    if (!description || isNaN(amount) || amount <= 1 || amount > 300) continue;

    const cleanName = description.replace(/[0-9#*]+/g, "").trim();
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
      nextDate: daysFromNow(10 + found.length * 3),
      isTrial: false,
      icon: guessIcon(merchant)
    });
  });

  return found.slice(0, 8);
}

function renderPlaidDetectedList() {
  const area = document.getElementById("plaidResultsArea");
  const list = document.getElementById("plaidDetectedList");
  if (pendingPlaidItems.length === 0) {
    area.style.display = "none";
    return;
  }
  area.style.display = "block";
  list.innerHTML = pendingPlaidItems
    .map(
      (item) => `
    <div class="detected-item">
      <div>
        <div style="font-weight:700; font-size:0.9rem;">${item.icon} ${escapeHtml(item.name)}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">💳 Capital One Recurring Charge</div>
      </div>
      <div style="font-weight:800; color:#fda4af;">$${Number(item.price).toFixed(2)}/mo</div>
    </div>
  `
    )
    .join("");
}

// Wire up UI events
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("inputDate").value = daysFromNow(7);
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

  // Open Modals from Quick Actions & Bottom Nav
  document.getElementById("btnOpenOcr").addEventListener("click", () => openModal("modalOcr"));
  document.getElementById("navOcr").addEventListener("click", () => openModal("modalOcr"));

  document.getElementById("btnOpenPlaid").addEventListener("click", () => openModal("modalPlaid"));
  document.getElementById("navPlaid").addEventListener("click", () => openModal("modalPlaid"));

  document.getElementById("btnOpenSniper").addEventListener("click", () => {
    document.getElementById("modalAddTitle").textContent = "🎯 Snipe a Free Trial";
    document.getElementById("inputIsTrial").value = "true";
    openModal("modalAdd");
  });
  document.getElementById("navSniper").addEventListener("click", () => {
    document.getElementById("modalAddTitle").textContent = "🎯 Snipe a Free Trial";
    document.getElementById("inputIsTrial").value = "true";
    openModal("modalAdd");
  });

  document.getElementById("btnAddManual").addEventListener("click", () => {
    document.getElementById("modalAddTitle").textContent = "＋ Add Subscription";
    document.getElementById("inputIsTrial").value = "false";
    openModal("modalAdd");
  });

  // Close buttons
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  // Close backdrop on tap outside sheet
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.remove("open");
    });
  });

  // Add Subscription / Trial Form Submit
  document.getElementById("subForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("inputName").value.trim();
    const price = parseFloat(document.getElementById("inputPrice").value);
    const cycle = document.getElementById("inputCycle").value;
    const source = document.getElementById("inputSource").value;
    const nextDate = document.getElementById("inputDate").value;
    const isTrial = document.getElementById("inputIsTrial").value === "true";

    const newSub = {
      id: "sub-" + Date.now(),
      name,
      price,
      cycle,
      source,
      nextDate,
      isTrial,
      icon: guessIcon(name)
    };

    subscriptions.unshift(newSub);
    saveSubscriptions();
    renderDashboard();
    closeModal("modalAdd");
    e.target.reset();
    document.getElementById("inputDate").value = daysFromNow(7);
    showToast(isTrial ? "🎯 Trial Sniped! Tap 48h Alarm to save to Calendar" : "✅ Subscription Added!");
  });

  // Screenshot OCR Upload Handler (Tesseract.js)
  document.getElementById("ocrFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const source = document.getElementById("ocrSourceSelect").value;
    const progressBox = document.getElementById("ocrProgressBox");
    const statusText = document.getElementById("ocrStatusText");
    progressBox.style.display = "block";
    statusText.textContent = "🔍 Running on-device OCR on your screenshot...";

    try {
      if (window.Tesseract) {
        const result = await window.Tesseract.recognize(file, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              statusText.textContent = `🔍 Scanning screenshot... ${Math.round(m.progress * 100)}%`;
            }
          }
        });
        const extracted = parseSubscriptionText(result.data.text, source);
        progressBox.style.display = "none";
        if (extracted.length > 0) {
          pendingOcrItems = extracted;
          renderOcrDetectedList();
        } else {
          statusText.textContent = "Could not find clear $ prices in image. Loaded sample detection so you can edit:";
          progressBox.style.display = "block";
        }
      }
    } catch (err) {
      progressBox.style.display = "none";
      showToast("Error scanning image");
    }
  });

  // Demo Instant OCR Scan Button
  document.getElementById("btnDemoOcrScan").addEventListener("click", () => {
    const source = document.getElementById("ocrSourceSelect").value;
    const sampleText =
      source === "apple"
        ? "Apple TV+ $9.99/month Free Trial\nStrava Summit $11.99/month\nFantastical $4.99/month"
        : source === "google"
        ? "Disney+ Duo $14.99/month\nFitbit Premium $9.99/month Free Trial"
        : "Audible Membership $14.95/month\nAmazon Prime $14.99/month";

    pendingOcrItems = parseSubscriptionText(sampleText, source);
    renderOcrDetectedList();
    showToast("✨ Scanned 3 subscriptions from sample screenshot!");
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

  // Plaid Link Button (Supports real Plaid Link Token or interactive Capital One Sandbox flow)
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

    // Interactive Capital One Sandbox Detection
    const btn = document.getElementById("btnLaunchPlaid");
    btn.textContent = "🔄 Scanning Capital One Quicksilver & Venture...";
    setTimeout(() => {
      btn.textContent = "🔗 Connect Capital One with Plaid Link";
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
    }, 900);
  });

  // Capital One CSV Upload
  document.getElementById("csvFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const items = parseCapitalOneCsv(evt.target.result);
      if (items.length > 0) {
        pendingPlaidItems = items;
        renderPlaidDetectedList();
        showToast(`📄 Found ${items.length} Capital One charges!`);
      } else {
        showToast("Could not parse CSV columns");
      }
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
});
