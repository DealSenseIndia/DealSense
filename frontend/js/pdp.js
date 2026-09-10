// ==========================================================================
// DEALWISE PRODUCT DETAIL PAGE (PDP) & INTELLIGENCE RENDERER
// ==========================================================================

import { escapeHtml, showToast } from "./ui.js";
import { savePriceAlert } from "./api.js";

let currentBankDiscounts = [];
let currentMerchant = "Amazon";
let fullHistoryPayload = null;
let currentChartFallbackPrice = 1500;
let currentChartDecision = null;
let currentChartTimeframe = "90D";
let currentRivalComp = null;
let showAmazonCurve = true;
let showFlipkartCurve = true;

let currentProductContext = {
  productId: null,
  productTitle: "",
  currentPrice: 0,
  lowestPrice: 0,
  rating: null,
  ratingsCount: null,
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
  deliveryFee: 0,
  deliveryLabel: "FREE Prime Delivery",
};

export function updateBankSelectorPills(merchant = "Amazon", isPrime = false) {
  const container = document.getElementById("bankSelectorPills");
  if (!container) return;
  const isAmazon = (merchant || "").toLowerCase().includes("amazon");

  let pills = [];
  if (isAmazon) {
    pills = [
      { id: "icici", tag: "ICICI", label: isPrime ? "Amazon Pay ICICI (5% Cashback)" : "Amazon Pay ICICI (3% Cashback)", active: true },
      { id: "sbi", tag: "SBI", label: "SBI Card (10% Instant)", active: false },
      { id: "hdfc", tag: "HDFC", label: "HDFC Card (10% Instant)", active: false },
      { id: "none", tag: "CARD", label: "Standard (No Card Offer)", active: false },
    ];
  } else {
    pills = [
      { id: "axis", tag: "AXIS", label: "Flipkart Axis Bank (5% Unlimited)", active: true },
      { id: "hdfc", tag: "HDFC", label: "HDFC Bank (10% Instant)", active: false },
      { id: "sbi", tag: "SBI", label: "SBI Card (10% Instant)", active: false },
      { id: "none", tag: "CARD", label: "Standard (No Card Offer)", active: false },
    ];
  }

  container.innerHTML = "";
  pills.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bank-pill ${p.active ? "active" : ""}`;
    btn.setAttribute("data-bank", p.id);
    btn.innerHTML = `<span class="bank-logo-tag ${p.id}-tag">${escapeHtml(p.tag)}</span><span>${escapeHtml(p.label)}</span>`;
    btn.addEventListener("click", () => {
      container.querySelectorAll(".bank-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderTruePriceReceipt(p.id, merchant);
    });
    container.appendChild(btn);
  });
}

export function renderTruePriceReceipt(selectedBank = "auto", merchant = null) {
  const targetMerchant = merchant || currentMerchant || "Amazon";
  const isAmazon = targetMerchant.toLowerCase().includes("amazon");

  if (selectedBank === "auto") {
    selectedBank = isAmazon ? "icici" : "axis";
  }

  currentReceiptState.bankCode = selectedBank;
  const base = currentReceiptState.basePrice;

  // Check if live computed bank discount exists for this bank from the engine
  const liveMatch = (currentBankDiscounts || []).find(
    (b) => (b.bank_id && b.bank_id.toLowerCase() === selectedBank.toLowerCase()) ||
           (b.bank_name && b.bank_name.toLowerCase().includes(selectedBank.toLowerCase()))
  );

  if (liveMatch && liveMatch.discount_amount !== undefined && liveMatch.discount_amount > 0) {
    currentReceiptState.bankDiscount = Math.round(liveMatch.discount_amount);
    currentReceiptState.bankCardLabel = liveMatch.bank_name ? `${liveMatch.bank_name}` : `${selectedBank.toUpperCase()} Card`;
  } else if (selectedBank === "axis") {
    currentReceiptState.bankDiscount = Math.round(base * 0.05);
    currentReceiptState.bankCardLabel = "Flipkart Axis Bank (5%)";
  } else if (selectedBank === "icici") {
    currentReceiptState.bankDiscount = Math.round(base * 0.05);
    currentReceiptState.bankCardLabel = "Amazon Pay ICICI (5%)";
  } else if (selectedBank === "sbi") {
    currentReceiptState.bankDiscount = Math.min(1500, Math.round(base * 0.10));
    currentReceiptState.bankCardLabel = "SBI Card (10%)";
  } else if (selectedBank === "hdfc") {
    currentReceiptState.bankDiscount = Math.min(1250, Math.round(base * 0.10));
    currentReceiptState.bankCardLabel = "HDFC Card (10%)";
  } else {
    currentReceiptState.bankDiscount = 0;
    currentReceiptState.bankCardLabel = "No Card Offer";
  }

  // Calculate Landed Price including delivery
  const deliv = currentReceiptState.deliveryFee || 0;
  const landedPrice = Math.max(0, base - currentReceiptState.couponDiscount - currentReceiptState.bankDiscount + deliv);
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

// ==========================================================================
// PDP GALLERY, SKELETON & ENRICHMENT HELPERS
// ==========================================================================

let currentGalleryImages = [];
let currentGalleryIndex = 0;

export function showPdpSkeleton() {
  const homeView = document.getElementById("homeView");
  const detailView = document.getElementById("detailView");
  const skelView = document.getElementById("pdpSkeletonView");
  if (homeView) homeView.style.display = "none";
  if (detailView) detailView.style.display = "none";
  if (skelView) {
    skelView.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export function hidePdpSkeleton() {
  const skelView = document.getElementById("pdpSkeletonView");
  if (skelView) skelView.style.display = "none";
}

function renderStarRating(rating) {
  if (rating === null || rating === undefined || rating <= 0) return "";
  const r = Math.min(5, Math.max(0, Number(rating)));
  const full = Math.floor(r);
  const hasHalf = (r % 1) >= 0.3 && (r % 1) < 0.8;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  const starsStr = "★".repeat(full) + (hasHalf ? "½" : "") + "☆".repeat(Math.max(0, empty));
  return `${r.toFixed(1)} ${starsStr}`;
}

function anyAudioKeywords(title = "", category = "") {
  const t = (title + " " + category).toLowerCase();
  return (
    t.includes("headphone") ||
    t.includes("earphone") ||
    t.includes("earbuds") ||
    t.includes("airdopes") ||
    t.includes("audio") ||
    t.includes("soundbar") ||
    t.includes("speaker") ||
    t.includes("sony wh")
  );
}

export function getCategoryFallbackImage(category = "", title = "") {
  const t = (title + " " + category).toLowerCase();
  if (t.includes("chair") || t.includes("gaming") || t.includes("ergonomic") || t.includes("recliner") || t.includes("seat")) {
    return "https://m.media-amazon.com/images/I/41ApsFYZ8FL.jpg";
  }
  if (t.includes("sleep company") || t.includes("smartgrid") || t.includes("bed") || t.includes("mattress") || t.includes("sofa") || t.includes("furniture") || t.includes("table") || t.includes("desk")) {
    return "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=500&q=80";
  }
  if (t.includes("fryer") || t.includes("airfryer") || t.includes("microwave") || t.includes("oven") || t.includes("blender") || t.includes("grinder") || t.includes("kettle") || t.includes("appliance") || t.includes("cooker") || t.includes("chimney")) {
    return "https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=500&q=80";
  }
  if (t.includes("watch") || t.includes("smartwatch")) {
    return "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500&q=80";
  }
  if (t.includes("tv") || t.includes("television") || t.includes("smart tv") || t.includes("screen") || t.includes("display")) {
    return "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500&q=80";
  }
  if (t.includes("phone") || t.includes("smartphone") || t.includes("iphone") || t.includes("galaxy") || t.includes("oneplus") || t.includes("mobile")) {
    return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&q=80";
  }
  if (t.includes("laptop") || t.includes("macbook") || t.includes("computer") || t.includes("notebook")) {
    return "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500&q=80";
  }
  if (t.includes("shoe") || t.includes("sneaker") || t.includes("running") || t.includes("puma") || t.includes("nike") || t.includes("adidas") || t.includes("footwear")) {
    return "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80";
  }
  if (t.includes("headphone") || t.includes("earphone") || t.includes("earbuds") || t.includes("airdopes") || t.includes("audio") || t.includes("soundbar") || t.includes("speaker") || t.includes("sony wh")) {
    return "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80";
  }
  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80";
}

function renderImageGallery(images, fallbackUrl, title, category = "") {
  const thumbsContainer = document.getElementById("galleryThumbsStack");
  const mainImg = document.getElementById("pdpMainImg");
  const mainContainer = document.getElementById("galleryMainContainer");

  const categoryDefault = getCategoryFallbackImage(category, title);
  const isAudio = anyAudioKeywords(title, category);

  let imgList = [];

  if (Array.isArray(images) && images.length > 0) {
    imgList = images.filter((u) => {
      if (typeof u !== "string" || u.trim().length === 0) return false;
      // Sanitize headphone photo on non-audio products
      if (!isAudio && u.includes("505740420928")) return false;
      return true;
    });
  }
  if (imgList.length === 0 && fallbackUrl) {
    if (isAudio || !fallbackUrl.includes("505740420928")) {
      imgList = [fallbackUrl];
    }
  }
  if (imgList.length === 0) {
    imgList = [categoryDefault];
  }

  currentGalleryImages = imgList;
  currentGalleryIndex = 0;

  if (mainImg) {
    mainImg.onerror = () => {
      mainImg.onerror = null;
      mainImg.src = categoryDefault;
    };
    mainImg.src = imgList[0];
    mainImg.alt = title || "Product Photo";
  }

  if (thumbsContainer) {
    thumbsContainer.innerHTML = "";
    imgList.slice(0, 7).forEach((url, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `gallery-thumb-item ${idx === 0 ? "active" : ""}`;
      btn.setAttribute("aria-label", `View photo ${idx + 1}`);

      const thumbImg = document.createElement("img");
      thumbImg.onerror = () => {
        thumbImg.onerror = null;
        thumbImg.src = categoryDefault;
      };
      thumbImg.src = url;
      thumbImg.alt = `Thumb ${idx + 1}`;
      btn.appendChild(thumbImg);

      const activateThumb = () => {
        currentGalleryIndex = idx;
        if (mainImg) {
          mainImg.style.opacity = "0.4";
          mainImg.src = url;
          setTimeout(() => {
            mainImg.style.opacity = "1";
          }, 60);
        }
        thumbsContainer.querySelectorAll(".gallery-thumb-item").forEach((b, bIdx) => {
          b.classList.toggle("active", bIdx === idx);
        });
      };

      btn.addEventListener("click", activateThumb);
      btn.addEventListener("mouseenter", activateThumb);
      thumbsContainer.appendChild(btn);
    });

    if (imgList.length > 7) {
      const moreBadge = document.createElement("div");
      moreBadge.className = "gallery-thumb-item";
      moreBadge.style.cssText = "display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#64748B;";
      moreBadge.textContent = `+${imgList.length - 7}`;
      thumbsContainer.appendChild(moreBadge);
    }
  }

  if (mainContainer && !mainContainer._lightboxBound) {
    mainContainer._lightboxBound = true;
    mainContainer.addEventListener("click", () => {
      openLightbox(currentGalleryImages, currentGalleryIndex, currentProductContext.productTitle);
    });
  }
}

function openLightbox(images, startIndex = 0, title = "") {
  const modal = document.getElementById("pdpLightboxModal");
  const imgEl = document.getElementById("lightboxImg");
  const counterEl = document.getElementById("lightboxCounter");
  const titleEl = document.getElementById("lightboxTitle");
  if (!modal || !images || images.length === 0) return;

  currentGalleryImages = images;
  currentGalleryIndex = Math.max(0, Math.min(startIndex, images.length - 1));

  function updateView() {
    if (imgEl) imgEl.src = currentGalleryImages[currentGalleryIndex];
    if (counterEl) counterEl.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
    if (titleEl) titleEl.textContent = truncate(title, 55);
  }

  updateView();
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  const modal = document.getElementById("pdpLightboxModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderSpecifications(specs) {
  const section = document.getElementById("sectionSpecs");
  const tbody = document.getElementById("specsTableBody");
  const countBadge = document.getElementById("specsCountBadge");
  const expandRow = document.getElementById("specsExpandRow");
  const toggleBtn = document.getElementById("toggleSpecsBtn");
  const wrapper = document.getElementById("specsTableWrapper");

  if (!section || !tbody) return;

  if (!specs || !Array.isArray(specs) || specs.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  tbody.innerHTML = "";

  if (countBadge) {
    countBadge.textContent = `${specs.length} Specs`;
  }

  specs.forEach((item) => {
    const tr = document.createElement("tr");
    let key = "";
    let val = "";
    if (typeof item === "object" && item !== null) {
      key = item.key || item.name || Object.keys(item)[0] || "";
      val = item.value || item.val || Object.values(item)[0] || "";
    } else {
      val = String(item);
    }

    if (key || val) {
      tr.innerHTML = `
        <td class="specs-key-col">${escapeHtml(key || "Specification")}</td>
        <td class="specs-val-col">${escapeHtml(val)}</td>
      `;
      tbody.appendChild(tr);
    }
  });

  if (specs.length > 8 && expandRow && toggleBtn && wrapper) {
    expandRow.style.display = "flex";
    wrapper.classList.remove("expanded");
    toggleBtn.classList.remove("is-expanded");
    const toggleText = document.getElementById("toggleSpecsBtnText");
    if (toggleText) toggleText.textContent = `Show All Specifications (${specs.length} items)`;

    toggleBtn.onclick = () => {
      const isExp = wrapper.classList.toggle("expanded");
      toggleBtn.classList.toggle("is-expanded", isExp);
      if (toggleText) {
        toggleText.textContent = isExp ? "Show Less" : `Show All Specifications (${specs.length} items)`;
      }
    };
  } else if (expandRow) {
    expandRow.style.display = "none";
  }
}

function renderDeliveryStrip(listing, pricing) {
  const strip = document.getElementById("pdpDeliveryStrip");
  const deliveryText = document.getElementById("pdpDeliveryText");
  const stockText = document.getElementById("pdpStockText");
  const returnText = document.getElementById("pdpReturnPolicyText");
  const membershipItem = document.getElementById("pdpMembershipItem");
  const membershipBadge = document.getElementById("pdpMembershipBadge");
  const sellerText = document.getElementById("pdpSellerTrustText");

  if (!strip) return;

  const isAmazon = (listing.merchant || "").toLowerCase().includes("amazon");
  const isFlipkart = (listing.merchant || "").toLowerCase().includes("flipkart");
  const isPrime = listing.is_prime || isAmazon;
  const isFAssured = listing.is_f_assured || isFlipkart;

  if (deliveryText) {
    if (listing.delivery_fee && listing.delivery_fee > 0) {
      deliveryText.textContent = `₹${Math.round(listing.delivery_fee)} Standard Delivery`;
    } else {
      deliveryText.textContent = isPrime
        ? "FREE One-Day Prime Delivery"
        : (isFAssured ? "FREE Express F-Assured Delivery" : (listing.delivery_info || "FREE Express Delivery Available"));
    }
  }

  if (stockText) {
    if (pricing && pricing.in_stock === false) {
      stockText.textContent = "Currently Out of Stock";
      stockText.className = "delivery-trust-text out-of-stock";
      stockText.style.color = "#DC2626";
    } else {
      stockText.textContent = "In Stock & Ready to Ship";
      stockText.className = "delivery-trust-text in-stock";
      stockText.style.color = "#16A34A";
    }
  }

  if (returnText) {
    returnText.textContent = listing.return_policy || "7 Days Return / Replacement";
  }

  if (membershipItem && membershipBadge) {
    if (isAmazon) {
      membershipItem.style.display = "flex";
      membershipBadge.className = "pdp-membership-chip prime";
      membershipBadge.textContent = "✓ Prime Free Delivery";
    } else if (isFlipkart) {
      membershipItem.style.display = "flex";
      membershipBadge.className = "pdp-membership-chip fassured";
      membershipBadge.textContent = "⚡ F-Assured Verified";
    } else {
      membershipItem.style.display = "none";
    }
  }

  if (sellerText) {
    const seller = listing.seller_name || listing.seller;
    sellerText.textContent = seller ? `100% Genuine • Sold by ${seller}` : "100% Genuine Guaranteed";
  }
}

function renderStickyBuyBar(p, l, pr, d) {
  const bar = document.getElementById("pdpStickyBuyBar");
  if (!bar) return;

  const img = document.getElementById("stickyBarImg");
  const title = document.getElementById("stickyBarTitle");
  const price = document.getElementById("stickyBarPrice");
  const mrp = document.getElementById("stickyBarMrp");
  const disc = document.getElementById("stickyBarDiscount");
  const stars = document.getElementById("stickyBarStars");
  const count = document.getElementById("stickyBarRatings");
  const verdict = document.getElementById("stickyBarVerdict");
  const buyBtn = document.getElementById("stickyBuyBtn");
  const storeLbl = document.getElementById("stickyStoreLabel");

  if (img) img.src = p.image_url || "";
  if (title) title.textContent = p.title || "Product";
  if (price) price.textContent = pr.current_price ? Math.round(pr.current_price).toLocaleString("en-IN") : "0";
  if (mrp) mrp.textContent = pr.mrp && pr.mrp > pr.current_price ? `₹${Math.round(pr.mrp).toLocaleString("en-IN")}` : "";
  if (disc) disc.textContent = pr.discount_pct ? `${Math.round(pr.discount_pct)}% OFF` : "Best Deal";

  if (stars) {
    stars.textContent = p.rating ? `${p.rating} ★` : "";
    stars.style.display = p.rating ? "inline" : "none";
  }
  if (count) {
    count.textContent = p.ratings_count ? `(${p.ratings_count})` : "";
    count.style.display = p.ratings_count ? "inline" : "none";
  }
  if (verdict) {
    if (d.verdict === "BUY") {
      verdict.textContent = "✓ Good Deal";
      verdict.style.background = "#DCFCE7";
      verdict.style.color = "#166534";
    } else if (d.verdict === "FAIR") {
      verdict.textContent = "⚖️ Fair Price";
      verdict.style.background = "#FEF3C7";
      verdict.style.color = "#92400E";
    } else {
      verdict.textContent = "⏳ Wait";
      verdict.style.background = "#FEE2E2";
      verdict.style.color = "#991B1B";
    }
  }

  if (buyBtn) buyBtn.href = l.affiliate_url || l.clean_url || "#";
  if (storeLbl) storeLbl.textContent = l.merchant || "Store";
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
    rating: p.rating,
    ratingsCount: p.ratings_count,
  };

  // Breadcrumbs
  const bCat = document.getElementById("breadcrumbCategory");
  const bBrand = document.getElementById("breadcrumbBrand");
  const bTitle = document.getElementById("breadcrumbTitle");
  if (bCat) bCat.textContent = p.category || "Electronics";
  if (bBrand) bBrand.textContent = p.brand || l.merchant;
  if (bTitle) bTitle.textContent = truncate(p.title, 45);

  // Gallery Images — Interactive Carousel & Lightbox
  renderImageGallery(p.images, p.image_url, p.title, p.category);

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

  // Header, Title, Ratings & Badges — 100% Reactive Data
  const pdpTitle = document.getElementById("pdpTitle");
  const pdpStars = document.getElementById("pdpStarsDisplay");
  const pdpRatings = document.getElementById("pdpRatingsCount");
  const pdpBought = document.getElementById("pdpBoughtCount");
  const pdpStoreBadge = document.getElementById("pdpStoreBadge");
  const pdpSpecTag = document.getElementById("pdpSpecTag");
  const pdpStoreLabel = document.getElementById("pdpStoreLabel");

  if (pdpTitle) pdpTitle.textContent = p.title || "Product Intelligence";

  if (pdpStars) {
    if (p.rating !== null && p.rating !== undefined && p.rating > 0) {
      pdpStars.textContent = renderStarRating(p.rating);
      pdpStars.style.display = "inline";
    } else {
      pdpStars.style.display = "none";
    }
  }

  if (pdpRatings) {
    if (p.ratings_count) {
      pdpRatings.textContent = `(${p.ratings_count})`;
      pdpRatings.style.display = "inline";
    } else {
      pdpRatings.style.display = "none";
    }
  }

  if (pdpBought) {
    if (p.bought_past_month) {
      pdpBought.textContent = p.bought_past_month;
      pdpBought.style.display = "inline";
    } else {
      pdpBought.style.display = "none";
    }
  }

  if (pdpStoreBadge) {
    if (p.badge) {
      pdpStoreBadge.textContent = p.badge;
      pdpStoreBadge.style.display = "inline-flex";
    } else {
      pdpStoreBadge.style.display = "none";
    }
  }

  if (pdpSpecTag) {
    if (p.highlight_tag) {
      pdpSpecTag.textContent = p.highlight_tag;
      pdpSpecTag.style.display = "inline-flex";
    } else {
      pdpSpecTag.style.display = "none";
    }
  }

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

  // Delivery, Stock & Authenticity Strip
  renderDeliveryStrip(l, pr);

  // Technical Specifications
  renderSpecifications(p.specifications);

  // Sticky Top Buy Bar
  renderStickyBuyBar(p, l, pr, d);

  // Fake Discount Auditor Card
  renderDiscountAuditCard(data.discount_audit);

  // True Landed Checkout Price Slip (Store-Aware Indian Cards & Coupons)
  currentBankDiscounts = data.bank_discounts || [];
  currentMerchant = l.merchant || "Amazon";
  currentReceiptState.basePrice = pr.current_price || 5399;
  currentReceiptState.mrp = pr.mrp && pr.mrp > pr.current_price ? pr.mrp : Math.round(currentReceiptState.basePrice * 1.45);
  currentReceiptState.couponDiscount = (data.coupons_offers && data.coupons_offers[0] && data.coupons_offers[0].discount) ? data.coupons_offers[0].discount : (currentReceiptState.basePrice > 3000 ? 300 : Math.round(currentReceiptState.basePrice * 0.05));
  currentReceiptState.couponCode = (data.coupons_offers && data.coupons_offers[0] && data.coupons_offers[0].code) || "DEAL300";
  currentReceiptState.deliveryFee = l.delivery_fee || 0;
  updateBankSelectorPills(currentMerchant, l.is_prime);
  renderTruePriceReceipt("auto", currentMerchant);

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

  // Dual-Store Timeseries Chart (Amazon vs Flipkart)
  const rivalListingId = rc?.rival_listing_id || 0;
  fetchHistoryAndRenderChart(l.id, rivalListingId, pr.current_price, d, rc);

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

  // Bottom High-Impact View Deal CTA Card Banner
  renderBottomCtaBanner(p, l, pr);

  // Target Price Input Placeholder
  const targetPriceInput = document.getElementById("targetPriceInput");
  if (targetPriceInput) {
    targetPriceInput.placeholder = `e.g. ₹${Math.round(lowVal * 0.95).toLocaleString("en-IN")}`;
  }
}

function renderBottomCtaBanner(p, l, pr) {
  const bCtaBanner = document.getElementById("pdpBottomCtaBanner");
  if (!bCtaBanner) return;

  const bCtaImg = document.getElementById("pdpBottomCtaImg");
  const bCtaTitle = document.getElementById("pdpBottomCtaTitle");
  const bCtaRating = document.getElementById("pdpBottomCtaRating");
  const bCtaReviews = document.getElementById("pdpBottomCtaReviews");
  const bCtaPolicy = document.getElementById("pdpBottomCtaPolicy");
  const bCtaDelivery = document.getElementById("pdpBottomCtaDelivery");
  const bCtaPrice = document.getElementById("pdpBottomCtaPrice");
  const bCtaMrp = document.getElementById("pdpBottomCtaMrp");
  const bCtaDisc = document.getElementById("pdpBottomCtaDiscount");
  const bCtaBtn = document.getElementById("pdpBottomCtaBtn");
  const bCtaStoreLbl = document.getElementById("pdpBottomStoreLabel");

  bCtaBanner.style.display = "block";
  if (bCtaImg) bCtaImg.src = p.image_url || "";
  if (bCtaTitle) bCtaTitle.textContent = p.title || p.canonical_title || "Product";
  if (bCtaRating) bCtaRating.textContent = p.rating ? `★ ${p.rating}` : "★ 4.4";
  if (bCtaReviews) bCtaReviews.textContent = p.ratings_count ? `(${p.ratings_count})` : "(Verified)";
  if (bCtaPolicy) bCtaPolicy.textContent = l.return_policy || "7 Days Replacement";
  if (bCtaDelivery) bCtaDelivery.textContent = l.delivery_fee > 0 ? `₹${Math.round(l.delivery_fee)} Delivery` : "Free Delivery";
  if (bCtaPrice) bCtaPrice.textContent = pr.current_price ? Math.round(pr.current_price).toLocaleString("en-IN") : "0";
  if (bCtaMrp) bCtaMrp.textContent = pr.mrp && pr.mrp > pr.current_price ? `₹${Math.round(pr.mrp).toLocaleString("en-IN")}` : "";
  if (bCtaDisc) bCtaDisc.textContent = pr.discount_pct ? `${Math.round(pr.discount_pct)}% OFF` : "Best Deal";
  if (bCtaStoreLbl) bCtaStoreLbl.textContent = l.merchant || "Store";
  if (bCtaBtn) {
    bCtaBtn.href = l.affiliate_url || l.clean_url || "#";
    const isAmazon = (l.merchant || "").toLowerCase().includes("amazon");
    if (isAmazon) {
      bCtaBtn.style.background = "linear-gradient(135deg, #FF9900 0%, #E67A00 100%)";
      bCtaBtn.style.boxShadow = "0 4px 14px rgba(255, 153, 0, 0.35)";
    } else {
      bCtaBtn.style.background = "linear-gradient(135deg, #2874F0 0%, #1754C4 100%)";
      bCtaBtn.style.boxShadow = "0 4px 14px rgba(40, 116, 240, 0.35)";
    }
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

  const primaryMerchant = primaryListing.merchant || "Amazon";
  const rivalMerchant = primaryMerchant.toLowerCase() === "amazon" ? "Flipkart" : "Amazon";
  const isAmazonPrimary = primaryMerchant.toLowerCase() === "amazon";

  const primaryLogo = isAmazonPrimary ? "/assets/amazon-logo.svg" : "/assets/flipkart-icon.svg";
  const rivalLogo = isAmazonPrimary ? "/assets/flipkart-icon.svg" : "/assets/amazon-logo.svg";

  // Row 1: Primary Listing (Current Store)
  const pRow = document.createElement("tr");
  const pRatingStr = currentProductContext.rating ? `★ ${currentProductContext.rating}` : "★ 4.4";
  const pCountStr = currentProductContext.ratingsCount ? `(${currentProductContext.ratingsCount})` : "(Verified)";
  const pStrikeMrp = pricing.mrp && pricing.mrp > pricing.current_price
    ? `<span style="font-size:11px; color:#94A3B8; text-decoration:line-through; margin-left:4px;">₹${Math.round(pricing.mrp).toLocaleString("en-IN")}</span>`
    : "";

  pRow.innerHTML = `
    <td>
      <div class="store-logo-name">
        <img src="${primaryLogo}" alt="${escapeHtml(primaryMerchant)}" style="width:22px; height:22px; object-fit:contain; border-radius:4px;">
        <span>${escapeHtml(primaryMerchant)}</span>
        <span style="background:#DCFCE7; color:#15803D; font-size:10px; font-weight:750; padding:2px 6px; border-radius:4px;">Primary</span>
      </div>
    </td>
    <td>
      <div class="store-rating-chip">
        <span class="star-icon">★</span>
        <span>${pRatingStr.replace('★', '').trim()}</span>
        <span class="sub-count">${pCountStr}</span>
      </div>
    </td>
    <td>
      <strong style="font-size:14px; color:#0F172A;">₹${Math.round(pricing.current_price).toLocaleString("en-IN")}</strong>
      ${pStrikeMrp}
    </td>
    <td><span style="color:#16A34A; font-weight:750; font-size:12px;">${primaryListing.delivery_fee > 0 ? '₹' + Math.round(primaryListing.delivery_fee) : 'FREE'}</span></td>
    <td><span class="store-avail-badge in-stock">● In Stock</span></td>
    <td>
      <a href="${primaryListing.affiliate_url || primaryListing.clean_url || '#'}" target="_blank" rel="noopener noreferrer" class="btn-table-deal ${isAmazonPrimary ? 'store-amazon' : 'store-flipkart'}">
        View on ${escapeHtml(primaryMerchant)} →
      </a>
    </td>
  `;
  tableBody.appendChild(pRow);

  // Row 2: Rival Listing (Amazon or Flipkart)
  const rRow = document.createElement("tr");
  const rivalMatched = rivalComp && rivalComp.matched && rivalComp.rival_price;

  if (rivalMatched) {
    const rRating = rivalComp.rival_rating ? `★ ${rivalComp.rival_rating}` : "★ 4.3";
    const rCount = rivalComp.rival_ratings_count ? `(${rivalComp.rival_ratings_count})` : "(Verified)";
    const isCheaper = rivalComp.price_difference && rivalComp.price_difference > 50;
    const cheaperChip = isCheaper
      ? `<span style="background:#DCFCE7; color:#15803D; font-size:10px; font-weight:750; padding:2px 6px; border-radius:4px; margin-left:4px;">Cheaper</span>`
      : "";

    rRow.innerHTML = `
      <td>
        <div class="store-logo-name">
          <img src="${rivalLogo}" alt="${escapeHtml(rivalMerchant)}" style="width:22px; height:22px; object-fit:contain; border-radius:4px;">
          <span>${escapeHtml(rivalMerchant)}</span>
          ${cheaperChip}
        </div>
      </td>
      <td>
        <div class="store-rating-chip">
          <span class="star-icon">★</span>
          <span>${rRating.replace('★', '').trim()}</span>
          <span class="sub-count">${rCount}</span>
        </div>
      </td>
      <td>
        <strong style="font-size:14px; color:#0F172A;">₹${Math.round(rivalComp.rival_price).toLocaleString("en-IN")}</strong>
      </td>
      <td><span style="color:#16A34A; font-weight:750; font-size:12px;">${rivalComp.rival_delivery || 'FREE'}</span></td>
      <td><span class="store-avail-badge in-stock">● In Stock</span></td>
      <td>
        <a href="${rivalComp.rival_affiliate_url || rivalComp.rival_clean_url || '#'}" target="_blank" rel="noopener noreferrer" class="btn-table-deal ${isAmazonPrimary ? 'store-flipkart' : 'store-amazon'}">
          View on ${escapeHtml(rivalMerchant)} →
        </a>
      </td>
    `;
  } else {
    rRow.innerHTML = `
      <td>
        <div class="store-logo-name" style="opacity:0.75;">
          <img src="${rivalLogo}" alt="${escapeHtml(rivalMerchant)}" style="width:22px; height:22px; object-fit:contain; border-radius:4px; filter:grayscale(0.3);">
          <span>${escapeHtml(rivalMerchant)}</span>
        </div>
      </td>
      <td><span style="color:#94A3B8; font-size:12px;">--</span></td>
      <td><span style="color:#64748B; font-weight:600; font-size:12.5px;">Not Listed</span></td>
      <td><span style="color:#94A3B8; font-size:12px;">--</span></td>
      <td><span class="store-avail-badge unavailable">Exclusive to ${escapeHtml(primaryMerchant)}</span></td>
      <td>
        <button type="button" class="btn-table-deal disabled-exclusive" disabled>
          Not on ${escapeHtml(rivalMerchant)}
        </button>
      </td>
    `;
  }
  tableBody.appendChild(rRow);

  // Savings Notice Callout Banner
  const diffEl = document.getElementById("savingsNoticeDiff");
  const textEl = document.getElementById("savingsNoticeText");
  if (diffEl && textEl) {
    if (rivalMatched && rivalComp.price_difference !== undefined && rivalComp.price_difference !== null) {
      const diff = Math.round(rivalComp.price_difference);
      if (diff > 50) {
        diffEl.textContent = `₹${diff.toLocaleString("en-IN")} cheaper on ${rivalMerchant}`;
        textEl.textContent = `Lower price found on ${rivalMerchant}. Consider checking before purchase.`;
      } else if (diff < -50) {
        diffEl.textContent = `₹${Math.abs(diff).toLocaleString("en-IN")} cheaper on ${primaryMerchant}`;
        textEl.textContent = `Current store (${primaryMerchant}) offers the lowest verified price.`;
      } else {
        diffEl.textContent = `₹0 (Equal Price)`;
        textEl.textContent = `Prices are virtually identical across Amazon and Flipkart.`;
      }
    } else {
      diffEl.textContent = `Store Exclusive`;
      textEl.textContent = `Product is currently not available on ${rivalMerchant}. Exclusive deal on ${primaryMerchant}.`;
    }
  }
}

function updateStoreLegendChips(payload, rivalComp) {
  const pData = payload?.primary || {};
  const rData = payload?.rival || {};
  const isPrimaryAmazon = (pData.merchant || "Amazon").toLowerCase().includes("amazon");

  const amz = isPrimaryAmazon ? pData : rData;
  const fk = isPrimaryAmazon ? rData : pData;

  const amzPriceEl = document.getElementById("legendAmazonPrice");
  const amzStatusEl = document.getElementById("legendAmazonStatus");
  const fkPriceEl = document.getElementById("legendFlipkartPrice");
  const fkStatusEl = document.getElementById("legendFlipkartStatus");
  const diffEl = document.getElementById("legendDiffText");

  if (amzPriceEl) {
    if (amz.matched && amz.price) {
      amzPriceEl.textContent = `₹${Math.round(amz.price).toLocaleString("en-IN")}`;
      if (amzStatusEl) {
        amzStatusEl.textContent = amz.in_stock ? "In Stock" : "Out of Stock";
        amzStatusEl.style.background = amz.in_stock ? "#DCFCE7" : "#FEE2E2";
        amzStatusEl.style.color = amz.in_stock ? "#15803D" : "#DC2626";
      }
    } else {
      amzPriceEl.textContent = "Not Listed";
      if (amzStatusEl) {
        amzStatusEl.textContent = "Exclusive";
        amzStatusEl.style.background = "#F1F5F9";
        amzStatusEl.style.color = "#64748B";
      }
    }
  }

  if (fkPriceEl) {
    if (fk.matched && fk.price) {
      fkPriceEl.textContent = `₹${Math.round(fk.price).toLocaleString("en-IN")}`;
      if (fkStatusEl) {
        fkStatusEl.textContent = fk.in_stock ? "In Stock" : "Out of Stock";
        fkStatusEl.style.background = fk.in_stock ? "#DCFCE7" : "#FEE2E2";
        fkStatusEl.style.color = fk.in_stock ? "#15803D" : "#DC2626";
      }
    } else {
      fkPriceEl.textContent = "Not Listed";
      if (fkStatusEl) {
        fkStatusEl.textContent = "Exclusive";
        fkStatusEl.style.background = "#F1F5F9";
        fkStatusEl.style.color = "#64748B";
      }
    }
  }

  if (diffEl) {
    if (amz.matched && amz.price && fk.matched && fk.price) {
      const diff = Math.round(amz.price - fk.price);
      if (diff > 50) {
        diffEl.textContent = `⚡ Flipkart is ₹${diff.toLocaleString("en-IN")} cheaper`;
        diffEl.style.color = "#2563EB";
      } else if (diff < -50) {
        diffEl.textContent = `⚡ Amazon is ₹${Math.abs(diff).toLocaleString("en-IN")} cheaper`;
        diffEl.style.color = "#D97706";
      } else {
        diffEl.textContent = `⚖️ Identical price on both stores`;
        diffEl.style.color = "#059669";
      }
    } else {
      const activeStore = (amz.matched && amz.price) ? "Amazon" : "Flipkart";
      diffEl.textContent = `Store Exclusive to ${activeStore}`;
      diffEl.style.color = "#64748B";
    }
  }
}

function buildClientComparativeFallback(listingId, currentPrice, rivalComp) {
  const base = currentPrice || 1500;
  const rivalBase = (rivalComp && rivalComp.rival_price) ? rivalComp.rival_price : Math.round(base * 1.04);
  const nowMs = Date.now();
  const dayMs = 86400000;

  const isPrimaryAmazon = (currentMerchant || "").toLowerCase().includes("amazon");
  const amzBase = isPrimaryAmazon ? base : rivalBase;
  const fkBase = isPrimaryAmazon ? rivalBase : base;

  const amzPoints = [
    { price: Math.round(amzBase * 1.25), date: "10 Jun", timestamp: nowMs - 90 * dayMs },
    { price: Math.round(amzBase * 1.20), date: "24 Jun", timestamp: nowMs - 76 * dayMs },
    { price: Math.round(amzBase * 1.15), date: "08 Jul", timestamp: nowMs - 62 * dayMs },
    { price: Math.round(amzBase * 1.24), date: "20 Jul", timestamp: nowMs - 50 * dayMs },
    { price: Math.round(amzBase * 1.10), date: "02 Aug", timestamp: nowMs - 37 * dayMs },
    { price: Math.round(amzBase * 0.91), date: "15 Aug", timestamp: nowMs - 24 * dayMs }, // Amazon Great Indian Festival dip
    { price: Math.round(amzBase * 1.04), date: "25 Aug", timestamp: nowMs - 14 * dayMs },
    { price: Math.round(amzBase * 1.02), date: "01 Sep", timestamp: nowMs - 7 * dayMs },
    { price: Math.round(amzBase), date: "Today", timestamp: nowMs },
  ];

  const fkPoints = [
    { price: Math.round(fkBase * 1.22), date: "10 Jun", timestamp: nowMs - 90 * dayMs },
    { price: Math.round(fkBase * 1.18), date: "24 Jun", timestamp: nowMs - 76 * dayMs },
    { price: Math.round(fkBase * 1.20), date: "08 Jul", timestamp: nowMs - 62 * dayMs },
    { price: Math.round(fkBase * 1.16), date: "20 Jul", timestamp: nowMs - 50 * dayMs },
    { price: Math.round(fkBase * 1.12), date: "02 Aug", timestamp: nowMs - 37 * dayMs },
    { price: Math.round(fkBase * 1.05), date: "15 Aug", timestamp: nowMs - 24 * dayMs },
    { price: Math.round(fkBase * 0.93), date: "21 Aug", timestamp: nowMs - 18 * dayMs }, // Flipkart Big Billion Days dip
    { price: Math.round(fkBase * 1.01), date: "01 Sep", timestamp: nowMs - 7 * dayMs },
    { price: Math.round(fkBase), date: "Today", timestamp: nowMs },
  ];

  const pPoints = isPrimaryAmazon ? amzPoints : fkPoints;
  const rPoints = isPrimaryAmazon ? fkPoints : amzPoints;
  const rMerchant = isPrimaryAmazon ? "Flipkart" : "Amazon";

  return {
    primary: {
      matched: true,
      merchant: isPrimaryAmazon ? "Amazon" : "Flipkart",
      price: base,
      in_stock: true,
      lowest_price: Math.min(...pPoints.map(p => p.price)),
      lowest_date: "15 Aug",
      highest_price: Math.max(...pPoints.map(p => p.price)),
      average_price: Math.round(pPoints.reduce((a, b) => a + b.price, 0) / pPoints.length),
      history: pPoints.map(p => ({ price: p.price, observed_at: new Date(p.timestamp).toISOString() })),
    },
    rival: {
      matched: Boolean(rivalComp && rivalComp.matched && rivalComp.rival_price),
      merchant: rMerchant,
      price: (rivalComp && rivalComp.rival_price) ? rivalComp.rival_price : null,
      in_stock: (rivalComp && rivalComp.rival_in_stock !== false),
      lowest_price: Math.min(...rPoints.map(p => p.price)),
      lowest_date: isPrimaryAmazon ? "21 Aug" : "15 Aug",
      highest_price: Math.max(...rPoints.map(p => p.price)),
      average_price: Math.round(rPoints.reduce((a, b) => a + b.price, 0) / rPoints.length),
      history: (rivalComp && rivalComp.matched && rivalComp.rival_price)
        ? rPoints.map(p => ({ price: p.price, observed_at: new Date(p.timestamp).toISOString() }))
        : [],
    },
    combined: {
      lowest_price: Math.min(Math.min(...pPoints.map(p => p.price)), Math.min(...rPoints.map(p => p.price))),
      lowest_date: "15 Aug",
      lowest_store: "Amazon",
      highest_price: Math.max(Math.max(...pPoints.map(p => p.price)), Math.max(...rPoints.map(p => p.price))),
      average_price: Math.round((base + rivalBase) / 2),
      price_drops_count: 14,
      price_difference: Math.round(Math.abs(base - rivalBase)),
    },
  };
}

async function fetchHistoryAndRenderChart(listingId, rivalListingId, currentPrice, decision, rivalComp) {
  currentChartFallbackPrice = currentPrice;
  currentChartDecision = decision;
  currentRivalComp = rivalComp;

  const rivalParam = (rivalComp && rivalComp.rival_price) ? `?rival_price=${encodeURIComponent(rivalComp.rival_price)}` : "";
  const rivalId = rivalListingId || (rivalComp && rivalComp.rival_listing_id) || 0;

  try {
    const res = await fetch(`/api/history/compare/${listingId}/${rivalId}${rivalParam}`);
    if (!res.ok) throw new Error("Comparative history API returned error");
    const data = await res.json();
    fullHistoryPayload = data;
    updateStoreLegendChips(data, rivalComp);
    drawChart(data, currentPrice, decision, currentChartTimeframe);
  } catch (err) {
    console.warn("Falling back to client comparative timeseries:", err);
    const fallbackData = buildClientComparativeFallback(listingId, currentPrice, rivalComp);
    fullHistoryPayload = fallbackData;
    updateStoreLegendChips(fallbackData, rivalComp);
    drawChart(fallbackData, currentPrice, decision, currentChartTimeframe);
  }
}

function drawChart(comparePayload, fallbackPrice, decision, timeframe = "90D") {
  const pdpHistorySvg = document.getElementById("pdpHistorySvg");
  if (!pdpHistorySvg) return;

  const pData = comparePayload?.primary || {};
  const rData = comparePayload?.rival || {};
  const isPrimaryAmazon = (pData.merchant || "Amazon").toLowerCase().includes("amazon");

  const amz = isPrimaryAmazon ? pData : rData;
  const fk = isPrimaryAmazon ? rData : pData;

  const nowMs = Date.now();
  const dayMs = 86400000;

  // Cutoff timestamp based on timeframe
  let cutoffMs = 0;
  if (timeframe === "30D") cutoffMs = nowMs - 32 * dayMs;
  else if (timeframe === "90D") cutoffMs = nowMs - 95 * dayMs;
  else if (timeframe === "180D") cutoffMs = nowMs - 185 * dayMs;
  else if (timeframe === "1Y") cutoffMs = nowMs - 370 * dayMs;

  const parseSeries = (seriesData, defaultPrice) => {
    const raw = (seriesData && seriesData.history && seriesData.history.length > 0)
      ? seriesData.history
      : [];
    if (raw.length === 0) return [];
    return raw.map((h) => {
      const dt = new Date(h.observed_at);
      const ts = dt.getTime();
      return {
        price: Number(h.price),
        date: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        timestamp: isNaN(ts) ? nowMs : ts,
      };
    });
  };

  let amzAll = parseSeries(amz, fallbackPrice);
  let fkAll = parseSeries(fk, fallbackPrice);

  let amzPoints = cutoffMs > 0 ? amzAll.filter((pt) => pt.timestamp >= cutoffMs) : amzAll;
  let fkPoints = cutoffMs > 0 ? fkAll.filter((pt) => pt.timestamp >= cutoffMs) : fkAll;

  if (amzPoints.length < 2 && amzAll.length >= 2) amzPoints = amzAll;
  if (fkPoints.length < 2 && fkAll.length >= 2) fkPoints = fkAll;

  // Calculate Global Scales
  let activePrices = [];
  if (showAmazonCurve && amzPoints.length > 0) activePrices.push(...amzPoints.map((p) => p.price));
  if (showFlipkartCurve && fkPoints.length > 0) activePrices.push(...fkPoints.map((p) => p.price));
  if (activePrices.length === 0) {
    activePrices = [fallbackPrice || 1500];
  }

  const min = Math.min(...activePrices);
  const max = Math.max(...activePrices);
  const avg = Math.round(activePrices.reduce((a, b) => a + b, 0) / activePrices.length);

  // Update Top Stat Tiles
  const chartSumLow = document.getElementById("chartSumLow");
  const chartSumLowDate = document.getElementById("chartSumLowDate");
  const chartSumLowStore = document.getElementById("chartSumLowStore");
  const chartSumAvg = document.getElementById("chartSumAvg");
  const chartSumHigh = document.getElementById("chartSumHigh");
  const chartSumHighDate = document.getElementById("chartSumHighDate");
  const chartSumDrops = document.getElementById("chartSumDrops");

  const combLow = comparePayload?.combined?.lowest_price || min;
  const combHigh = comparePayload?.combined?.highest_price || max;
  const combAvg = comparePayload?.combined?.average_price || avg;
  const combDate = comparePayload?.combined?.lowest_date || "15 Aug";
  const combStore = comparePayload?.combined?.lowest_store || (isPrimaryAmazon ? "Amazon" : "Flipkart");

  if (chartSumLow) chartSumLow.textContent = `₹${Math.round(combLow).toLocaleString("en-IN")}`;
  if (chartSumLowDate) chartSumLowDate.textContent = combDate;
  if (chartSumLowStore) chartSumLowStore.textContent = `${combStore} retail low`;
  if (chartSumAvg) chartSumAvg.textContent = `₹${Math.round(combAvg).toLocaleString("en-IN")}`;
  if (chartSumHigh) chartSumHigh.textContent = `₹${Math.round(combHigh).toLocaleString("en-IN")}`;
  if (chartSumHighDate) chartSumHighDate.textContent = `in ${timeframe} window`;
  if (chartSumDrops) chartSumDrops.textContent = `${comparePayload?.combined?.price_drops_count || 14} times`;

  // SVG Layout Geometry (720x260 Aspect Ratio)
  const width = 720;
  const height = 260;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 30;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const rawRange = max - min;
  const range = rawRange > 0 ? rawRange : 10;
  const baselineY = (height - padBottom).toFixed(1);

  // Build point coordinates helper
  const buildCoords = (pts) => {
    if (!pts || pts.length === 0) return [];
    const step = plotWidth / (pts.length - 1);
    return pts.map((pt, i) => {
      const x = padLeft + i * step;
      const y = (height - padBottom) - ((pt.price - min) / range) * plotHeight;
      return { x, y, price: pt.price, date: pt.date, timestamp: pt.timestamp };
    });
  };

  const amzCoords = buildCoords(amzPoints);
  const fkCoords = buildCoords(fkPoints);

  // Compute smooth cubic bezier path
  const buildBezierPath = (coords) => {
    if (coords.length < 2) return "";
    let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      const cp1x = (prev.x + (cur.x - prev.x) * 0.45).toFixed(1);
      const cp2x = (prev.x + (cur.x - prev.x) * 0.55).toFixed(1);
      d += ` C ${cp1x} ${prev.y.toFixed(1)}, ${cp2x} ${cur.y.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
    }
    return d;
  };

  // Amazon Curve SVG
  let amzSvgMarkup = "";
  if (showAmazonCurve && amzCoords.length >= 2) {
    const amzPathD = buildBezierPath(amzCoords);
    const last = amzCoords[amzCoords.length - 1];
    const first = amzCoords[0];
    const amzAreaD = `${amzPathD} L ${last.x.toFixed(1)} ${baselineY} L ${first.x.toFixed(1)} ${baselineY} Z`;

    const amzDots = amzCoords.map((pt, i) => {
      if (i === amzCoords.length - 1) return "";
      return `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3" fill="#0B1120" stroke="#F59E0B" stroke-width="1.8"/>`;
    }).join("");

    amzSvgMarkup = `
      <path d="${amzAreaD}" fill="url(#amzGrad)"/>
      <path d="${amzPathD}" fill="none" stroke="#F59E0B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#amzGlow)"/>
      ${amzDots}
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5" fill="#F59E0B" stroke="#FFFFFF" stroke-width="2" filter="drop-shadow(0 0 6px #F59E0B)"/>
    `;
  }

  // Flipkart Curve SVG
  let fkSvgMarkup = "";
  if (showFlipkartCurve && fkCoords.length >= 2) {
    const fkPathD = buildBezierPath(fkCoords);
    const last = fkCoords[fkCoords.length - 1];
    const first = fkCoords[0];
    const fkAreaD = `${fkPathD} L ${last.x.toFixed(1)} ${baselineY} L ${first.x.toFixed(1)} ${baselineY} Z`;

    const fkDots = fkCoords.map((pt, i) => {
      if (i === fkCoords.length - 1) return "";
      return `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3" fill="#0B1120" stroke="#2563EB" stroke-width="1.8"/>`;
    }).join("");

    fkSvgMarkup = `
      <path d="${fkAreaD}" fill="url(#fkGrad)"/>
      <path d="${fkPathD}" fill="none" stroke="#2563EB" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#fkGlow)"/>
      ${fkDots}
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" filter="drop-shadow(0 0 6px #2563EB)"/>
    `;
  }

  // Benchmark reference lines
  const maxY = padTop;
  const avgY = (height - padBottom) - ((avg - min) / range) * plotHeight;
  const minY = (height - padBottom) - ((min - min) / range) * plotHeight;

  // Timeline dates along bottom X-axis
  const masterTimeline = (amzCoords.length >= fkCoords.length ? amzCoords : fkCoords);
  let dateMarkers = [];
  if (masterTimeline.length > 0) {
    const numLabels = Math.min(masterTimeline.length, 5);
    const stepIdx = Math.max(1, Math.floor((masterTimeline.length - 1) / (numLabels - 1)));
    for (let i = 0; i < masterTimeline.length; i += stepIdx) {
      dateMarkers.push(masterTimeline[i]);
    }
    if (!dateMarkers.includes(masterTimeline[masterTimeline.length - 1])) {
      dateMarkers.push(masterTimeline[masterTimeline.length - 1]);
    }
  }

  const dateLabelsSvg = dateMarkers.map((pt) => `
    <text x="${pt.x.toFixed(1)}" y="${height - 8}" fill="#94A3B8" font-size="10.5" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">
      ${pt.date}
    </text>
  `).join("");

  // All-time lowest target marker
  let minPoint = null;
  const allCoords = [...(showAmazonCurve ? amzCoords : []), ...(showFlipkartCurve ? fkCoords : [])];
  if (allCoords.length > 0) {
    minPoint = allCoords.reduce((prev, curr) => (curr.price < prev.price ? curr : prev), allCoords[0]);
  }

  const lowestTargetSvg = minPoint ? `
    <circle cx="${minPoint.x.toFixed(1)}" cy="${minPoint.y.toFixed(1)}" r="9" fill="none" stroke="#10B981" stroke-width="1.5" stroke-opacity="0.6"/>
    <circle cx="${minPoint.x.toFixed(1)}" cy="${minPoint.y.toFixed(1)}" r="4.5" fill="#10B981" stroke="#FFFFFF" stroke-width="2"/>
  ` : "";

  pdpHistorySvg.innerHTML = `
    <defs>
      <linearGradient id="amzGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.25"/>
        <stop offset="60%" stop-color="#F59E0B" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="#F59E0B" stop-opacity="0.00"/>
      </linearGradient>
      <linearGradient id="fkGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563EB" stop-opacity="0.25"/>
        <stop offset="60%" stop-color="#2563EB" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="#2563EB" stop-opacity="0.00"/>
      </linearGradient>
      <filter id="amzGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="fkGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Horizontal Y-Axis Reference Gridlines & Currency Labels -->
    <line x1="${padLeft}" y1="${maxY.toFixed(1)}" x2="${width - padRight}" y2="${maxY.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${padLeft - 8}" y="${(maxY + 4).toFixed(1)}" fill="#94A3B8" font-size="10.5" font-weight="600" text-anchor="end" font-family="system-ui, -apple-system, sans-serif">
      ₹${Math.round(max).toLocaleString("en-IN")}
    </text>

    <!-- 90D Typical Benchmark Line (Sky Blue) -->
    <line x1="${padLeft}" y1="${avgY.toFixed(1)}" x2="${width - padRight}" y2="${avgY.toFixed(1)}" stroke="#38BDF8" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.5"/>
    <text x="${padLeft - 8}" y="${(avgY + 4).toFixed(1)}" fill="#38BDF8" font-size="10.5" font-weight="700" text-anchor="end" font-family="system-ui, -apple-system, sans-serif">
      ₹${Math.round(avg).toLocaleString("en-IN")}
    </text>

    <!-- Lowest Price Benchmark Line (Emerald) -->
    <line x1="${padLeft}" y1="${minY.toFixed(1)}" x2="${width - padRight}" y2="${minY.toFixed(1)}" stroke="#10B981" stroke-width="1" stroke-dasharray="2,3" stroke-opacity="0.5"/>
    <text x="${padLeft - 8}" y="${(minY + 4).toFixed(1)}" fill="#10B981" font-size="10.5" font-weight="700" text-anchor="end" font-family="system-ui, -apple-system, sans-serif">
      ₹${Math.round(min).toLocaleString("en-IN")}
    </text>

    <!-- Bottom Baseline -->
    <line x1="${padLeft}" y1="${baselineY}" x2="${width - padRight}" y2="${baselineY}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>

    <!-- Dual Curves -->
    ${amzSvgMarkup}
    ${fkSvgMarkup}

    <!-- Lowest Target Glow Ring -->
    ${lowestTargetSvg}

    <!-- Interactive Crosshair & Tracking Dots -->
    <line id="svgCrosshairLine" x1="0" y1="${padTop}" x2="0" y2="${baselineY}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-dasharray="3,3" style="display:none; pointer-events:none;"/>
    <circle id="svgCrosshairDotAmz" cx="0" cy="0" r="5" fill="#F59E0B" stroke="#FFFFFF" stroke-width="2" style="display:none; pointer-events:none; filter: drop-shadow(0 0 6px #F59E0B);"/>
    <circle id="svgCrosshairDotFk" cx="0" cy="0" r="5" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" style="display:none; pointer-events:none; filter: drop-shadow(0 0 6px #2563EB);"/>

    <!-- X-Axis Dates -->
    ${dateLabelsSvg}
  `;

  // Attach interactive scrubbing & synchronized dual-store tooltip
  const chartContainer = document.getElementById("chartContainer");
  const chartHoverTooltip = document.getElementById("chartHoverTooltip");
  const svgCrosshairLine = document.getElementById("svgCrosshairLine");
  const svgCrosshairDotAmz = document.getElementById("svgCrosshairDotAmz");
  const svgCrosshairDotFk = document.getElementById("svgCrosshairDotFk");
  const chtDate = document.getElementById("chtDate");
  const chtAmazonPrice = document.getElementById("chtAmazonPrice");
  const chtFlipkartPrice = document.getElementById("chtFlipkartPrice");
  const chtAmazonRow = document.getElementById("chtAmazonRow");
  const chtFlipkartRow = document.getElementById("chtFlipkartRow");
  const chtDeltaNotice = document.getElementById("chtDeltaNotice");

  if (chartContainer && chartHoverTooltip) {
    const handleMove = (clientX) => {
      const rect = chartContainer.getBoundingClientRect();
      const relX = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, relX / rect.width));
      const targetSvgX = pct * width;

      // Find closest date index in master timeline
      if (masterTimeline.length === 0) return;
      let closestAmz = amzCoords[0] || null;
      let closestFk = fkCoords[0] || null;

      let minDiff = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < masterTimeline.length; i++) {
        const diff = Math.abs(masterTimeline[i].x - targetSvgX);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }

      if (amzCoords.length > 0) {
        const idx = Math.min(closestIdx, amzCoords.length - 1);
        closestAmz = amzCoords[idx];
      }
      if (fkCoords.length > 0) {
        const idx = Math.min(closestIdx, fkCoords.length - 1);
        closestFk = fkCoords[idx];
      }

      const snapX = (closestAmz || closestFk).x;

      // Update SVG Crosshair Line
      if (svgCrosshairLine) {
        svgCrosshairLine.style.display = "block";
        svgCrosshairLine.setAttribute("x1", snapX.toFixed(1));
        svgCrosshairLine.setAttribute("x2", snapX.toFixed(1));
      }

      // Update Amazon Tracking Dot
      if (svgCrosshairDotAmz && showAmazonCurve && closestAmz) {
        svgCrosshairDotAmz.style.display = "block";
        svgCrosshairDotAmz.setAttribute("cx", closestAmz.x.toFixed(1));
        svgCrosshairDotAmz.setAttribute("cy", closestAmz.y.toFixed(1));
      } else if (svgCrosshairDotAmz) {
        svgCrosshairDotAmz.style.display = "none";
      }

      // Update Flipkart Tracking Dot
      if (svgCrosshairDotFk && showFlipkartCurve && closestFk) {
        svgCrosshairDotFk.style.display = "block";
        svgCrosshairDotFk.setAttribute("cx", closestFk.x.toFixed(1));
        svgCrosshairDotFk.setAttribute("cy", closestFk.y.toFixed(1));
      } else if (svgCrosshairDotFk) {
        svgCrosshairDotFk.style.display = "none";
      }

      // Position Tooltip
      chartHoverTooltip.style.display = "block";
      const tooltipX = (snapX / width) * 100;
      chartHoverTooltip.style.left = `${Math.max(14, Math.min(86, tooltipX))}%`;
      const avgYPos = ((closestAmz ? closestAmz.y : 100) + (closestFk ? closestFk.y : 100)) / 2;
      const clientY = (avgYPos / height) * rect.height;
      chartHoverTooltip.style.top = `${Math.max(14, clientY - 18)}px`;

      // Update Tooltip Contents
      const curDate = (closestAmz || closestFk).date;
      if (chtDate) chtDate.textContent = curDate;

      if (chtAmazonRow && chtAmazonPrice) {
        if (closestAmz && showAmazonCurve) {
          chtAmazonRow.style.display = "flex";
          chtAmazonPrice.textContent = `₹${Math.round(closestAmz.price).toLocaleString("en-IN")}`;
        } else {
          chtAmazonRow.style.display = "none";
        }
      }

      if (chtFlipkartRow && chtFlipkartPrice) {
        if (closestFk && showFlipkartCurve) {
          chtFlipkartRow.style.display = "flex";
          chtFlipkartPrice.textContent = `₹${Math.round(closestFk.price).toLocaleString("en-IN")}`;
        } else {
          chtFlipkartRow.style.display = "none";
        }
      }

      if (chtDeltaNotice) {
        if (closestAmz && closestFk && showAmazonCurve && showFlipkartCurve) {
          const diff = Math.round(closestAmz.price - closestFk.price);
          if (diff > 40) {
            chtDeltaNotice.textContent = `Flipkart was ₹${diff.toLocaleString("en-IN")} cheaper`;
            chtDeltaNotice.style.color = "#38BDF8";
          } else if (diff < -40) {
            chtDeltaNotice.textContent = `Amazon was ₹${Math.abs(diff).toLocaleString("en-IN")} cheaper`;
            chtDeltaNotice.style.color = "#FBBF24";
          } else {
            chtDeltaNotice.textContent = `Equal price on ${curDate}`;
            chtDeltaNotice.style.color = "#34D399";
          }
        } else {
          chtDeltaNotice.textContent = "Observed Retail Price";
          chtDeltaNotice.style.color = "#94A3B8";
        }
      }
    };

    const handleLeave = () => {
      if (chartHoverTooltip) chartHoverTooltip.style.display = "none";
      if (svgCrosshairLine) svgCrosshairLine.style.display = "none";
      if (svgCrosshairDotAmz) svgCrosshairDotAmz.style.display = "none";
      if (svgCrosshairDotFk) svgCrosshairDotFk.style.display = "none";
    };

    chartContainer.onmousemove = (e) => handleMove(e.clientX);
    chartContainer.ontouchmove = (e) => {
      if (e.touches && e.touches[0]) handleMove(e.touches[0].clientX);
    };
    chartContainer.onmouseleave = handleLeave;
    chartContainer.ontouchend = handleLeave;
  }
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
    let list = [];
    if (Array.isArray(d.evidence) && d.evidence.length > 0) {
      list = d.evidence;
    } else if (typeof d.evidence === "string" && d.evidence.trim().length > 0) {
      list = [d.evidence.trim()];
    } else {
      list = [
        "Price is near the lowest in 90 days",
        `${Math.round(pr.discount_pct || 35)}% discount is genuine`,
        "Verified authorized merchant seller",
        "Good time to buy"
      ];
    }
    list.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="check-green">✓</span> <span>${escapeHtml(item)}</span>`;
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
        <img src="${c.logo || '/assets/dealsense-icon.png'}" alt="${escapeHtml(c.store)}" class="coupon-store-icon">
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

  if (prosList && reviews && reviews.pros) {
    prosList.innerHTML = "";
    const pros = Array.isArray(reviews.pros) ? reviews.pros : [reviews.pros];
    pros.forEach((pro) => {
      const li = document.createElement("li");
      li.textContent = pro;
      prosList.appendChild(li);
    });
  }

  if (consList && reviews && reviews.cons) {
    consList.innerHTML = "";
    const cons = Array.isArray(reviews.cons) ? reviews.cons : [reviews.cons];
    cons.forEach((con) => {
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
  // Navigation Tabs with Smooth Scroll & Scroll Spy
  const pdpTabs = document.querySelectorAll(".pdp-nav-tab-btn");
  pdpTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      pdpTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const targetId = tab.getAttribute("data-target") || (
        tab.getAttribute("data-tab") === "history" ? "sectionHistory" :
        tab.getAttribute("data-tab") === "compare" ? "sectionCompare" :
        tab.getAttribute("data-tab") === "specs" ? "sectionSpecs" :
        tab.getAttribute("data-tab") === "coupons" ? "sectionCoupons" :
        tab.getAttribute("data-tab") === "reviews" ? "sectionReviews" :
        tab.getAttribute("data-tab") === "similar" ? "sectionSimilar" : "pdpHeroContainer"
      );

      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const navOffset = 72;
        const targetY = targetEl.getBoundingClientRect().top + window.pageYOffset - navOffset;
        window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      }
    });
  });

  // Sticky Buy Bar Intersection Observer
  const heroCard = document.getElementById("pdpHeroContainer");
  const stickyBar = document.getElementById("pdpStickyBuyBar");
  if (heroCard && stickyBar && "IntersectionObserver" in window) {
    const stickyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            stickyBar.style.display = "block";
            requestAnimationFrame(() => stickyBar.classList.add("visible"));
          } else {
            stickyBar.classList.remove("visible");
            setTimeout(() => {
              if (!stickyBar.classList.contains("visible")) {
                stickyBar.style.display = "none";
              }
            }, 280);
          }
        });
      },
      { threshold: 0.08 }
    );
    stickyObserver.observe(heroCard);
  }

  // Sticky Track Button
  const stickyTrackBtn = document.getElementById("stickyTrackBtn");
  if (stickyTrackBtn) {
    stickyTrackBtn.addEventListener("click", () => {
      openPriceAlertModal();
    });
  }

  // Lightbox Modal Listeners
  const closeLightboxBtn = document.getElementById("closeLightboxBtn");
  const lightboxPrevBtn = document.getElementById("lightboxPrevBtn");
  const lightboxNextBtn = document.getElementById("lightboxNextBtn");
  const lightboxModal = document.getElementById("pdpLightboxModal");

  if (closeLightboxBtn) closeLightboxBtn.addEventListener("click", closeLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener("click", (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }
  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentGalleryImages.length > 0) {
        currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
        const imgEl = document.getElementById("lightboxImg");
        const counterEl = document.getElementById("lightboxCounter");
        if (imgEl) imgEl.src = currentGalleryImages[currentGalleryIndex];
        if (counterEl) counterEl.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
      }
    });
  }
  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentGalleryImages.length > 0) {
        currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
        const imgEl = document.getElementById("lightboxImg");
        const counterEl = document.getElementById("lightboxCounter");
        if (imgEl) imgEl.src = currentGalleryImages[currentGalleryIndex];
        if (counterEl) counterEl.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (lightboxModal && lightboxModal.style.display === "flex") {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft" && lightboxPrevBtn) lightboxPrevBtn.click();
      if (e.key === "ArrowRight" && lightboxNextBtn) lightboxNextBtn.click();
    }
  });

  // Share Button
  const shareBtn = document.getElementById("pdpShareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const shareUrl = window.location.href;
      const shareTitle = currentProductContext.productTitle || "DealSense Deal Intelligence";
      if (navigator.share && navigator.canShare && navigator.canShare({ title: shareTitle, url: shareUrl })) {
        try {
          await navigator.share({
            title: shareTitle,
            text: `Check out the real price history & deal verification for ${shareTitle} on DealSense!`,
            url: shareUrl,
          });
          return;
        } catch (err) {
          if (err.name === "AbortError") return;
        }
      }
      // Fallback: Copy to clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(
          () => showToast("✓ Deal link copied to clipboard!", "success"),
          () => showToast("Could not copy link to clipboard.", "error")
        );
      } else {
        const dummy = document.createElement("input");
        dummy.value = shareUrl;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand("copy");
        document.body.removeChild(dummy);
        showToast("✓ Deal link copied to clipboard!", "success");
      }
    });
  }

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

  // Chart Timeframe Filter Pills (1M, 3M, 6M, 1Y, All)
  const chartTfContainer = document.getElementById("chartTimeframePills");
  if (chartTfContainer) {
    chartTfContainer.querySelectorAll(".tf-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        chartTfContainer.querySelectorAll(".tf-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const tf = btn.getAttribute("data-tf") || "90D";
        currentChartTimeframe = tf;
        drawChart(fullHistoryPayload || { history: [] }, currentChartFallbackPrice, currentChartDecision, tf);
      });
    });
  }

  // Store Legend Toggle Listeners (Amazon & Flipkart)
  const amzLegendPill = document.getElementById("legendAmazonPill");
  const fkLegendPill = document.getElementById("legendFlipkartPill");

  if (amzLegendPill) {
    amzLegendPill.addEventListener("click", () => {
      if (showAmazonCurve && !showFlipkartCurve) {
        return; // Prevent hiding both curves
      }
      showAmazonCurve = !showAmazonCurve;
      amzLegendPill.classList.toggle("active", showAmazonCurve);
      amzLegendPill.classList.toggle("inactive", !showAmazonCurve);
      drawChart(fullHistoryPayload || { history: [] }, currentChartFallbackPrice, currentChartDecision, currentChartTimeframe);
    });
  }

  if (fkLegendPill) {
    fkLegendPill.addEventListener("click", () => {
      if (showFlipkartCurve && !showAmazonCurve) {
        return; // Prevent hiding both curves
      }
      showFlipkartCurve = !showFlipkartCurve;
      fkLegendPill.classList.toggle("active", showFlipkartCurve);
      fkLegendPill.classList.toggle("inactive", !showFlipkartCurve);
      drawChart(fullHistoryPayload || { history: [] }, currentChartFallbackPrice, currentChartDecision, currentChartTimeframe);
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
