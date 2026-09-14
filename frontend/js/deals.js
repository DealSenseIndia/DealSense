/**
 * DealSense — All Deals Page Controller
 *
 * Every number rendered here comes from /api/deals/live, which is built from
 * recorded PriceObservation rows. This file contains no product data.
 *
 * Rules this file follows:
 *   1. A price, MRP or discount that the API did not send renders as "--".
 *      It is never defaulted to 0, and never derived from another number.
 *   2. The sparkline is drawn only from real observed prices, and only when
 *      there are at least SPARKLINE_MIN_POINTS of them. There is no synthetic
 *      curve and no placeholder shape.
 *   3. "Prices just dropped" is computed by comparing the two most recent real
 *      observations. If nothing actually dropped, the section hides itself
 *      rather than showing filler.
 *   4. Only Amazon and Flipkart are in scope, so listings from any other
 *      merchant are filtered out rather than displayed.
 */

(function () {
  'use strict';

  // Quality tiers are a presentation band over the engine's deal_score.
  // Thresholds are declared here so the label on a card can always be traced
  // back to a number the engine produced.
  const QUALITY_HOT_MIN = 80;
  const QUALITY_GREAT_MIN = 60;

  // "Best" pill uses the same bar as a hot deal — a strong, engine-scored deal.
  const BEST_SCORE_MIN = QUALITY_HOT_MIN;

  // A sparkline needs enough points to describe a trend. Two points is a
  // straight line between two numbers and implies a trend we cannot support.
  const SPARKLINE_MIN_POINTS = 3;

  const SUPPORTED_MERCHANTS = ['amazon', 'flipkart'];

  const PRICE_FILTER_MAX = 100000;

  // --- WISHLIST STORAGE (with one-time migration from the old brand key) ---
  const WISHLIST_KEY = 'dealsense_wishlist';
  const LEGACY_WISHLIST_KEY = 'dealwise_wishlist';

  function loadWishlist() {
    try {
      const current = localStorage.getItem(WISHLIST_KEY);
      if (current) return new Set(JSON.parse(current));

      // Read-through migration: users who saved items under the old brand key
      // keep their wishlist.
      const legacy = localStorage.getItem(LEGACY_WISHLIST_KEY);
      if (legacy) {
        localStorage.setItem(WISHLIST_KEY, legacy);
        return new Set(JSON.parse(legacy));
      }
    } catch (e) {
      console.warn('Wishlist could not be read; starting empty.', e);
    }
    return new Set();
  }

  // --- STATE ---
  const state = {
    allDeals: [],
    filteredDeals: [],
    droppedDeals: [],
    activePill: 'trending',
    qualityFilters: new Set(),
    categoryFilters: new Set(),
    storeFilters: new Set(),
    minDiscount: 0,
    minPrice: 0,
    maxPrice: PRICE_FILTER_MAX,
    sortBy: 'popular',
    wishlist: loadWishlist(),
    loadError: null,
  };

  // --- FORMATTING ---

  /** Formats a rupee value, or "--" when the value genuinely isn't known. */
  function formatINR(val) {
    if (typeof val !== 'number' || !isFinite(val)) return '--';
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  /** Turns an ISO timestamp into "8 min ago". Returns null if unparseable. */
  function relativeTime(iso) {
    if (!iso) return null;
    const then = new Date(iso);
    if (isNaN(then.getTime())) return null;

    const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  /** Escapes text before it goes anywhere near innerHTML. */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- SPARKLINE (real observations only) ---

  /**
   * Draws a sparkline from actual observed prices.
   * Returns a caption instead of a graphic when there isn't enough history,
   * so a thin price record is visible rather than disguised.
   */
  function renderSparkline(priceHistory) {
    const points = (priceHistory || [])
      .map((p) => (typeof p.price === 'number' ? p.price : null))
      .filter((p) => p !== null && p > 0);

    if (points.length < SPARKLINE_MIN_POINTS) {
      return `<span class="deal-sparkline-empty">Not enough price history yet</span>`;
    }

    const width = 120;
    const height = 24;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min;

    // A genuinely flat price is drawn as a flat line, not stretched to fill
    // the box — the shape should reflect the data.
    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = range === 0
        ? height / 2
        : height - 4 - ((val - min) / range) * (height - 8);
      return { x, y };
    });

    let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx = prev.x + (curr.x - prev.x) / 2;
      d += ` C ${cx.toFixed(1)},${prev.y.toFixed(1)} ${cx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }

    // Falling price is green, rising is amber — matched to the actual direction.
    const rising = points[points.length - 1] > points[0];
    const stroke = rising ? '#F59E0B' : '#22C55E';
    const label = `${points.length} recorded prices, ${formatINR(min)} to ${formatINR(max)}`;

    return `
      <svg viewBox="0 0 ${width} ${height}" class="deal-sparkline-svg" preserveAspectRatio="none"
           role="img" aria-label="${escapeHtml(label)}">
        <title>${escapeHtml(label)}</title>
        <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  // --- NORMALISATION ---

  /**
   * Maps an API deal onto the card model.
   * Missing values stay null so the renderer can show "--"; nothing is
   * invented or back-calculated here.
   */
  function normaliseDeal(d, index) {
    const merchant = (d.merchant || '').trim();
    const merchantLower = merchant.toLowerCase();
    const isFlipkart = merchantLower.includes('flipkart');

    const price = typeof d.price === 'number' && d.price > 0 ? d.price : null;
    const mrp = typeof d.mrp === 'number' && d.mrp > price ? d.mrp : null;
    const discountPct = typeof d.discount_pct === 'number' && d.discount_pct > 0
      ? d.discount_pct
      : null;
    const score = typeof d.deal_score === 'number' ? d.deal_score : null;

    let quality = 'good';
    if (score !== null) {
      if (score >= QUALITY_HOT_MIN) quality = 'hot';
      else if (score >= QUALITY_GREAT_MIN) quality = 'great';
    }

    const history = Array.isArray(d.price_history) ? d.price_history : [];

    // A real drop: the newest observation is below the one before it.
    let dropPct = null;
    let previousPrice = null;
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      if (last?.price > 0 && prev?.price > 0 && last.price < prev.price) {
        previousPrice = prev.price;
        dropPct = Math.round(((prev.price - last.price) / prev.price) * 100);
      }
    }

    return {
      id: d.id || `deal_live_${index}`,
      title: d.title || 'Untitled listing',
      brand: d.brand || '',
      category: (d.category || '').toLowerCase(),
      price,
      mrp,
      discount_pct: discountPct,
      deal_score: score,
      deal_quality: quality,
      // The badge string is produced by the engine, so it is shown verbatim.
      badge_text: d.deal_badge || null,
      badge_type: quality,
      verdict: d.verdict || null,
      confidence: d.confidence || null,
      // tagline is built from the engine's evidence list.
      verdict_note: d.tagline || null,
      historical_low: typeof d.historical_low === 'number' ? d.historical_low : null,
      observation_count: d.observation_count || history.length,
      has_sufficient_history: Boolean(d.has_sufficient_history),
      store: merchant || (isFlipkart ? 'Flipkart' : 'Amazon'),
      store_logo: d.merchant_logo || (isFlipkart ? '/assets/flipkart-icon.svg' : '/assets/amazon-logo.svg'),
      image: d.image_url || null,
      url: d.affiliate_url || d.url || null,
      price_history: history,
      observed_at: d.observed_at || null,
      drop_pct: dropPct,
      previous_price: previousPrice,
      source: d.source || 'pipeline_crawler',
    };
  }

  // --- FETCH & INITIALISE ---

  async function initDeals() {
    const grid = document.getElementById('dealsGrid');
    if (grid) {
      grid.innerHTML = `<div class="deals-loading-state">Loading tracked deals…</div>`;
    }

    // Initialize Trending Coupons strip in parallel
    initCoupons();

    try {
      const resp = await fetch('/api/deals/live');
      if (!resp.ok) {
        throw new Error(`Deals feed returned ${resp.status}`);
      }
      const data = await resp.json();

      state.allDeals = (data.deals || [])
        .map(normaliseDeal)
        // Verified Cuelinks promotions and Amazon/Flipkart listings are included.
        .filter((d) => d.source === 'cuelinks_verified' || SUPPORTED_MERCHANTS.some((m) => d.store.toLowerCase().includes(m)))
        // A listing with no usable price cannot be shown as a deal.
        .filter((d) => d.price !== null);

      state.droppedDeals = state.allDeals
        .filter((d) => d.drop_pct !== null && d.drop_pct > 0)
        .sort((a, b) => b.drop_pct - a.drop_pct);

      state.loadError = null;
    } catch (e) {
      console.error('Could not load the deals feed:', e);
      state.allDeals = [];
      state.droppedDeals = [];
      state.loadError = e.message || 'The deals feed is unavailable.';
    }

    setupEventListeners();
    renderDeals();
    renderPricesJustDropped();
  }

  async function initCoupons() {
    const container = document.getElementById('dealsCouponsContainer');
    const section = document.getElementById('dealsCouponsSection');
    if (!container) return;

    try {
      const resp = await fetch('/api/coupons/trending?limit=12');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const coupons = data.coupons || [];
      if (!coupons.length) {
        if (section) section.style.display = 'none';
        return;
      }

      container.innerHTML = coupons.map((c, idx) => {
        const safeCode = escapeHtml(c.coupon_code || '');
        const safeStore = escapeHtml(c.store_name || 'Verified Store');
        const safeTitle = escapeHtml(c.title || 'Special Promotional Offer');
        const safeBadge = escapeHtml(c.discount_badge || 'SPECIAL OFFER');
        const safeExpiry = escapeHtml(c.expiry_display || 'Limited Time');
        const safeLogo = escapeHtml(c.store_logo || '/assets/dealsense-icon.png');
        const safeUrl = escapeHtml(c.tracking_url || '#');

        return `
          <div class="coupon-card" data-coupon-id="${c.id || idx}">
            <div>
              <div class="coupon-card-top">
                <div class="coupon-store-info">
                  <img src="${safeLogo}" alt="${safeStore}" class="coupon-store-logo" loading="lazy" onerror="this.src='/assets/dealsense-icon.png'">
                  <span class="coupon-store-name">${safeStore}</span>
                </div>
                <span class="coupon-verified-badge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Verified
                </span>
              </div>
              <div class="coupon-discount-headline">
                <span>🏷️</span>
                <span>${safeBadge}</span>
              </div>
              <p class="coupon-desc" title="${safeTitle}">${safeTitle}</p>
            </div>
            <div>
              <div class="coupon-code-box">
                <span class="coupon-code-text">${safeCode}</span>
                <button type="button" class="btn-copy-coupon" data-code="${safeCode}" data-store="${safeStore}" data-url="${safeUrl}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Copy</span>
                </button>
              </div>
              <div class="coupon-card-footer">
                <span class="coupon-expiry">⏳ ${safeExpiry}</span>
                <a href="${safeUrl}" target="_blank" rel="noopener sponsored" class="coupon-shop-link">Shop Store →</a>
              </div>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-copy-coupon').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const code = btn.getAttribute('data-code');
          const store = btn.getAttribute('data-store');
          const url = btn.getAttribute('data-url');
          try {
            await navigator.clipboard.writeText(code);
            btn.classList.add('copied');
            btn.innerHTML = `<span>Copied! ✓</span>`;
            setTimeout(() => {
              if (url && url !== '#') window.open(url, '_blank');
            }, 350);
            setTimeout(() => {
              btn.classList.remove('copied');
              btn.innerHTML = `<span>Copy</span>`;
            }, 2500);
          } catch (err) {
            console.warn(err);
          }
        });
      });

      const prevBtn = document.getElementById('dealsCouponPrevBtn');
      const nextBtn = document.getElementById('dealsCouponNextBtn');
      if (prevBtn) prevBtn.onclick = () => container.scrollBy({ left: -320, behavior: 'smooth' });
      if (nextBtn) nextBtn.onclick = () => container.scrollBy({ left: 320, behavior: 'smooth' });
    } catch (e) {
      if (section) section.style.display = 'none';
    }
  }

  // --- FILTER + SORT ---

  function applyFilters() {
    return state.allDeals.filter((deal) => {
      if (state.activePill === 'best' && (deal.deal_score === null || deal.deal_score < BEST_SCORE_MIN)) return false;
      if (state.activePill === 'drops' && !(deal.drop_pct > 0)) return false;
      if (state.activePill === 'under999' && deal.price > 999) return false;
      if (state.activePill === 'under2499' && deal.price > 2499) return false;
      if (state.activePill === 'under5000' && deal.price > 5000) return false;
      if (state.activePill === 'electronics' && !['mobiles', 'laptops', 'audio', 'tv', 'tvs', 'electronics', 'smartwatches'].includes(deal.category)) return false;
      if (state.activePill === 'home' && !['home', 'kitchen', 'appliances', 'home-living'].includes(deal.category)) return false;
      if (state.activePill === 'fashion' && !['fashion', 'clothing', 'shoes'].includes(deal.category)) return false;

      if (state.qualityFilters.size > 0 && !state.qualityFilters.has(deal.deal_quality)) return false;

      if (state.categoryFilters.size > 0) {
        const catMatch = Array.from(state.categoryFilters).some((cat) => {
          if (cat === 'mobiles') return ['mobiles', 'smartphones'].includes(deal.category);
          if (cat === 'laptops') return ['laptops', 'computers'].includes(deal.category);
          if (cat === 'tv') return ['tv', 'tvs', 'television'].includes(deal.category);
          if (cat === 'audio') return ['audio', 'headphones', 'earphones'].includes(deal.category);
          if (cat === 'home') return ['home', 'kitchen', 'appliances'].includes(deal.category);
          return deal.category.includes(cat);
        });
        if (!catMatch) return false;
      }

      if (state.storeFilters.size > 0) {
        const storeLower = deal.store.toLowerCase();
        const storeMatch = Array.from(state.storeFilters).some((s) => storeLower.includes(s));
        if (!storeMatch) return false;
      }

      // A deal with no known discount is excluded when a discount floor is set,
      // rather than being treated as 0%.
      if (state.minDiscount > 0 && (deal.discount_pct === null || deal.discount_pct < state.minDiscount)) return false;

      if (deal.price < state.minPrice || deal.price > state.maxPrice) return false;

      return true;
    });
  }

  function sortDeals(deals) {
    const sorted = [...deals];
    if (state.sortBy === 'popular') {
      // "Popular" ranks by the engine's score, so the ordering is explainable.
      sorted.sort((a, b) => (b.deal_score ?? -1) - (a.deal_score ?? -1));
    } else if (state.sortBy === 'discount') {
      sorted.sort((a, b) => (b.discount_pct ?? -1) - (a.discount_pct ?? -1));
    } else if (state.sortBy === 'price_asc') {
      sorted.sort((a, b) => a.price - b.price);
    } else if (state.sortBy === 'price_desc') {
      sorted.sort((a, b) => b.price - a.price);
    }
    return sorted;
  }

  // --- RENDER: MAIN GRID ---

  function renderDeals() {
    const grid = document.getElementById('dealsGrid');
    if (!grid) return;

    if (state.loadError) {
      grid.innerHTML = `
        <div class="deals-error-state">
          <p class="deals-state-title">Couldn't load deals</p>
          <p class="deals-state-body">${escapeHtml(state.loadError)} Make sure the DealSense server is running, then try again.</p>
          <button id="dealsRetryBtn" class="deals-state-btn">Try again</button>
        </div>
      `;
      const retry = document.getElementById('dealsRetryBtn');
      if (retry) retry.addEventListener('click', initDeals);
      updateResultCount(0);
      return;
    }

    if (state.allDeals.length === 0) {
      grid.innerHTML = `
        <div class="deals-empty-state">
          <p class="deals-state-title">No tracked deals yet</p>
          <p class="deals-state-body">
            DealSense only shows products it has actually recorded a price for.
            Run the tracker to start building price history, then refresh this page.
          </p>
        </div>
      `;
      updateResultCount(0);
      return;
    }

    const filtered = sortDeals(applyFilters());
    state.filteredDeals = filtered;
    updateResultCount(filtered.length);

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="deals-empty-state">
          <p class="deals-state-title">No deals match your filters</p>
          <p class="deals-state-body">Try widening the price range or clearing a filter.</p>
          <button id="resetFiltersInnerBtn" class="deals-state-btn">Reset all filters</button>
        </div>
      `;
      const innerBtn = document.getElementById('resetFiltersInnerBtn');
      if (innerBtn) innerBtn.addEventListener('click', clearAllFilters);
      return;
    }

    grid.innerHTML = filtered.map(renderDealCard).join('');

    grid.querySelectorAll('.deal-heart-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWishlist(btn.getAttribute('data-wish-id'), btn);
      });
    });
  }

  function renderDealCard(deal) {
    const isWishlisted = state.wishlist.has(deal.id);
    const observedLabel = relativeTime(deal.observed_at);

    const badge = deal.badge_text
      ? `<span class="deal-badge badge-${escapeHtml(deal.badge_type)}">${escapeHtml(deal.badge_text)}</span>`
      : `<span class="deal-badge badge-neutral">Tracked</span>`;

    const media = deal.image
      ? `<img src="${escapeHtml(deal.image)}" alt="${escapeHtml(deal.title)}" class="deal-product-img" loading="lazy">`
      : `<div class="deal-product-img deal-product-img-empty" role="img" aria-label="No product image available">No image</div>`;

    const mrpHtml = deal.mrp
      ? `<span class="deal-price-was">${formatINR(deal.mrp)}</span>`
      : '';
    const offHtml = deal.discount_pct
      ? `<span class="deal-price-off">${Math.round(deal.discount_pct)}% OFF</span>`
      : '';

    const verdictHtml = deal.verdict
      ? `<div class="deal-verdict-row">
           <span class="deal-verdict-tag verdict-${escapeHtml((deal.verdict || '').toLowerCase().replace(/\s+/g, '-'))}">
             ${escapeHtml(deal.verdict)}
           </span>
           ${deal.confidence ? `<span class="deal-confidence">${escapeHtml(deal.confidence)} confidence</span>` : ''}
         </div>`
      : '';

    const noteHtml = deal.verdict_note
      ? `<div class="deal-verdict-note">${escapeHtml(deal.verdict_note)}</div>`
      : '';

    // Say so plainly when the verdict rests on a thin record.
    const historyCaveat = deal.has_sufficient_history
      ? ''
      : `<div class="deal-history-caveat">Based on ${deal.observation_count} recorded price${deal.observation_count === 1 ? '' : 's'} — verdict is provisional</div>`;

    const buyHtml = deal.url
      ? `<a href="${escapeHtml(deal.url)}" target="_blank" rel="noopener sponsored" class="deal-view-btn">View Deal</a>`
      : `<span class="deal-view-btn deal-view-btn-disabled" aria-disabled="true">Link unavailable</span>`;

    return `
      <article class="deal-card" data-deal-id="${escapeHtml(deal.id)}">
        <div class="deal-card-top">
          ${badge}
          <button class="deal-heart-btn ${isWishlisted ? 'active' : ''}" data-wish-id="${escapeHtml(deal.id)}"
                  title="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}"
                  aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}"
                  aria-pressed="${isWishlisted}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>

        <div class="deal-product-media">${media}</div>

        <h3 class="deal-product-title" title="${escapeHtml(deal.title)}">${escapeHtml(deal.title)}</h3>

        <div class="deal-price-row">
          <div class="deal-price-left">
            <span class="deal-price-now">${formatINR(deal.price)}</span>
            ${mrpHtml}
          </div>
          ${offHtml}
        </div>

        ${verdictHtml}
        ${noteHtml}
        ${historyCaveat}

        <div class="deal-sparkline-wrap">${renderSparkline(deal.price_history)}</div>

        <div class="deal-card-footer">
          <img src="${escapeHtml(deal.store_logo)}" alt="${escapeHtml(deal.store)}" class="deal-store-logo" loading="lazy">
          ${observedLabel ? `<span class="deal-observed-at">Checked ${escapeHtml(observedLabel)}</span>` : ''}
          ${buyHtml}
        </div>
      </article>
    `;
  }

  function updateResultCount(count) {
    const el = document.getElementById('dealsResultCount');
    if (el) el.textContent = String(count);
  }

  // --- RENDER: PRICES JUST DROPPED ---

  function renderPricesJustDropped() {
    const container = document.getElementById('droppedCardsRow');
    if (!container) return;

    // The whole section hides when nothing genuinely dropped, rather than
    // filling the strip with items that did not move.
    const section = container.closest('section') || container.parentElement;

    if (state.droppedDeals.length === 0) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      return;
    }

    if (section) section.style.display = '';

    container.innerHTML = state.droppedDeals.slice(0, 12).map((item) => {
      const when = relativeTime(item.observed_at);
      const media = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="dropped-img" loading="lazy">`
        : `<div class="dropped-img dropped-img-empty" role="img" aria-label="No product image available"></div>`;

      return `
        <a class="dropped-card" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener sponsored">
          <div class="dropped-img-wrap">${media}</div>
          <div class="dropped-info">
            <div class="dropped-tag-row"><span aria-hidden="true">↓</span> ${item.drop_pct}%</div>
            <div class="dropped-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="dropped-prices">
              <span class="dropped-price-now">${formatINR(item.price)}</span>
              <span class="dropped-price-was">${formatINR(item.previous_price)}</span>
            </div>
            <div class="dropped-bot-row">
              ${when ? `<span class="dropped-time">${escapeHtml(when)}</span>` : '<span class="dropped-time">--</span>'}
              <img src="${escapeHtml(item.store_logo)}" alt="${escapeHtml(item.store)}" class="dropped-store-logo" loading="lazy">
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  // --- WISHLIST ---

  function toggleWishlist(dealId, btn) {
    if (!dealId) return;
    const nowActive = !state.wishlist.has(dealId);

    if (nowActive) state.wishlist.add(dealId);
    else state.wishlist.delete(dealId);

    btn.classList.toggle('active', nowActive);
    btn.setAttribute('aria-pressed', String(nowActive));
    btn.setAttribute('aria-label', nowActive ? 'Remove from wishlist' : 'Add to wishlist');
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', nowActive ? 'currentColor' : 'none');

    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(Array.from(state.wishlist)));
    } catch (e) {
      console.warn('Wishlist could not be saved.', e);
    }
  }

  // --- FILTER RESET ---

  function clearAllFilters() {
    state.qualityFilters.clear();
    state.categoryFilters.clear();
    state.storeFilters.clear();
    state.minDiscount = 0;
    state.minPrice = 0;
    state.maxPrice = PRICE_FILTER_MAX;
    state.activePill = 'trending';

    document.querySelectorAll('.filter-checkbox-input').forEach((cb) => { cb.checked = false; });

    const minSlider = document.getElementById('priceMinSlider');
    const maxSlider = document.getElementById('priceMaxSlider');
    if (minSlider) minSlider.value = 0;
    if (maxSlider) maxSlider.value = PRICE_FILTER_MAX;
    updatePriceSliderUI(0, PRICE_FILTER_MAX);

    document.querySelectorAll('.deals-pill-btn').forEach((pill) => {
      const isDefault = pill.dataset.pill === 'trending';
      pill.classList.toggle('active', isDefault);
      pill.setAttribute('aria-selected', String(isDefault));
    });

    renderDeals();
  }

  // --- PRICE SLIDER ---

  function updatePriceSliderUI(minVal, maxVal) {
    const fill = document.getElementById('priceSliderFill');
    const minBadge = document.getElementById('priceMinBadge');
    const maxBadge = document.getElementById('priceMaxBadge');

    const minPct = (minVal / PRICE_FILTER_MAX) * 100;
    const maxPct = (maxVal / PRICE_FILTER_MAX) * 100;

    if (fill) {
      fill.style.left = `${minPct}%`;
      fill.style.width = `${Math.max(0, maxPct - minPct)}%`;
    }
    if (minBadge) minBadge.textContent = formatINR(minVal);
    if (maxBadge) {
      maxBadge.textContent = maxVal >= PRICE_FILTER_MAX ? '₹1,00,000+' : formatINR(maxVal);
    }
  }

  // --- EVENT LISTENERS ---

  let listenersBound = false;

  function setupEventListeners() {
    // initDeals() can run again via the retry button, so binding is guarded.
    if (listenersBound) return;
    listenersBound = true;

    // Header Search & Analyze Redirect to homepage analyzer
    const headerSearchInput = document.getElementById('headerSearch');
    const headerAnalyzeBtn = headerSearchInput?.parentElement?.querySelector('button');
    const handleHeaderAnalyze = () => {
      const val = headerSearchInput?.value?.trim();
      if (!val) return;
      window.location.href = `/?url=${encodeURIComponent(val)}`;
    };
    if (headerSearchInput) {
      headerSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleHeaderAnalyze();
        }
      });
    }
    if (headerAnalyzeBtn) {
      headerAnalyzeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleHeaderAnalyze();
      });
    }

    document.querySelectorAll('.deals-pill-btn').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.deals-pill-btn').forEach((p) => {
          p.classList.remove('active');
          p.setAttribute('aria-selected', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-selected', 'true');
        state.activePill = pill.dataset.pill || 'trending';
        renderDeals();
      });
    });

    const sortSelect = document.getElementById('dealsSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderDeals();
      });
    }

    const clearBtn = document.getElementById('dealsClearAllBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);

    document.querySelectorAll('input[name="deal_quality"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.qualityFilters.add(cb.value);
        else state.qualityFilters.delete(cb.value);
        renderDeals();
      });
    });

    document.querySelectorAll('input[name="deal_category"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.categoryFilters.add(cb.value);
        else state.categoryFilters.delete(cb.value);
        renderDeals();
      });
    });

    // Discount checkboxes behave like radios: only one floor at a time.
    document.querySelectorAll('input[name="deal_discount"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          document.querySelectorAll('input[name="deal_discount"]').forEach((other) => {
            if (other !== cb) other.checked = false;
          });
          state.minDiscount = parseInt(cb.value, 10) || 0;
        } else {
          state.minDiscount = 0;
        }
        renderDeals();
      });
    });

    document.querySelectorAll('input[name="deal_store"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.storeFilters.add(cb.value.toLowerCase());
        else state.storeFilters.delete(cb.value.toLowerCase());
        renderDeals();
      });
    });

    const storeSearch = document.getElementById('storeSearchInput');
    if (storeSearch) {
      storeSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.store-filter-item').forEach((item) => {
          const storeName = (item.dataset.storeName || '').toLowerCase();
          item.style.display = storeName.includes(query) ? 'flex' : 'none';
        });
      });
    }

    const minSlider = document.getElementById('priceMinSlider');
    const maxSlider = document.getElementById('priceMaxSlider');
    if (minSlider && maxSlider) {
      // Each handler knows which slider it belongs to, rather than reading the
      // deprecated global `event`.
      const handleSliderChange = (movedMin) => {
        let minVal = parseInt(minSlider.value, 10);
        let maxVal = parseInt(maxSlider.value, 10);

        if (minVal > maxVal - 1000) {
          if (movedMin) {
            minVal = Math.max(0, maxVal - 1000);
            minSlider.value = String(minVal);
          } else {
            maxVal = Math.min(PRICE_FILTER_MAX, minVal + 1000);
            maxSlider.value = String(maxVal);
          }
        }

        state.minPrice = minVal;
        state.maxPrice = maxVal;
        updatePriceSliderUI(minVal, maxVal);
        renderDeals();
      };

      minSlider.addEventListener('input', () => handleSliderChange(true));
      maxSlider.addEventListener('input', () => handleSliderChange(false));
    }

    const droppedNextBtn = document.getElementById('droppedNextBtn');
    const droppedRow = document.getElementById('droppedCardsRow');
    if (droppedNextBtn && droppedRow) {
      droppedNextBtn.addEventListener('click', () => {
        droppedRow.scrollBy({ left: 300, behavior: 'smooth' });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeals);
  } else {
    initDeals();
  }
})();
