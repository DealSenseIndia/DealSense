// ==========================================================================
// DEALSENSE OMNI-SEARCH & AUTOCOMPLETE MODULE
// ==========================================================================

import { searchDeals } from "./api.js";
import { escapeHtml } from "./ui.js";

// --------------------------------------------------------------------------
// Result rendering helpers.
//
// The search API returns null for anything it has not actually observed:
// price, mrp, discount, rating, review count and image. These helpers render
// that absence honestly instead of printing NaN or inventing a fallback.
// --------------------------------------------------------------------------

function formatINR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function renderThumb(item) {
  if (!item.image_url) {
    return `<span class="search-result-thumb search-result-thumb-empty" role="img" aria-label="No image available"></span>`;
  }
  return `<img src="${escapeHtml(item.image_url)}" class="search-result-thumb" alt="${escapeHtml(item.title)}" loading="lazy">`;
}

function renderRating(item) {
  // Omitted entirely when unrecorded. A default star rating would be a
  // claim about the product that no observation supports.
  if (!Number.isFinite(Number(item.rating))) return "";
  const count = item.ratings_count ? ` (${escapeHtml(String(item.ratings_count))})` : "";
  return `<span>★ ${escapeHtml(String(item.rating))}${count}</span>`;
}

function renderDiscount(item) {
  const pct = Number(item.discount_pct);
  if (!Number.isFinite(pct) || pct <= 0) return "";
  return `<span class="search-result-off">${pct}% OFF</span>`;
}

function renderMrp(item) {
  // Struck-through MRP only when it is real and above the live price.
  const mrp = Number(item.mrp);
  const price = Number(item.price);
  if (!Number.isFinite(mrp) || !Number.isFinite(price) || mrp <= price) return "";
  return `<span class="search-result-mrp">${formatINR(mrp)}</span>`;
}

function renderResultRow(item) {
  return `
    <div class="search-result-row" data-url="${escapeHtml(item.url)}">
      <div class="search-result-left">
        ${renderThumb(item)}
        <div class="search-result-info">
          <span class="search-result-title">${escapeHtml(item.title)}</span>
          <div class="search-result-meta">
            <span class="search-merchant-tag">${escapeHtml(item.merchant || "")}</span>
            ${renderRating(item)}
            ${renderDiscount(item)}
          </div>
        </div>
      </div>
      <div class="search-result-right">
        <span class="search-result-price">${formatINR(item.price)}</span>
        ${renderMrp(item)}
      </div>
    </div>
  `;
}

export function initOmniSearch({ heroUrlInput, heroDealForm, searchResultsDropdown, searchResultsList, chipTriggers, onAnalyze }) {
  let searchDebounceTimer = null;

  // Popular tag & Chip fast-click triggers
  const allTriggers = (chipTriggers && chipTriggers.length > 0)
    ? chipTriggers
    : document.querySelectorAll(".chip-trigger, .popular-tag-pill");

  allTriggers.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = btn.getAttribute("data-url");
      const query = btn.getAttribute("data-query") || btn.textContent.trim();
      if (url) {
        if (heroUrlInput) heroUrlInput.value = url;
        onAnalyze(url);
      } else if (query) {
        if (heroUrlInput) heroUrlInput.value = query;
        executeSearch(query, false);
      }
    });
  });

  // Input debouncer for autocomplete vs URL detection
  if (heroUrlInput) {
    heroUrlInput.addEventListener("paste", () => {
      if (searchResultsDropdown) searchResultsDropdown.style.display = "none";
    });

    heroUrlInput.addEventListener("input", () => {
      const val = heroUrlInput.value.trim();
      clearTimeout(searchDebounceTimer);

      if (val.startsWith("http://") || val.startsWith("https://") || val.includes("amazon.in") || val.includes("flipkart.com") || val.length < 2) {
        if (searchResultsDropdown) searchResultsDropdown.style.display = "none";
        return;
      }

      searchDebounceTimer = setTimeout(() => {
        executeSearch(val);
      }, 280);
    });
  }

  async function executeSearch(query, autoAnalyzeFirst = false) {
    if (!searchResultsDropdown || !searchResultsList) return;
    try {
      searchResultsDropdown.style.display = "block";
      searchResultsList.innerHTML = `
        <div style="padding:20px; text-align:center; color:#64748B; font-size:13px;">
          <svg class="btn-spinner-ring" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3" style="display:inline-block; vertical-align:middle; margin-right:8px;">
            <circle cx="12" cy="12" r="10" stroke="rgba(22,163,74,0.2)"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#16A34A" stroke-linecap="round"></path>
          </svg>
          Searching live verified deals for "<strong>${escapeHtml(query)}</strong>"...
        </div>
      `;

      const data = await searchDeals(query, 6);

      if (!data.results || data.results.length === 0) {
        searchResultsList.innerHTML = `
          <div style="padding:20px; text-align:center; color:#64748B; font-size:13px;">
            Nothing tracked yet for "${escapeHtml(query)}". Paste an Amazon or Flipkart
            link and DealSense will start tracking it.
          </div>
        `;
        return;
      }

      if (autoAnalyzeFirst && data.results.length > 0) {
        const topMatch = data.results[0];
        searchResultsDropdown.style.display = "none";
        if (heroUrlInput) heroUrlInput.value = topMatch.url;
        onAnalyze(topMatch.url);
        return;
      }

      searchResultsList.innerHTML = data.results.map(renderResultRow).join("");

      // Attach click on each result row
      searchResultsList.querySelectorAll(".search-result-row").forEach((row) => {
        row.addEventListener("click", () => {
          const productUrl = row.getAttribute("data-url");
          searchResultsDropdown.style.display = "none";
          if (heroUrlInput) heroUrlInput.value = productUrl;
          onAnalyze(productUrl);
        });
      });
    } catch (err) {
      console.error("Search error:", err);
    }
  }

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (
      searchResultsDropdown &&
      heroDealForm &&
      !heroDealForm.contains(e.target) &&
      !searchResultsDropdown.contains(e.target) &&
      !e.target.closest(".popular-tag-pill") &&
      !e.target.closest(".chip-trigger")
    ) {
      searchResultsDropdown.style.display = "none";
    }
  });

  // Form submit handler
  if (heroDealForm) {
    heroDealForm.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const inputVal = heroUrlInput ? heroUrlInput.value.trim() : "";
      if (!inputVal) return false;

      const isUrl = (
        inputVal.startsWith("http://") ||
        inputVal.startsWith("https://") ||
        inputVal.startsWith("amazon.in") ||
        inputVal.startsWith("www.amazon.in") ||
        inputVal.startsWith("flipkart.com") ||
        inputVal.startsWith("www.flipkart.com") ||
        inputVal.startsWith("amzn.in") ||
        inputVal.startsWith("amzn.to") ||
        inputVal.includes("/dp/") ||
        inputVal.includes("/p/") ||
        inputVal.includes("dl.flipkart.com")
      );

      if (isUrl) {
        const targetUrl = (inputVal.startsWith("http://") || inputVal.startsWith("https://"))
          ? inputVal
          : `https://${inputVal}`;
        if (searchResultsDropdown) searchResultsDropdown.style.display = "none";
        onAnalyze(targetUrl);
      } else {
        executeSearch(inputVal, true);
      }
      return false;
    });
  }

  // Header Search Autocomplete & Quick Analysis
  const headerSearchInput = document.getElementById("headerSearch");
  const headerDropdown = document.getElementById("headerSearchDropdown");
  const headerList = document.getElementById("headerSearchResultsList");

  let headerDebounceTimer = null;
  if (headerSearchInput) {
    headerSearchInput.addEventListener("input", () => {
      const val = headerSearchInput.value.trim();
      clearTimeout(headerDebounceTimer);

      if (val.length < 2) {
        if (headerDropdown) headerDropdown.style.display = "none";
        return;
      }

      headerDebounceTimer = setTimeout(async () => {
        if (!headerDropdown || !headerList) return;
        headerDropdown.style.display = "block";
        headerList.innerHTML = `<div style="padding:16px; text-align:center; color:#64748B; font-size:12px;">Searching live verified deals for "${escapeHtml(val)}"...</div>`;
        try {
          const data = await searchDeals(val, 5);
          if (!data.results || data.results.length === 0) {
            headerList.innerHTML = `<div style="padding:16px; text-align:center; color:#64748B; font-size:12px;">Nothing tracked yet for "${escapeHtml(val)}".</div>`;
            return;
          }
          headerList.innerHTML = data.results.map(renderResultRow).join("");

          headerList.querySelectorAll(".search-result-row").forEach((row) => {
            row.addEventListener("click", () => {
              const url = row.getAttribute("data-url");
              headerDropdown.style.display = "none";
              headerSearchInput.value = "";
              onAnalyze(url);
            });
          });
        } catch (err) {
          headerList.innerHTML = `<div style="padding:16px; text-align:center; color:#EF4444; font-size:12px;">Error connecting to deal search.</div>`;
        }
      }, 250);
    });

    headerSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = headerSearchInput.value.trim();
        if (!val) return;
        const isUrl = (
          val.startsWith("http://") ||
          val.startsWith("https://") ||
          val.includes("amazon.in") ||
          val.includes("flipkart.com") ||
          val.includes("amzn.") ||
          val.includes("/dp/") ||
          val.includes("/p/")
        );
        if (isUrl) {
          const targetUrl = (val.startsWith("http://") || val.startsWith("https://")) ? val : `https://${val}`;
          if (headerDropdown) headerDropdown.style.display = "none";
          headerSearchInput.value = "";
          onAnalyze(targetUrl);
        } else {
          const firstRow = headerList?.querySelector(".search-result-row");
          if (firstRow) {
            const url = firstRow.getAttribute("data-url");
            if (headerDropdown) headerDropdown.style.display = "none";
            headerSearchInput.value = "";
            onAnalyze(url);
          }
        }
      }
    });

    document.addEventListener("click", (e) => {
      if (headerDropdown && !headerSearchInput.contains(e.target) && !headerDropdown.contains(e.target)) {
        headerDropdown.style.display = "none";
      }
    });
  }

  return { executeSearch };
}
