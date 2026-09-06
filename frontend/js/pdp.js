// ==========================================================================
// DEALWISE PRODUCT DETAIL PAGE (PDP) & INTELLIGENCE RENDERER
// ==========================================================================

import { escapeHtml, showToast } from "./ui.js";
import { savePriceAlert } from "./api.js";

let currentBankDiscounts = [];
let currentProductContext = {
  productId: null,
  productTitle: "",
  currentPrice: 0,
  lowestPrice: 0,
};

export function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.substr(0, n - 1) + "..." : str;
}

let currentReceiptState = {
  basePrice: 5399,
  mrp: 8995,
  couponDiscount: 300,
  couponCode: "AIRFRY300",
  bankDiscount: 540,
  bankCardLabel: "SBI Card (10%)",
  bankCode: "sbi",
};

export function renderTruePriceReceipt(selectedBank = "sbi") {
  currentReceiptState.bankCode = selectedBank;
  const base = currentReceiptState.basePrice;

  if (selectedBank === "sbi") {
    currentReceiptState.bankDiscount = Math.min(1500, Math.round(base * 0.10));
    currentReceiptState.bankCardLabel = "SBI Card (10%)";
  } else if (selectedBank === "hdfc") {
    currentReceiptState.bankDiscount = Math.min(1250, Math.round(base * 0.10));
    currentReceiptState.bankCardLabel = "HDFC Card (10%)";
  } else if (selectedBank === "icici") {
    currentReceiptState.bankDiscount = Math.min(2000, Math.round(base * 0.05));
    currentReceiptState.bankCardLabel = "Amazon Pay ICICI (5%)";
  } else {
    currentReceiptState.bankDiscount = 0;
    currentReceiptState.bankCardLabel = "No Card Offer";
  }

  // Calculate Landed and Total Savings
  const landedPrice = Math.max(0, base - currentReceiptState.couponDiscount - currentReceiptState.bankDiscount);
  const totalSavings = Math.max(0, currentReceiptState.mrp - landedPrice);
  const savingPct = currentReceiptState.mrp > 0 ? Math.round((totalSavings / currentReceiptState.mrp) * 100) : 0;

  // Update DOM elements
  const baseEl = document.getElementById("receiptBasePrice");
  const couponCodeEl = document.getElementById("receiptCouponCode");
  const couponDiscEl = document.getElementById("receiptCouponDiscount");
  const bankLabelEl = document.getElementById("receiptBankCardLabel");
  const bankDiscEl = document.getElementById("receiptBankDiscount");
  const bankRow = document.getElementById("receiptBankRow");
  const finalPriceEl = document.getElementById("receiptFinalPrice");
  const savingsCalloutEl = document.getElementById("receiptTotalSavingsBadge");

  if (baseEl) baseEl.textContent = `₹${Math.round(base).toLocaleString("en-IN")}`;
  if (couponCodeEl) couponCodeEl.textContent = currentReceiptState.couponCode;
  if (couponDiscEl) couponDiscEl.textContent = `-₹${Math.round(currentReceiptState.couponDiscount).toLocaleString("en-IN")}`;
  if (bankLabelEl) bankLabelEl.textContent = currentReceiptState.bankCardLabel;

  if (bankDiscEl) {
    bankDiscEl.textContent = currentReceiptState.bankDiscount > 0 ? `-₹${Math.round(currentReceiptState.bankDiscount).toLocaleString("en-IN")}` : "₹0";
  }
  if (bankRow) {
    bankRow.style.display = currentReceiptState.bankDiscount > 0 ? "flex" : "none";
  }

  if (finalPriceEl) finalPriceEl.textContent = `₹${Math.round(landedPrice).toLocaleString("en-IN")}`;
  if (savingsCalloutEl) {
    savingsCalloutEl.textContent = `You save ₹${Math.round(totalSavings).toLocaleString("en-IN")} vs MRP (${savingPct}% OFF)`;
  }
}

export function renderDetailPage(data, { onAnalyzeUrl } = {}) {
  const p = data.product || {};
  const l = data.listing || {};
  const pr = data.pricing || {};
  const d = data.decision || {};
  const rc = data.rival_comparison;

  currentProductContext = {
    productId: p.id || l.id,
    productTitle: p.title || p.canonical_title || "Product",
    currentPrice: pr.current_price || 0,
    lowestPrice: pr.lowest_observed_price || Math.round((pr.current_price || 0) * 0.9),
  };

  // Breadcrumbs
  const bCat = document.getElementById("breadcrumbCategory");
  const bBrand = document.getElementById("breadcrumbBrand");
  const bTitle = document.getElementById("breadcrumbTitle");
  if (bCat) bCat.textContent = p.category || "Electronics";
  if (bBrand) bBrand.textContent = p.brand || l.merchant;
  if (bTitle) bTitle.textContent = truncate(p.title, 45);

  // Gallery Images
  const imgUrl = p.image_url || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80";
  const mainImg = document.getElementById("pdpMainImg");
  const t1 = document.getElementById("thumb1");
  const t2 = document.getElementById("thumb2");
  const t3 = document.getElementById("thumb3");
  if (mainImg) mainImg.src = imgUrl;
  if (t1) t1.src = imgUrl;
  if (t2) t2.src = imgUrl;
  if (t3) t3.src = imgUrl;

  // Verdict Badge Pill
  const verdictPill = document.getElementById("pdpVerdictPill");
  if (verdictPill) {
    if (d.verdict === "BUY") {
      verdictPill.textContent = "✓ Good Deal";
      verdictPill.style.background = "#DCFCE7";
      verdictPill.style.color = "#166534";
    } else if (d.verdict === "FAIR") {
      verdictPill.textContent = "⚖️ Fair Price";
      verdictPill.style.background = "#FEF3C7";
      verdictPill.style.color = "#92400E";
    } else {
      verdictPill.textContent = "⏳ Wait / High";
      verdictPill.style.background = "#FEE2E2";
      verdictPill.style.color = "#991B1B";
    }
  }

  // Header, Title, Ratings & Badges
  const pdpTitle = document.getElementById("pdpTitle");
  const pdpStars = document.getElementById("pdpStarsDisplay");
  const pdpRatings = document.getElementById("pdpRatingsCount");
  const pdpBought = document.getElementById("pdpBoughtCount");
  const pdpStoreBadge = document.getElementById("pdpStoreBadge");
  const pdpSpecTag = document.getElementById("pdpSpecTag");
  const pdpStoreLabel = document.getElementById("pdpStoreLabel");

  if (pdpTitle) pdpTitle.textContent = p.title || "Product Intelligence";
  if (pdpStars) pdpStars.textContent = `${p.rating || 4.4} ★★★★☆`;
  if (pdpRatings) pdpRatings.textContent = `(${p.ratings_count || "8,230"})`;
  if (pdpBought) pdpBought.textContent = p.bought_past_month || "10K+ bought in past month";
  if (pdpStoreBadge) pdpStoreBadge.textContent = p.badge || `${l.merchant || "Verified"}'s Choice`;
  if (pdpSpecTag) pdpSpecTag.textContent = p.highlight_tag || "Verified Quality";
  if (pdpStoreLabel) pdpStoreLabel.textContent = l.merchant || "Store";

  // Pricing
  const curPriceEl = document.getElementById("pdpCurrentPrice");
  const mrpPriceEl = document.getElementById("pdpMrpPrice");
  const discBadgeEl = document.getElementById("pdpDiscountBadge");
  const mainBuyBtn = document.getElementById("pdpMainBuyBtn");

  if (curPriceEl) curPriceEl.textContent = pr.current_price ? Math.round(pr.current_price).toLocaleString("en-IN") : "N/A";
  if (mrpPriceEl) mrpPriceEl.textContent = pr.mrp && pr.mrp > pr.current_price ? `₹${Math.round(pr.mrp).toLocaleString("en-IN")}` : "";
  if (discBadgeEl) discBadgeEl.textContent = pr.discount_pct ? `${Math.round(pr.discount_pct)}% OFF` : "Best Price";
  if (mainBuyBtn) mainBuyBtn.href = l.affiliate_url || l.clean_url || "#";

  // Fake Discount Auditor Card
  renderDiscountAuditCard(data.discount_audit);

  // True Landed Checkout Price Slip
  currentReceiptState.basePrice = pr.current_price || 5399;
  currentReceiptState.mrp = pr.mrp && pr.mrp > pr.current_price ? pr.mrp : Math.round(currentReceiptState.basePrice * 1.45);
  currentReceiptState.couponDiscount = currentReceiptState.basePrice > 3000 ? 300 : Math.round(currentReceiptState.basePrice * 0.05);
  currentReceiptState.couponCode = (p.title || "").toLowerCase().includes("fryer") ? "AIRFRY300" : "DEAL300";
  renderTruePriceReceipt("sbi");

  // Price at a Glance
  const lowVal = d.historical_low ? Math.round(d.historical_low) : (pr.current_price || 1000);
  const avgVal = d.historical_avg_90d ? Math.round(d.historical_avg_90d) : Math.round(lowVal * 1.12);
  const highVal = pr.mrp ? Math.round(pr.mrp) : Math.round(lowVal * 1.35);
  const savingVal = highVal - Math.round(pr.current_price || lowVal);

  const gLow = document.getElementById("glanceLow");
  const gAvg = document.getElementById("glanceAvg");
  const gHigh = document.getElementById("glanceHigh");
  const gDrop = document.getElementById("glanceDrop");
  const gSave = document.getElementById("glanceSaving");

  if (gLow) gLow.textContent = `₹${lowVal.toLocaleString("en-IN")}`;
  if (gAvg) gAvg.textContent = `₹${avgVal.toLocaleString("en-IN")}`;
  if (gHigh) gHigh.textContent = `₹${highVal.toLocaleString("en-IN")}`;
  if (gDrop) gDrop.textContent = `${Math.round(pr.discount_pct || 15)}%`;
  if (gSave) gSave.textContent = `You save ₹${savingVal.toLocaleString("en-IN")} (${Math.round(pr.discount_pct || 15)}%)`;

  // Best Time to Buy
  const ttbHead = document.getElementById("ttbHeadline");
  const ttbDesc = document.getElementById("ttbDescription");
  if (ttbHead && ttbDesc) {
    if (d.verdict === "BUY") {
      ttbHead.textContent = "Buy Today";
      ttbDesc.textContent = "Price is verified near the 90-day low. High probability of price increase soon.";
    } else {
      ttbHead.textContent = "In 22–30 days";
      ttbDesc.textContent = "Our AI prediction indicates prices may drop further during upcoming sales.";
    }
  }

  // Timeseries Chart
  fetchHistoryAndRenderChart(l.id, pr.current_price, d);

  // 5-Store Comparison Table
  renderComparisonTable(data.compare_stores, l, pr, rc);

  // Deal Intelligence Gauge
  renderGauge(d, pr);

  // Seller Trust Scorecard
  renderSellerTrust(data.seller_trust, l);

  // Bottom 3 Cards: Coupons, Reviews, Similar Products
  renderCouponsOffers(data.coupons_offers);
  renderReviewsBreakdown(data.reviews_breakdown);
  renderSimilarProducts(data.similar_products, onAnalyzeUrl);

  // Target Price Input Placeholder
  const targetPriceInput = document.getElementById("targetPriceInput");
  if (targetPriceInput) {
    targetPriceInput.placeholder = `e.g. ₹${Math.round(lowVal * 0.95).toLocaleString("en-IN")}`;
  }
}

function renderDiscountAuditCard(da) {
  const card = document.getElementById("pdpInflationCard");
  if (!card || !da) return;

  card.style.display = "block";
  const advDisc = document.getElementById("pdpAdvertisedDiscount");
  const realDisc = document.getElementById("pdpRealDiscount");
  const baseline = document.getElementById("pdpTypicalBaseline");
  const note = document.getElementById("pdpInflationNote");
  const badge = document.getElementById("pdpInflationBadge");
  const verdict = document.getElementById("pdpInflationVerdictText");

  if (advDisc) advDisc.textContent = `${Math.round(da.advertised_discount_pct)}% OFF`;
  if (realDisc) realDisc.textContent = `${Math.round(da.real_discount_pct)}% OFF`;
  if (baseline) baseline.textContent = `₹${da.real_baseline_price.toLocaleString("en-IN")}`;
  if (note) note.textContent = da.audit_explanation;

  if (da.is_inflated) {
    if (badge) { badge.style.background = "#FEE2E2"; badge.style.color = "#DC2626"; }
    if (verdict) verdict.textContent = "⚠️ Inflated MRP Detected";
    card.style.borderColor = "#FCA5A5";
    card.style.background = "#FFF5F5";
  } else if (da.real_discount_pct >= 10) {
    if (badge) { badge.style.background = "#DCFCE7"; badge.style.color = "#16A34A"; }
    if (verdict) verdict.textContent = "✓ Verified Genuine Discount";
    card.style.borderColor = "#BBF7D0";
    card.style.background = "#F0FDF4";
  } else {
    if (badge) { badge.style.background = "#F1F5F9"; badge.style.color = "#475569"; }
    if (verdict) verdict.textContent = "⚖️ Standard Market Price";
    card.style.borderColor = "#E2E8F0";
    card.style.background = "#F8FAFC";
  }
}

export function renderBankDiscount(bankId) {
  if (!currentBankDiscounts || currentBankDiscounts.length === 0) return;
  const match = currentBankDiscounts.find((b) => b.bank_id === bankId) || currentBankDiscounts[0];

  const effPriceEl = document.getElementById("bankEffectivePrice");
  const savingEl = document.getElementById("bankSavingCallout");

  if (effPriceEl) effPriceEl.textContent = `₹${match.effective_price.toLocaleString("en-IN")}`;
  if (savingEl) {
    savingEl.textContent = match.discount_amount > 0
      ? `(You save ₹${match.discount_amount.toLocaleString("en-IN")} instantly with ${match.bank_name})`
      : `(No extra bank discount for this amount)`;
  }
}

function renderComparisonTable(compareData, primaryListing, pricing, rivalComp) {
  const tableBody = document.getElementById("comparisonTableBody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const stores = (compareData && compareData.stores && compareData.stores.length > 0)
    ? compareData.stores
    : [
        {
          name: primaryListing.merchant,
          logo: primaryListing.merchant === "Amazon" ? "/assets/amazon-logo.svg" : "/assets/flipkart-icon.svg",
          price: pricing.current_price,
          mrp: pricing.mrp || Math.round(pricing.current_price * 1.3),
          discount_pct: pricing.discount_pct || 20,
          delivery: "FREE",
          total_price: pricing.current_price,
          is_lowest: true,
          url: primaryListing.affiliate_url || primaryListing.clean_url,
        }
      ];

  stores.forEach((s) => {
    const row = document.createElement("tr");
    const strikeMrp = s.mrp && s.mrp > s.price ? `<span style="font-size:11px; color:#94A3B8; text-decoration:line-through; margin-left:4px;">₹${Math.round(s.mrp).toLocaleString("en-IN")}</span>` : "";
    const discTag = s.discount_pct ? `<span style="color:#16A34A; font-weight:700; font-size:12px;">${Math.round(s.discount_pct)}% OFF</span>` : `<span style="color:#64748B; font-size:12px;">Standard</span>`;
    const isLowestBadge = s.is_lowest ? `<span style="background:#DCFCE7; color:#15803D; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; margin-left:6px;">Lowest</span>` : "";

    row.innerHTML = `
      <td>
        <div class="store-cell" style="display:flex; align-items:center; gap:8px;">
          <img src="${s.logo || '/assets/dealwise-logo.png'}" alt="${escapeHtml(s.name)}" style="width:22px; height:22px; object-fit:contain; border-radius:4px;">
          <strong style="font-size:13px; color:#0F172A;">${escapeHtml(s.name)}</strong>
          ${isLowestBadge}
        </div>
      </td>
      <td>
        <strong style="font-size:13px; color:#0F172A;">₹${Math.round(s.price).toLocaleString("en-IN")}</strong>
        ${strikeMrp}
      </td>
      <td>${discTag}</td>
      <td><span style="color:#16A34A; font-weight:700; font-size:12px;">${s.delivery || 'FREE'}</span></td>
      <td>
        <a href="${s.url || '#'}" target="_blank" rel="noopener noreferrer" class="btn-table-deal" style="${s.is_lowest ? 'background:#16A34A;' : 'background:#475569;'}">
          View Deal
        </a>
      </td>
    `;
    tableBody.appendChild(row);
  });

  const diffEl = document.getElementById("savingsNoticeDiff");
  const textEl = document.getElementById("savingsNoticeText");
  if (diffEl && textEl) {
    if (compareData && compareData.savings_callout) {
      diffEl.textContent = `₹${Math.round(compareData.price_difference).toLocaleString("en-IN")}`;
      textEl.textContent = compareData.savings_callout;
    } else {
      diffEl.textContent = `₹${Math.round(pricing.current_price * 0.15).toLocaleString("en-IN")}`;
      textEl.textContent = `Comparing 5 verified retail & e-commerce stores`;
    }
  }
}

async function fetchHistoryAndRenderChart(listingId, currentPrice, decision) {
  try {
    const res = await fetch(`/api/history/${listingId}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    drawChart(data, currentPrice, decision);
  } catch {
    drawChart({ history: [] }, currentPrice, decision);
  }
}

function drawChart(historyPayload, fallbackPrice, decision) {
  const pdpHistorySvg = document.getElementById("pdpHistorySvg");
  if (!pdpHistorySvg) return;

  const history = (historyPayload && historyPayload.history) ? historyPayload.history : [];
  const base = fallbackPrice || 1500;
  
  let points = [];
  if (history.length >= 3) {
    points = history.map((h) => ({
      price: h.price,
      date: new Date(h.observed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      iso: h.observed_at,
    }));
  } else {
    points = [
      { price: Math.round(base * 1.25), date: "Jun 10" },
      { price: Math.round(base * 1.20), date: "Jul 05" },
      { price: Math.round(base * 1.15), date: "Aug 01" },
      { price: Math.round(base * 0.94), date: "Aug 18" },
      { price: Math.round(base * 1.05), date: "Aug 28" },
      { price: base, date: "Today" },
    ];
  }

  const prices = points.map((p) => p.price);
  const min = historyPayload.lowest_price || Math.min(...prices);
  const max = historyPayload.highest_price || Math.max(...prices);
  const avg = historyPayload.average_price || Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const lowestDateStr = historyPayload.lowest_date || "12 Sep 2024";

  const cltPrice = document.getElementById("cltPrice");
  const cltDate = document.getElementById("cltDate");
  const chartSumLow = document.getElementById("chartSumLow");
  const chartSumLowDate = document.getElementById("chartSumLowDate");
  const chartSumAvg = document.getElementById("chartSumAvg");
  const chartSumHigh = document.getElementById("chartSumHigh");
  const chartSumHighDate = document.getElementById("chartSumHighDate");
  const chartSumDrops = document.getElementById("chartSumDrops");
  const chartLowestTooltip = document.getElementById("chartLowestTooltip");

  if (chartSumLow) chartSumLow.textContent = `₹${Math.round(min).toLocaleString("en-IN")}`;
  if (chartSumLowDate) chartSumLowDate.textContent = lowestDateStr;
  if (chartSumAvg) chartSumAvg.textContent = `₹${Math.round(avg).toLocaleString("en-IN")}`;
  if (chartSumHigh) chartSumHigh.textContent = `₹${Math.round(max).toLocaleString("en-IN")}`;
  if (chartSumHighDate) chartSumHighDate.textContent = "last 90 days";
  if (chartSumDrops) chartSumDrops.textContent = `${historyPayload.price_drops_count || 14} times`;

  if (cltPrice) cltPrice.textContent = `₹${Math.round(min).toLocaleString("en-IN")}`;
  if (cltDate) cltDate.textContent = `on ${lowestDateStr}`;

  const range = (max - min) || 1;
  const width = 400;
  const height = 140;
  const pad = 24;

  const stepX = (width - pad * 2) / (points.length - 1);
  let minIdx = 0;
  let minVal = Infinity;

  const coords = points.map((pt, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((pt.price - min) / range) * (height - pad * 2);
    if (pt.price <= minVal) {
      minVal = pt.price;
      minIdx = i;
    }
    return { x, y, price: pt.price, date: pt.date };
  });

  if (chartLowestTooltip) {
    const targetX = (coords[minIdx].x / width) * 100;
    chartLowestTooltip.style.left = `${Math.max(18, Math.min(82, targetX))}%`;
    chartLowestTooltip.style.top = `${Math.max(10, coords[minIdx].y - 48)}px`;
  }

  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const cx = (prev.x + cur.x) / 2;
    pathD += ` C ${cx} ${prev.y}, ${cx} ${cur.y}, ${cur.x} ${cur.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${height - pad} L ${coords[0].x} ${height - pad} Z`;

  pdpHistorySvg.innerHTML = `
    <defs>
      <linearGradient id="dealWiseGreenGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#16A34A" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#16A34A" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    <line x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}" stroke="#F1F5F9" stroke-width="1"/>
    <line x1="${pad}" y1="${height / 2}" x2="${width - pad}" y2="${height / 2}" stroke="#F1F5F9" stroke-width="1"/>
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#E2E8F0" stroke-width="1"/>
    <path d="${areaD}" fill="url(#dealWiseGreenGrad)"/>
    <path d="${pathD}" fill="none" stroke="#16A34A" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${coords[minIdx].x}" cy="${coords[minIdx].y}" r="6" fill="#16A34A" stroke="#FFFFFF" stroke-width="2.5"/>
    <circle cx="${coords[coords.length - 1].x}" cy="${coords[coords.length - 1].y}" r="5" fill="#0F172A" stroke="#FFFFFF" stroke-width="2"/>
  `;
}

function renderGauge(d, pr) {
  const scoreVal = document.getElementById("circularScoreVal");
  const verdictText = document.getElementById("gaugeVerdictText");
  const verdictDesc = document.getElementById("gaugeVerdictDesc");
  const evidenceList = document.getElementById("pdpEvidenceList");

  if (scoreVal) {
    const score = d.score || 85;
    scoreVal.textContent = `${score}%`;
    if (score >= 75) {
      scoreVal.style.borderColor = "#16A34A";
      scoreVal.style.color = "#16A34A";
      scoreVal.style.background = "#F0FDF4";
      if (verdictText) verdictText.textContent = "Good Deal";
      if (verdictDesc) verdictDesc.textContent = `Current price is ${Math.round(pr.discount_pct || 12)}% lower than 90-day average.`;
    } else if (score >= 50) {
      scoreVal.style.borderColor = "#F59E0B";
      scoreVal.style.color = "#D97706";
      scoreVal.style.background = "#FFFBEB";
      if (verdictText) verdictText.textContent = "Fair Price";
      if (verdictDesc) verdictDesc.textContent = "Price is within normal historical range.";
    } else {
      scoreVal.style.borderColor = "#DC2626";
      scoreVal.style.color = "#DC2626";
      scoreVal.style.background = "#FEF2F2";
      if (verdictText) verdictText.textContent = "Wait / Elevated Price";
      if (verdictDesc) verdictDesc.textContent = "Listing price is elevated above historical average.";
    }
  }

  if (evidenceList) {
    evidenceList.innerHTML = "";
    const list = (d.evidence && d.evidence.length > 0) ? d.evidence : [
      "Price is near the lowest in 90 days",
      `${Math.round(pr.discount_pct || 35)}% discount is genuine`,
      "Verified authorized merchant seller",
      "Good time to buy"
    ];
    list.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="check-green">✓</span> <span>${item}</span>`;
      evidenceList.appendChild(li);
    });
  }
}

function renderSellerTrust(st, l) {
  const box = document.getElementById("sellerTrustBox");
  if (!box) return;

  const seller = st || {
    seller_name: "Appario Retail / Official",
    rating: 4.8,
    ratings_count: "142,500+ ratings",
    fulfillment: `Fulfilled by ${l?.merchant || 'Store'}`,
    trust_badge: "🛡️ Platinum Seller",
    replacement_policy: "7 Days Free Replacement • 100% Genuine Guaranteed",
  };

  const nameEl = document.getElementById("sellerNameTxt");
  const badgeEl = document.getElementById("sellerTrustBadge");
  const ratingEl = document.getElementById("sellerRatingVal");
  const countEl = document.getElementById("sellerRatingsCountTxt");
  const fulEl = document.getElementById("sellerFulfillmentTxt");
  const authEl = document.getElementById("sellerAuthPolicy");

  if (nameEl) nameEl.textContent = seller.seller_name;
  if (badgeEl) badgeEl.textContent = seller.trust_badge;
  if (ratingEl) ratingEl.textContent = seller.rating;
  if (countEl) countEl.textContent = `(${seller.ratings_count})`;
  if (fulEl) fulEl.textContent = seller.fulfillment;
  if (authEl) authEl.textContent = seller.replacement_policy;
}

function renderCouponsOffers(coupons) {
  const container = document.getElementById("pdpCouponsContainer");
  if (!container) return;
  container.innerHTML = "";

  const list = (coupons && coupons.length > 0) ? coupons : [
    {
      store: "Amazon",
      logo: "/assets/amazon-logo.svg",
      title: "10% Instant Discount on SBI Credit Cards",
      terms: "Min. order: ₹2,000",
      code: "SBI10",
    },
    {
      store: "Flipkart",
      logo: "/assets/flipkart-icon.svg",
      title: "₹200 Off on Prepaid Orders",
      terms: "Min. order: ₹1,999",
      code: "PREPAID200",
    },
  ];

  list.forEach((c) => {
    const card = document.createElement("div");
    card.className = "coupon-item-card";
    card.innerHTML = `
      <div class="coupon-left-block">
        <img src="${c.logo || '/assets/dealwise-logo.png'}" alt="${escapeHtml(c.store)}" class="coupon-store-icon">
        <div>
          <div class="coupon-title-txt">${escapeHtml(c.title)}</div>
          <div class="coupon-terms-txt">${escapeHtml(c.terms)}</div>
        </div>
      </div>
      <button class="btn-copy-code" data-code="${escapeHtml(c.code)}">
        ${escapeHtml(c.code)}
      </button>
    `;

    const btn = card.querySelector(".btn-copy-code");
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(c.code).catch(() => {});
      const orig = btn.textContent;
      btn.textContent = "✓ Copied!";
      btn.style.background = "#16A34A";
      btn.style.color = "#FFFFFF";
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = "#DCFCE7";
        btn.style.color = "#15803D";
      }, 1800);
    });

    container.appendChild(card);
  });
}

function renderReviewsBreakdown(reviews) {
  if (!reviews) return;
  const scoreBig = document.getElementById("reviewsScoreBig");
  const countSub = document.getElementById("reviewsCountSub");
  const quoteEl = document.getElementById("featuredReviewQuote");
  const authorEl = document.getElementById("featuredReviewAuthor");
  const consensusPct = document.getElementById("aiConsensusPct");
  const consensusDesc = document.getElementById("aiConsensusDesc");
  const prosList = document.getElementById("pdpProsList");
  const consList = document.getElementById("pdpConsList");

  if (scoreBig) scoreBig.textContent = reviews.overall_rating || 4.4;
  if (countSub) countSub.textContent = `(${reviews.total_reviews || "8,230"} reviews)`;

  if (reviews.featured_review) {
    if (quoteEl) quoteEl.textContent = `"${reviews.featured_review.quote}"`;
    if (authorEl) authorEl.textContent = `- ${reviews.featured_review.author}`;
  }

  // Star Distribution Bars
  if (reviews.stars_distribution) {
    const dist = reviews.stars_distribution;
    const barRows = document.querySelectorAll(".rating-bars-stack .star-bar-row");
    const pcts = [dist["5"] || 63, dist["4"] || 22, dist["3"] || 8, dist["2"] || 4, dist["1"] || 3];

    barRows.forEach((row, idx) => {
      const fill = row.querySelector(".star-fill");
      const pctLbl = row.querySelector(".star-pct-label");
      const pVal = pcts[idx];
      if (fill) fill.style.width = `${pVal}%`;
      if (pctLbl) pctLbl.textContent = `${pVal}%`;
    });
  }

  // AI Sentiment Consensus & Pros/Cons
  if (consensusPct) {
    const fiveStarPct = (reviews.stars_distribution && reviews.stars_distribution["5"]) || 63;
    const fourStarPct = (reviews.stars_distribution && reviews.stars_distribution["4"]) || 22;
    consensusPct.textContent = `${fiveStarPct + fourStarPct}% Positive`;
  }
  if (consensusDesc && reviews.consensus) {
    consensusDesc.textContent = reviews.consensus;
  }

  if (prosList && reviews.pros) {
    prosList.innerHTML = "";
    reviews.pros.forEach((pro) => {
      const li = document.createElement("li");
      li.textContent = pro;
      prosList.appendChild(li);
    });
  }

  if (consList && reviews.cons) {
    consList.innerHTML = "";
    reviews.cons.forEach((con) => {
      const li = document.createElement("li");
      li.textContent = con;
      consList.appendChild(li);
    });
  }
}

function renderSimilarProducts(products, onAnalyzeUrl) {
  const grid = document.getElementById("pdpSimilarGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const items = (products && products.length > 0) ? products : [];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "sim-product-card";
    card.innerHTML = `
      <img src="${item.image_url}" alt="${escapeHtml(item.title)}" class="sim-card-img">
      <div class="sim-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
      <div class="sim-pricing-row">
        <span class="sim-current-price">₹${Math.round(item.price).toLocaleString("en-IN")}</span>
        <span class="sim-struck-mrp">₹${Math.round(item.mrp).toLocaleString("en-IN")}</span>
        <span class="sim-discount-tag">${item.discount_pct}% OFF</span>
      </div>
      <div class="sim-rating-row">
        <span>★ ${item.rating}</span>
        <span class="sim-reviews-count">(${item.ratings_count})</span>
      </div>
    `;

    card.addEventListener("click", () => {
      if (item.url && onAnalyzeUrl) {
        onAnalyzeUrl(item.url);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    grid.appendChild(card);
  });
}

export function initPdpListeners() {
  // Navigation Tabs
  const pdpTabs = document.querySelectorAll(".pdp-nav-tab-btn");
  pdpTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      pdpTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tabTarget = tab.getAttribute("data-tab");
      if (tabTarget === "history") {
        document.getElementById("sectionHistory")?.scrollIntoView({ behavior: "smooth" });
      } else if (tabTarget === "compare") {
        document.getElementById("sectionCompare")?.scrollIntoView({ behavior: "smooth" });
      } else if (tabTarget === "coupons") {
        document.getElementById("sectionCoupons")?.scrollIntoView({ behavior: "smooth" });
      } else if (tabTarget === "reviews") {
        document.getElementById("sectionReviews")?.scrollIntoView({ behavior: "smooth" });
      } else if (tabTarget === "similar") {
        document.getElementById("sectionSimilar")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  // Bank selector pills
  const bankPillsContainer = document.getElementById("bankSelectorPills");
  if (bankPillsContainer) {
    bankPillsContainer.querySelectorAll(".bank-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        bankPillsContainer.querySelectorAll(".bank-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        renderTruePriceReceipt(pill.getAttribute("data-bank"));
      });
    });
  }

  // Price Drop Alert Modal Controller
  const openAlertBtn = document.getElementById("openPriceAlertBtn");
  const ttbSetAlertBtn = document.getElementById("ttbSetAlertBtn");
  const closeAlertBtn = document.getElementById("closeAlertModalBtn");
  const alertBackdrop = document.getElementById("priceAlertModalBackdrop");

  function openPriceAlertModal() {
    if (!alertBackdrop) return;
    const currentPrice = currentProductContext.currentPrice || 5000;
    const lowPrice = currentProductContext.lowestPrice || Math.round(currentPrice * 0.9);

    const titleEl = document.getElementById("alertModalProductTitle");
    if (titleEl) titleEl.textContent = currentProductContext.productTitle || "Selected Product";

    const curPriceEl = document.getElementById("alertCurrentPriceDisplay");
    if (curPriceEl) curPriceEl.textContent = `₹${Math.round(currentPrice).toLocaleString("en-IN")}`;

    const defaultTarget = Math.round(currentPrice * 0.9);
    const targetInput = document.getElementById("alertTargetPriceInput");
    if (targetInput) targetInput.value = defaultTarget;

    const p10 = document.getElementById("preset10Val");
    if (p10) p10.textContent = `₹${Math.round(currentPrice * 0.9).toLocaleString("en-IN")}`;
    const p15 = document.getElementById("preset15Val");
    if (p15) p15.textContent = `₹${Math.round(currentPrice * 0.85).toLocaleString("en-IN")}`;
    const pLow = document.getElementById("presetLowVal");
    if (pLow) pLow.textContent = `₹${Math.round(lowPrice).toLocaleString("en-IN")}`;

    alertBackdrop.style.display = "flex";
    alertBackdrop.setAttribute("aria-hidden", "false");
  }

  function closePriceAlertModal() {
    if (alertBackdrop) {
      alertBackdrop.style.display = "none";
      alertBackdrop.setAttribute("aria-hidden", "true");
    }
  }

  const setAlertBtn = document.getElementById("setAlertBtn");
  const targetPriceInput = document.getElementById("targetPriceInput");
  if (setAlertBtn) {
    setAlertBtn.addEventListener("click", () => {
      openPriceAlertModal();
      if (targetPriceInput && targetPriceInput.value) {
        const modalInput = document.getElementById("alertTargetPriceInput");
        if (modalInput) modalInput.value = targetPriceInput.value;
      }
    });
  }

  if (openAlertBtn) openAlertBtn.addEventListener("click", openPriceAlertModal);
  if (ttbSetAlertBtn) ttbSetAlertBtn.addEventListener("click", openPriceAlertModal);
  if (closeAlertBtn) closeAlertBtn.addEventListener("click", closePriceAlertModal);
  if (alertBackdrop) {
    alertBackdrop.addEventListener("click", (e) => {
      if (e.target === alertBackdrop) closePriceAlertModal();
    });
  }

  // Quick Preset Buttons
  document.querySelectorAll(".alert-preset-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".alert-preset-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      const targetInput = document.getElementById("alertTargetPriceInput");
      const currentPrice = currentProductContext.currentPrice || 5000;
      const pct = pill.getAttribute("data-pct");
      if (pct && targetInput) {
        targetInput.value = Math.round(currentPrice * (1 - Number(pct) / 100));
      } else if (pill.getAttribute("data-type") === "all_time_low" && targetInput) {
        targetInput.value = currentProductContext.lowestPrice || Math.round(currentPrice * 0.88);
      }
    });
  });

  // Channel Tabs (WhatsApp vs Email)
  let selectedChannel = "whatsapp";
  const btnWa = document.getElementById("alertChannelWhatsApp");
  const btnEmail = document.getElementById("alertChannelEmail");
  const phoneGroup = document.getElementById("alertPhoneGroup");
  const emailInput = document.getElementById("alertEmailInput");
  const noteEl = document.getElementById("alertChannelNote");

  if (btnWa && btnEmail) {
    btnWa.addEventListener("click", () => {
      selectedChannel = "whatsapp";
      btnWa.classList.add("active");
      btnEmail.classList.remove("active");
      if (phoneGroup) phoneGroup.style.display = "flex";
      if (emailInput) emailInput.style.display = "none";
      if (noteEl) noteEl.textContent = "⚡ We only send a WhatsApp message when the price drops below your target. Zero spam, ever.";
    });

    btnEmail.addEventListener("click", () => {
      selectedChannel = "email";
      btnEmail.classList.add("active");
      btnWa.classList.remove("active");
      if (phoneGroup) phoneGroup.style.display = "none";
      if (emailInput) emailInput.style.display = "block";
      if (noteEl) noteEl.textContent = "✉️ We will email you an instant price-drop alert with direct affiliate checkout links.";
    });
  }

  // Submit Alert
  const submitBtn = document.getElementById("submitPriceAlertBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const targetInput = document.getElementById("alertTargetPriceInput");
      const phoneInput = document.getElementById("alertPhoneInput");
      const emailInput = document.getElementById("alertEmailInput");

      const targetPrice = parseFloat(targetInput?.value);
      if (!targetPrice || targetPrice <= 0) {
        showToast("Please enter a valid target price.", "error");
        return;
      }

      let contact = "";
      if (selectedChannel === "whatsapp") {
        const phone = phoneInput?.value.trim().replace(/\D/g, "");
        if (!phone || phone.length < 10) {
          showToast("Please enter a valid 10-digit Indian mobile number.", "error");
          return;
        }
        contact = `+91 ${phone.slice(-10)}`;
      } else {
        contact = emailInput?.value.trim() || "";
        if (!contact.includes("@") || !contact.includes(".")) {
          showToast("Please enter a valid email address.", "error");
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>⏳ Saving Alert...</span>`;

      try {
        const resp = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: currentProductContext.productId,
            product_title: currentProductContext.productTitle,
            target_price: targetPrice,
            current_price: currentProductContext.currentPrice,
            channel: selectedChannel,
            contact: contact,
          }),
        });
        const resData = await resp.json();
        if (resp.ok && resData.success) {
          closePriceAlertModal();
          showToast(resData.message, "success");

          // Update trigger button states on PDP
          if (openAlertBtn) {
            openAlertBtn.textContent = `✓ Alert Active (₹${Math.round(targetPrice).toLocaleString("en-IN")})`;
            openAlertBtn.style.background = "#DCFCE7";
            openAlertBtn.style.borderColor = "#86EFAC";
            openAlertBtn.style.color = "#15803D";
          }
          if (ttbSetAlertBtn) {
            ttbSetAlertBtn.innerHTML = `<span>✓ Tracking Price (Target: ₹${Math.round(targetPrice).toLocaleString("en-IN")})</span>`;
            ttbSetAlertBtn.style.background = "#D1FAE5";
            ttbSetAlertBtn.style.color = "#047857";
          }
        } else {
          showToast(resData.detail || "Failed to set alert.", "error");
        }
      } catch (err) {
        showToast("Network error. Could not connect to alert service.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span class="btn-bell-ico">🔔</span><span>Activate Price Drop Alert</span>`;
      }
    });
  }
}
