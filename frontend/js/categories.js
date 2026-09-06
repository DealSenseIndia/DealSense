/**
 * DealSense — Categories Page JavaScript
 * Route: /categories
 *
 * Responsibilities:
 * - Fetch taxonomy from /api/categories
 * - Fetch popular chips from /api/categories/popular
 * - Clean Lucide SVG icons for all categories in sidebar
 * - Responsive 4x4 category cards grid + "Build your perfect setup" Card 16
 * - Smooth sidebar navigation with card highlight
 * - Real-time category & subcategory search
 * - Direct deep linking support (/categories#slug or ?cat=slug)
 */

"use strict";

/* ─── Analytics Hook ────────────────────────────────────────────────────── */
function trackEvent(name, props = {}) {
  console.debug("[DW Analytics]", name, props);
}

/* ─── SVG Icons Dictionary (Lucide style, 15x15) ─────────────────────────── */
const CATEGORY_ICONS = {
  all: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
  electronics: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
  "home-living": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
  fashion: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path></svg>`,
  "beauty-personal-care": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v3H9zM10 6v3a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V6M8 11h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"></path></svg>`,
  "sports-fitness": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="8.12" y1="15.88" x2="15.88" y2="8.12"></line><line x1="14.47" y1="4.53" x2="19.47" y2="9.53"></line><line x1="4.53" y1="14.47" x2="9.53" y2="19.47"></line></svg>`,
  automotive: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"></line><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"></line><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"></line><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"></line></svg>`,
  "baby-kids": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 1.5.8 2.8 2 3.5V14H8a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2V9.5c1.2-.7 2-2 2-3.5a4 4 0 0 0-4-4z"></path></svg>`,
  "books-stationery": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
  "grocery-essentials": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
  "health-nutrition": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path></svg>`,
  "toys-games": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line></svg>`,
  "pet-supplies": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13c-2 0-3.5 1.5-3.5 3s1.5 3 3.5 3 3.5-1.5 3.5-3-1.5-3-3.5-3zM7 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4.5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19.5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path></svg>`,
  "office-supplies": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
  "musical-instruments": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  "travel-luggage": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="14" height="15" rx="2"></rect><path d="M9 6V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"></path><circle cx="8" cy="21" r="1"></circle><circle cx="16" cy="21" r="1"></circle></svg>`,
};

function getCategoryIcon(slug) {
  return CATEGORY_ICONS[slug] || CATEGORY_ICONS.all;
}

/* ─── Category Taxonomy Fallback Data ───────────────────────────────────── */
const CATEGORY_TAXONOMY_FALLBACK = [
  {
    name: "Electronics",
    slug: "electronics",
    deal_count: 24156,
    image: "/assets/categories/electronics.png",
    subcategories: [
      { name: "Mobiles & Tablets", slug: "mobiles-tablets" },
      { name: "Laptops & Accessories", slug: "laptops-accessories" },
      { name: "TV & Home Entertainment", slug: "tv-home-entertainment" },
      { name: "Audio", slug: "audio" },
      { name: "Cameras & Photography", slug: "cameras-photography" },
      { name: "Wearables", slug: "wearables" },
      { name: "PC Components", slug: "pc-components" },
      { name: "Gaming", slug: "gaming" },
    ],
  },
  {
    name: "Home & Living",
    slug: "home-living",
    deal_count: 18974,
    image: "/assets/categories/home-living.png",
    subcategories: [
      { name: "Furniture", slug: "furniture" },
      { name: "Home Decor", slug: "home-decor" },
      { name: "Lighting", slug: "lighting" },
      { name: "Bedding & Linen", slug: "bedding-linen" },
      { name: "Kitchen & Dining", slug: "kitchen-dining" },
      { name: "Home Appliances", slug: "home-appliances" },
      { name: "Bathroom", slug: "bathroom" },
      { name: "Cleaning Appliances", slug: "cleaning-appliances" },
    ],
  },
  {
    name: "Fashion",
    slug: "fashion",
    deal_count: 32541,
    image: "/assets/categories/fashion.png",
    subcategories: [
      { name: "Men", slug: "men" },
      { name: "Women", slug: "women" },
      { name: "Shoes", slug: "shoes" },
      { name: "Watches", slug: "watches" },
      { name: "Bags & Luggage", slug: "bags-luggage" },
      { name: "Jewellery", slug: "jewellery" },
      { name: "Accessories", slug: "accessories" },
      { name: "Sunglasses", slug: "sunglasses" },
    ],
  },
  {
    name: "Beauty & Personal Care",
    slug: "beauty-personal-care",
    deal_count: 12675,
    image: "/assets/categories/beauty-personal-care.png",
    subcategories: [
      { name: "Skincare", slug: "skincare" },
      { name: "Makeup", slug: "makeup" },
      { name: "Hair Care", slug: "hair-care" },
      { name: "Fragrances", slug: "fragrances" },
      { name: "Bath & Body", slug: "bath-body" },
      { name: "Personal Care Appliances", slug: "personal-care-appliances" },
      { name: "Men's Grooming", slug: "mens-grooming" },
      { name: "Health Care", slug: "health-care" },
    ],
  },
  {
    name: "Sports & Fitness",
    slug: "sports-fitness",
    deal_count: 8562,
    image: "/assets/categories/sports-fitness.png",
    subcategories: [
      { name: "Exercise Equipment", slug: "exercise-equipment" },
      { name: "Fitness Accessories", slug: "fitness-accessories" },
      { name: "Sportswear", slug: "sportswear" },
      { name: "Footwear", slug: "footwear" },
      { name: "Outdoor Recreation", slug: "outdoor-recreation" },
      { name: "Yoga & Meditation", slug: "yoga-meditation" },
      { name: "Sports Nutrition", slug: "sports-nutrition" },
    ],
  },
  {
    name: "Automotive",
    slug: "automotive",
    deal_count: 6843,
    image: "/assets/categories/automotive.png",
    subcategories: [
      { name: "Car Accessories", slug: "car-accessories" },
      { name: "Motorcycle Accessories", slug: "motorcycle-accessories" },
      { name: "Car Electronics", slug: "car-electronics" },
      { name: "Tyres & Rims", slug: "tyres-rims" },
      { name: "Car Care & Cleaning", slug: "car-care-cleaning" },
      { name: "Helmets & Riding Gear", slug: "helmets-riding-gear" },
      { name: "Tools & Equipment", slug: "tools-equipment" },
    ],
  },
  {
    name: "Baby & Kids",
    slug: "baby-kids",
    deal_count: 7952,
    image: "/assets/categories/baby-kids.png",
    subcategories: [
      { name: "Baby Gear", slug: "baby-gear" },
      { name: "Toys & Games", slug: "toys-games" },
      { name: "Baby Care", slug: "baby-care" },
      { name: "Kids Fashion", slug: "kids-fashion" },
      { name: "Feeding & Nursing", slug: "feeding-nursing" },
      { name: "Baby Safety", slug: "baby-safety" },
      { name: "Nursery", slug: "nursery" },
    ],
  },
  {
    name: "Books & Stationery",
    slug: "books-stationery",
    deal_count: 5378,
    image: "/assets/categories/books-stationery.png",
    subcategories: [
      { name: "Books", slug: "books" },
      { name: "School Books", slug: "school-books" },
      { name: "Office Supplies", slug: "office-supplies" },
      { name: "Writing Instruments", slug: "writing-instruments" },
      { name: "Art & Craft", slug: "art-craft" },
      { name: "Notebooks & Diaries", slug: "notebooks-diaries" },
      { name: "Printers & Ink", slug: "printers-ink" },
    ],
  },
  {
    name: "Grocery & Essentials",
    slug: "grocery-essentials",
    deal_count: 9214,
    image: "/assets/categories/grocery-essentials.png",
    subcategories: [
      { name: "Food & Beverages", slug: "food-beverages" },
      { name: "Snacks & Branded Foods", slug: "snacks-branded-foods" },
      { name: "Personal Care Essentials", slug: "personal-care-essentials" },
      { name: "Household Essentials", slug: "household-essentials" },
      { name: "Baby Essentials", slug: "baby-essentials" },
      { name: "Pet Essentials", slug: "pet-essentials" },
    ],
  },
  {
    name: "Health & Nutrition",
    slug: "health-nutrition",
    deal_count: 6207,
    image: "/assets/categories/health-nutrition.png",
    subcategories: [
      { name: "Vitamins & Supplements", slug: "vitamins-supplements" },
      { name: "Health Care Devices", slug: "health-care-devices" },
      { name: "Ayurveda & Herbal", slug: "ayurveda-herbal" },
      { name: "Protein & Fitness Nutrition", slug: "protein-fitness-nutrition" },
      { name: "Health Foods", slug: "health-foods" },
      { name: "Medical Supplies", slug: "medical-supplies" },
    ],
  },
  {
    name: "Toys & Games",
    slug: "toys-games",
    deal_count: 8119,
    image: "/assets/categories/toys-games.png",
    subcategories: [
      { name: "Action Figures", slug: "action-figures" },
      { name: "Building Sets", slug: "building-sets" },
      { name: "Board Games", slug: "board-games" },
      { name: "Educational Toys", slug: "educational-toys" },
      { name: "Remote Control Toys", slug: "remote-control-toys" },
      { name: "Puzzles", slug: "puzzles" },
      { name: "Outdoor Toys", slug: "outdoor-toys" },
    ],
  },
  {
    name: "Pet Supplies",
    slug: "pet-supplies",
    deal_count: 5089,
    image: "/assets/categories/pet-supplies.png",
    subcategories: [
      { name: "Pet Food", slug: "pet-food" },
      { name: "Pet Accessories", slug: "pet-accessories" },
      { name: "Grooming", slug: "grooming" },
      { name: "Health Care", slug: "health-care" },
      { name: "Toys", slug: "toys" },
      { name: "Beds & Furniture", slug: "beds-furniture" },
      { name: "Aquarium Supplies", slug: "aquarium-supplies" },
    ],
  },
  {
    name: "Office Supplies",
    slug: "office-supplies",
    deal_count: 4392,
    image: "/assets/categories/office-supplies.png",
    subcategories: [
      { name: "Office Furniture", slug: "office-furniture" },
      { name: "Paper & Stationery", slug: "paper-stationery" },
      { name: "Ink & Toner", slug: "ink-toner" },
      { name: "Office Electronics", slug: "office-electronics" },
      { name: "Storage & Organization", slug: "storage-organization" },
    ],
  },
  {
    name: "Musical Instruments",
    slug: "musical-instruments",
    deal_count: 3246,
    image: "/assets/categories/musical-instruments.png",
    subcategories: [
      { name: "Guitars", slug: "guitars" },
      { name: "Keyboards", slug: "keyboards" },
      { name: "Drums & Percussion", slug: "drums-percussion" },
      { name: "Studio Equipment", slug: "studio-equipment" },
      { name: "DJ & Audio Gear", slug: "dj-audio-gear" },
      { name: "String Instruments", slug: "string-instruments" },
    ],
  },
  {
    name: "Travel & Luggage",
    slug: "travel-luggage",
    deal_count: 6721,
    image: "/assets/categories/travel-luggage.png",
    subcategories: [
      { name: "Suitcases & Trolleys", slug: "suitcases-trolleys" },
      { name: "Backpacks", slug: "backpacks" },
      { name: "Travel Accessories", slug: "travel-accessories" },
      { name: "Travel Essentials", slug: "travel-essentials" },
      { name: "Duffel Bags", slug: "duffel-bags" },
      { name: "Laptop Bags", slug: "laptop-bags" },
    ],
  },
];

const POPULAR_SEARCHES_FALLBACK = [
  "Air Fryer",
  "Smart Watch",
  "iPhone 15",
  "Gaming Laptop",
  "TV 55 inch",
  "Shoes",
  "Refrigerator",
];

/* ─── Safe HTML Escaping ─────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escRe(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const re = new RegExp(`(${escRe(query)})`, "gi");
  return escHtml(text).replace(re, `<mark class="cat-hl">$1</mark>`);
}

function fmtDeals(n) {
  return Number(n || 0).toLocaleString("en-IN") + " deals";
}

/* ─── Search Index Builder ───────────────────────────────────────────────── */
function buildSearchIndex(taxonomy) {
  const index = [];
  taxonomy.forEach((cat) => {
    // Top-level entry
    index.push({
      name: cat.name,
      slug: cat.slug,
      type: "Category",
      parentName: null,
      parentSlug: null,
      url: `/categories/${cat.slug}`,
      image: cat.image,
    });
    // Subcategory entries
    (cat.subcategories || []).forEach((sub) => {
      index.push({
        name: sub.name,
        slug: sub.slug,
        type: "Subcategory",
        parentName: cat.name,
        parentSlug: cat.slug,
        url: `/categories/${cat.slug}/${sub.slug}`,
        image: cat.image,
      });
    });
  });
  return index;
}

function searchIndex(index, query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const exact = [];
  const starts = [];
  const partial = [];

  index.forEach((item) => {
    const n = item.name.toLowerCase();
    const p = item.parentName ? item.parentName.toLowerCase() : "";
    if (n === q) {
      exact.push(item);
    } else if (n.startsWith(q)) {
      starts.push(item);
    } else if (n.includes(q) || p.includes(q)) {
      partial.push(item);
    }
  });

  return [...exact, ...starts, ...partial].slice(0, 24);
}

/* ─── Render Category Cards (4x4 Grid + Setup Card) ─────────────────────── */
function renderCategoryCards(taxonomy) {
  const grid = document.getElementById("catCardsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  taxonomy.forEach((cat) => {
    const card = document.createElement("div");
    card.className = "cat-card";
    card.id = `cat-card-${cat.slug}`;
    card.setAttribute("data-slug", cat.slug);
    card.setAttribute("aria-label", `${cat.name} — ${fmtDeals(cat.deal_count)}`);

    const subListHtml = (cat.subcategories || [])
      .slice(0, 8)
      .map(
        (sub) =>
          `<li><a href="/categories/${cat.slug}/${sub.slug}">${escHtml(sub.name)}</a></li>`
      )
      .join("");

    card.innerHTML = `
      <div class="cat-card-image-wrap">
        <img 
          src="${escHtml(cat.image)}" 
          alt="${escHtml(cat.name)}" 
          class="cat-card-img" 
          loading="lazy" 
          decoding="async"
        >
      </div>
      <div class="cat-card-body">
        <div class="cat-card-name">${escHtml(cat.name)}</div>
        <div class="cat-card-deal-count">${fmtDeals(cat.deal_count)}</div>
        <ul class="cat-card-subcat-list">${subListHtml}</ul>
        <div class="cat-card-action-arrow" aria-hidden="true">→</div>
      </div>
    `;

    // Click card navigates to category
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return; // Let subcategory links work normally
      trackEvent("category_click", { category_slug: cat.slug, category_name: cat.name });
      window.location.href = `/categories/${cat.slug}`;
    });

    grid.appendChild(card);
  });

  // Card 16: "Build your perfect setup"
  const setupCard = document.createElement("div");
  setupCard.className = "cat-setup-card";
  setupCard.id = "catSetupCard";
  setupCard.innerHTML = `
    <div class="cat-setup-card-title">Build your<br>perfect setup</div>
    <div class="cat-setup-card-desc">Tell us what you need and your budget. We'll build it for you.</div>
    <a href="/#setup" class="cat-setup-card-btn" id="catSetupBtn" aria-label="Build a setup">
      Build a Setup →
    </a>
    <img 
      src="/assets/categories/setup-chair.png" 
      alt="Custom Setup" 
      class="cat-setup-card-art" 
      loading="lazy" 
      decoding="async"
    >
  `;

  setupCard.addEventListener("click", (e) => {
    trackEvent("custom_setup_click", { source: "categories_card_16" });
    window.location.href = "/#setup";
  });

  grid.appendChild(setupCard);
}

/* ─── Render Sidebar Navigation ─────────────────────────────────────────── */
function renderSidebar(taxonomy) {
  const nav = document.getElementById("catSidebarNav");
  if (!nav) return;
  nav.innerHTML = "";

  // 1. "All Categories" default button
  const allLi = document.createElement("li");
  allLi.className = "cat-sidebar-item";
  allLi.innerHTML = `
    <button class="cat-sidebar-link active" data-cat-slug="all" aria-label="All Categories">
      <span class="cat-sidebar-icon">${getCategoryIcon("all")}</span>
      <span class="cat-sidebar-name">All Categories</span>
      <span class="cat-sidebar-chevron">›</span>
    </button>
  `;
  nav.appendChild(allLi);

  // 2. All 15 root categories
  taxonomy.forEach((cat) => {
    const li = document.createElement("li");
    li.className = "cat-sidebar-item";
    li.innerHTML = `
      <button class="cat-sidebar-link" data-cat-slug="${escHtml(cat.slug)}" aria-label="${escHtml(cat.name)}">
        <span class="cat-sidebar-icon">${getCategoryIcon(cat.slug)}</span>
        <span class="cat-sidebar-name">${escHtml(cat.name)}</span>
        <span class="cat-sidebar-chevron">›</span>
      </button>
    `;
    nav.appendChild(li);
  });
}

/* ─── Sidebar Nav Click Handler ─────────────────────────────────────────── */
function initSidebarNav() {
  const nav = document.getElementById("catSidebarNav");
  if (!nav) return;

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-sidebar-link");
    if (!btn) return;

    const slug = btn.getAttribute("data-cat-slug");
    selectCategory(slug);
  });
}

function selectCategory(slug) {
  const nav = document.getElementById("catSidebarNav");
  if (!nav) return;

  // Clear search if open
  const searchInput = document.getElementById("catSearchInput");
  const resultsSection = document.getElementById("catSearchResultsSection");
  const regularContent = document.getElementById("catRegularContent");

  if (searchInput && resultsSection && regularContent) {
    if (resultsSection.classList.contains("visible")) {
      searchInput.value = "";
      resultsSection.classList.remove("visible");
      regularContent.classList.remove("search-hidden");
    }
  }

  // Update active state in sidebar
  nav.querySelectorAll(".cat-sidebar-link").forEach((b) => {
    const isTarget = b.getAttribute("data-cat-slug") === slug;
    b.classList.toggle("active", isTarget);
  });

  // Remove existing highlights
  document.querySelectorAll(".cat-card.highlighted").forEach((c) => {
    c.classList.remove("highlighted");
  });

  if (slug === "all") {
    const grid = document.getElementById("catCardsGrid");
    if (grid) {
      grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    trackEvent("sidebar_filter", { category: "all" });
    return;
  }

  // Scroll to and highlight targeted card
  const targetCard = document.getElementById(`cat-card-${slug}`);
  if (targetCard) {
    targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
    targetCard.classList.add("highlighted");

    setTimeout(() => {
      targetCard.classList.remove("highlighted");
    }, 2800);

    trackEvent("sidebar_filter", { category: slug });
  }
}

/* ─── Popular Search Chips ──────────────────────────────────────────────── */
function renderPopularChips(chips, searchInput) {
  const row = document.getElementById("catPopularChipsRow");
  if (!row || !chips) return;
  row.innerHTML = "";

  chips.forEach((chip) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-popular-chip";
    btn.textContent = chip;
    btn.setAttribute("aria-label", `Search for ${chip}`);
    btn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = chip;
        searchInput.dispatchEvent(new Event("input"));
        searchInput.focus();
        trackEvent("popular_chip_click", { query: chip });
      }
    });
    row.appendChild(btn);
  });
}

/* ─── Search Input Implementation ───────────────────────────────────────── */
function initSearch(idx) {
  const input = document.getElementById("catSearchInput");
  const resultsSection = document.getElementById("catSearchResultsSection");
  const resultsGrid = document.getElementById("catSearchResultsGrid");
  const regularContent = document.getElementById("catRegularContent");
  const resultsTitle = document.getElementById("catSearchResultsTitle");

  if (!input || !resultsSection || !resultsGrid || !regularContent) return;

  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = input.value.trim();

      if (q.length < 2) {
        resultsSection.classList.remove("visible");
        regularContent.classList.remove("search-hidden");
        return;
      }

      const results = searchIndex(idx, q);

      resultsSection.classList.add("visible");
      regularContent.classList.add("search-hidden");

      if (resultsTitle) {
        resultsTitle.textContent =
          results.length > 0
            ? `${results.length} result${results.length !== 1 ? "s" : ""} for "${q}"`
            : `No results for "${q}"`;
      }

      resultsGrid.innerHTML = "";

      if (results.length === 0) {
        resultsGrid.innerHTML = `
          <div class="cat-empty-state">
            <div class="cat-empty-icon">🔍</div>
            <div class="cat-empty-title">No matching categories or products found</div>
            <div class="cat-empty-desc">Try searching for broader terms like "Electronics", "Fashion", "Laptop", or "Shoes".</div>
          </div>
        `;
        trackEvent("search_no_results", { query: q });
        return;
      }

      results.forEach((item) => {
        const itemCard = document.createElement("a");
        itemCard.className = "cat-inline-result-card";
        itemCard.href = item.url;
        itemCard.innerHTML = `
          <div class="cat-inline-result-icon">
            <img src="${escHtml(item.image)}" alt="" style="width:28px;height:28px;object-fit:contain;">
          </div>
          <div class="cat-inline-result-info">
            <div class="cat-inline-result-name">${highlight(item.name, q)}</div>
            ${item.parentName ? `<div class="cat-inline-result-parent">in ${escHtml(item.parentName)}</div>` : `<div class="cat-inline-result-parent">Main Category</div>`}
          </div>
        `;
        resultsGrid.appendChild(itemCard);
      });

      trackEvent("search_executed", { query: q, results_count: results.length });
    }, 180);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      resultsSection.classList.remove("visible");
      regularContent.classList.remove("search-hidden");
    }
  });
}

/* ─── API Fetchers ───────────────────────────────────────────────────────── */
async function fetchCategories() {
  try {
    const res = await fetch("/api/categories");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data.map((apiCat) => {
        const fallback = CATEGORY_TAXONOMY_FALLBACK.find((f) => f.slug === apiCat.slug);
        return {
          name: apiCat.name || fallback?.name || "",
          slug: apiCat.slug || fallback?.slug || "",
          deal_count: apiCat.deal_count || fallback?.deal_count || 0,
          image: apiCat.image || fallback?.image || `/assets/categories/${apiCat.slug}.png`,
          subcategories: (apiCat.subcategories || fallback?.subcategories || []).map((s) => ({
            name: s.name,
            slug: s.slug,
          })),
        };
      });
    }
  } catch (err) {
    console.warn("[DealSense] API /api/categories fetch failed, using fallback:", err);
  }
  return CATEGORY_TAXONOMY_FALLBACK;
}

async function fetchPopularSearches() {
  try {
    const res = await fetch("/api/categories/popular");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.popular)) {
      return data.popular;
    }
  } catch (_) {
    // Fallback quietly
  }
  return POPULAR_SEARCHES_FALLBACK;
}

/* ─── Main Initialization ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  trackEvent("categories_page_load");

  // 1. Fetch categories and popular chips from backend APIs
  const [taxonomy, popularChips] = await Promise.all([
    fetchCategories(),
    fetchPopularSearches(),
  ]);

  // 2. Render sidebar and 4x4 cards grid
  renderSidebar(taxonomy);
  renderCategoryCards(taxonomy);

  // 3. Build search index & initialize search functionality
  const idx = buildSearchIndex(taxonomy);
  initSearch(idx);

  // 4. Render popular chips
  renderPopularChips(popularChips, document.getElementById("catSearchInput"));

  // 5. Initialize sidebar click events
  initSidebarNav();

  // 6. Handle URL hash or ?cat= query param on load
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get("cat") || (window.location.hash ? window.location.hash.replace("#", "") : null);

  if (catParam) {
    setTimeout(() => {
      selectCategory(catParam);
    }, 150);
  }
});
