/**
 * DealSense — All Deals Page Interactive Controller
 * Connects live deals feed, sparkline generator, multi-facet filtering,
 * price range slider, and wishlist interactions.
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    allDeals: [],
    filteredDeals: [],
    activePill: 'trending',
    qualityFilters: new Set(),
    categoryFilters: new Set(),
    storeFilters: new Set(),
    minDiscount: 0,
    minPrice: 0,
    maxPrice: 100000,
    sortBy: 'popular',
    wishlist: new Set(JSON.parse(localStorage.getItem('dealwise_wishlist') || '[]')),
  };

  // --- REFERENCE FEATURED DEALS (Exact match to screenshot) ---
  const REFERENCE_DEALS = [
    {
      id: 'ref_airpods_4',
      title: 'Apple AirPods 4',
      brand: 'Apple',
      category: 'audio',
      price: 11999,
      mrp: 16900,
      discount_pct: 29,
      deal_quality: 'good',
      badge_text: 'HOT DEAL',
      badge_type: 'hot',
      verdict: 'Good Deal',
      verdict_type: 'good',
      verdict_note: '12% below typical price',
      store: 'Amazon',
      store_logo: '/assets/amazon-logo.svg',
      image: '/assets/deals/products/airpods-4.png',
      url: 'https://www.amazon.in/dp/B0DGHN6P4X?tag=dealintel-21',
      sparkline: [120, 135, 125, 140, 130, 150, 140, 130, 145, 135, 140, 160],
      is_trending: true,
      is_best: false,
    },
    {
      id: 'ref_dell_3530',
      title: 'Dell Inspiron 3530 Laptop',
      brand: 'Dell',
      category: 'laptops',
      price: 38990,
      mrp: 54590,
      discount_pct: 29,
      deal_quality: 'great',
      badge_text: 'GREAT DEAL',
      badge_type: 'great',
      verdict: 'Great Deal',
      verdict_type: 'great',
      verdict_note: '18% below typical price',
      store: 'Flipkart',
      store_logo: '/assets/flipkart-logo.svg',
      image: '/assets/deals/products/dell-laptop.png',
      url: 'https://www.flipkart.com/dell-inspiron-core-i3-13th-gen-3530-thin-and-light-laptop/p/itm19b0bb862562d?affid=dealintel',
      sparkline: [140, 130, 155, 145, 160, 150, 135, 145, 140, 155, 145, 135],
      is_trending: true,
      is_best: true,
    },
    {
      id: 'ref_iphone_15',
      title: 'iPhone 15 (128GB)',
      brand: 'Apple',
      category: 'mobiles',
      price: 59999,
      mrp: 69900,
      discount_pct: 14,
      deal_quality: 'good',
      badge_text: 'HOT DEAL',
      badge_type: 'hot',
      verdict: 'Good Deal',
      verdict_type: 'good',
      verdict_note: 'Near 6-month low',
      store: 'Amazon',
      store_logo: '/assets/amazon-logo.svg',
      image: '/assets/deals/products/iphone-15.png',
      url: 'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY?tag=dealintel-21',
      sparkline: [130, 145, 135, 150, 140, 160, 150, 135, 145, 140, 155, 165],
      is_trending: true,
      is_best: false,
    },
    {
      id: 'ref_samsung_tv',
      title: 'Samsung 55" 4K TV',
      brand: 'Samsung',
      category: 'tv',
      price: 38490,
      mrp: 59900,
      discount_pct: 36,
      deal_quality: 'great',
      badge_text: 'GREAT DEAL',
      badge_type: 'great',
      verdict: 'Great Deal',
      verdict_type: 'great',
      verdict_note: '22% below typical price',
      store: 'Flipkart',
      store_logo: '/assets/flipkart-logo.svg',
      image: '/assets/deals/products/samsung-tv.png',
      url: 'https://www.flipkart.com/samsung-crystal-4k-55-inch-ultra-hd-4k-smart-tv/p/itm5e4dbcaeaef2b?affid=dealintel',
      sparkline: [145, 135, 150, 140, 160, 150, 135, 145, 135, 150, 140, 155],
      is_trending: true,
      is_best: true,
    },
    {
      id: 'ref_boat_wave',
      title: 'boAt Wave Call 2',
      brand: 'boAt',
      category: 'audio',
      price: 1299,
      mrp: 2299,
      discount_pct: 43,
      deal_quality: 'good',
      badge_text: 'HOT DEAL',
      badge_type: 'hot',
      verdict: 'Good Deal',
      verdict_type: 'good',
      verdict_note: 'Near 3-month low',
      store: 'Myntra',
      store_logo: '/assets/myntra-logo.svg',
      image: '/assets/deals/products/boat-watch.png',
      url: 'https://www.myntra.com/smart-watches/boat/boat-wave-call-2/24589012/buy',
      sparkline: [135, 145, 130, 155, 140, 150, 135, 145, 135, 155, 140, 150],
      is_trending: true,
      is_best: false,
    },
    {
      id: 'ref_philips_airfryer',
      title: 'Philips Air Fryer NA120',
      brand: 'Philips',
      category: 'home',
      price: 4706,
      mrp: 6995,
      discount_pct: 34,
      deal_quality: 'good',
      badge_text: 'GREAT DEAL',
      badge_type: 'great',
      verdict: 'Good Deal',
      verdict_type: 'good',
      verdict_note: '8% below typical price',
      store: 'Amazon',
      store_logo: '/assets/amazon-logo.svg',
      image: '/assets/deals/products/philips-airfryer.png',
      url: 'https://www.amazon.in/dp/B0CX21C8S9?tag=dealintel-21',
      sparkline: [125, 140, 135, 150, 145, 160, 140, 145, 135, 150, 140, 155],
      is_trending: true,
      is_best: true,
    },
  ];

  // --- DROPPED DEALS FEED (Exact match to mockup strip) ---
  const DROPPED_DEALS = [
    {
      title: 'OnePlus Nord 4',
      drop_pct: 12,
      price: 26999,
      mrp: 30999,
      time: '8 min ago',
      store_logo: '/assets/amazon-logo.svg',
      image: '/assets/deals/dropped/nord-4.png',
      url: 'https://www.amazon.in/dp/B0D7MPK7H2?tag=dealintel-21',
    },
    {
      title: 'Sony WH-1000XM5',
      drop_pct: 18,
      price: 24990,
      mrp: 30499,
      time: '24 min ago',
      store_logo: '/assets/flipkart-icon.svg',
      image: '/assets/deals/dropped/sony-xm5.png',
      url: 'https://www.flipkart.com/sony-wh-1000xm5-bluetooth-headset/p/itmdb29cb93c4c92?affid=dealintel',
    },
    {
      title: 'HP Pavilion Laptop',
      drop_pct: 9,
      price: 41990,
      mrp: 45990,
      time: '35 min ago',
      store_logo: '/assets/amazon-logo.svg',
      image: '/assets/deals/dropped/hp-pavilion.png',
      url: 'https://www.amazon.in/dp/B0C39R57PT?tag=dealintel-21',
    },
    {
      title: 'LG 43" 4K TV',
      drop_pct: 14,
      price: 25990,
      mrp: 29990,
      time: '1 hr ago',
      store_logo: '/assets/flipkart-icon.svg',
      image: '/assets/deals/dropped/lg-tv.png',
      url: 'https://www.flipkart.com/lg-ur7500-108-cm-43-inch-ultra-hd-4k-smart-webos-tv/p/itm526f634560ea5?affid=dealintel',
    },
    {
      title: 'Noise ColorFit Pro 5',
      drop_pct: 21,
      price: 2999,
      mrp: 3799,
      time: '2 hrs ago',
      store_logo: '/assets/myntra-logo.svg',
      image: '/assets/deals/dropped/noise-watch.png',
      url: 'https://www.myntra.com/smart-watches/noise/noise-colorfit-pro-5/26394821/buy',
    },
    {
      title: 'Dyson V15 Detect',
      drop_pct: 16,
      price: 49900,
      mrp: 59900,
      time: '2 hrs ago',
      store_logo: '/assets/amazon-logo.svg',
      image: '/assets/deals/dropped/dyson-v15.png',
      url: 'https://www.amazon.in/dp/B09B3KCV7K?tag=dealintel-21',
    },
  ];

  // --- SVG SPARKLINE GENERATOR ---
  function generateSparklineSvg(points) {
    if (!points || points.length < 2) {
      points = [100, 95, 90, 85, 88, 80, 75];
    }
    const width = 120;
    const height = 24;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = (max - min) || 1;

    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      // Invert Y so lower price is lower in value but lower visually or visually indicating drop
      const y = height - 4 - ((val - min) / range) * (height - 8);
      return { x, y };
    });

    // Build smooth curve SVG path using bezier curves
    let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) / 2;
      const cy2 = curr.y;
      d += ` C ${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }

    return `
      <svg viewBox="0 0 ${width} ${height}" class="deal-sparkline-svg" preserveAspectRatio="none">
        <path d="${d}" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  // --- FORMAT CURRENCY ---
  function formatINR(val) {
    if (typeof val !== 'number') return '₹0';
    return '₹' + val.toLocaleString('en-IN');
  }

  // --- FETCH LIVE DEALS & INITIALIZE ---
  async function initDeals() {
    try {
      const resp = await fetch('/api/deals/live');
      if (resp.ok) {
        const data = await resp.json();
        const liveDeals = (data.deals || []).map((d, index) => {
          // Normalize live crawled deals to match our card model
          const isFlipkart = (d.merchant || '').toLowerCase().includes('flipkart');
          const category = (d.category || 'electronics').toLowerCase();
          const quality = d.deal_score >= 80 ? 'hot' : d.deal_score >= 60 ? 'great' : 'good';
          return {
            id: d.id || `deal_live_${index}`,
            title: d.title || 'Product Deal',
            brand: d.brand || '',
            category: category,
            price: d.price || 999,
            mrp: d.mrp || Math.round((d.price || 999) * 1.3),
            discount_pct: d.discount_pct || 25,
            deal_quality: quality,
            badge_text: quality === 'hot' ? 'HOT DEAL' : quality === 'great' ? 'GREAT DEAL' : 'GOOD DEAL',
            badge_type: quality,
            verdict: quality === 'great' ? 'Great Deal' : 'Good Deal',
            verdict_type: quality === 'great' ? 'great' : 'good',
            verdict_note: `${d.discount_pct || 20}% below typical price`,
            store: isFlipkart ? 'Flipkart' : 'Amazon',
            store_logo: isFlipkart ? '/assets/flipkart-logo.svg' : '/assets/amazon-logo.svg',
            image: d.image_url || '/assets/deals/products/airpods-4.png',
            url: d.affiliate_url || d.url || '#',
            sparkline: [d.mrp, d.mrp * 0.95, d.mrp * 0.9, d.price * 1.1, d.price],
            is_trending: index % 2 === 0,
            is_best: index % 3 === 0,
          };
        });

        // Merge: Reference deals first, then unique live deals
        const combined = [...REFERENCE_DEALS];
        liveDeals.forEach(ld => {
          if (!combined.some(c => c.title.toLowerCase() === ld.title.toLowerCase())) {
            combined.push(ld);
          }
        });
        state.allDeals = combined;
      } else {
        state.allDeals = [...REFERENCE_DEALS];
      }
    } catch (e) {
      console.warn('Could not fetch live deals, using reference dataset:', e);
      state.allDeals = [...REFERENCE_DEALS];
    }

    setupEventListeners();
    renderDeals();
    renderPricesJustDropped();
  }

  // --- RENDER MAIN DEALS GRID ---
  function renderDeals() {
    const grid = document.getElementById('dealsGrid');
    if (!grid) return;

    // Apply all filters
    const filtered = state.allDeals.filter(deal => {
      // Pill filter
      if (state.activePill === 'trending' && !deal.is_trending) return false;
      if (state.activePill === 'best' && !deal.is_best) return false;
      if (state.activePill === 'under999' && deal.price > 999) return false;
      if (state.activePill === 'under2499' && deal.price > 2499) return false;
      if (state.activePill === 'under5000' && deal.price > 5000) return false;
      if (state.activePill === 'electronics' && !['mobiles', 'laptops', 'audio', 'tv', 'electronics'].includes(deal.category)) return false;
      if (state.activePill === 'home' && !['home', 'kitchen', 'appliances', 'home-living'].includes(deal.category)) return false;
      if (state.activePill === 'fashion' && !['fashion', 'clothing', 'shoes'].includes(deal.category)) return false;

      // Quality filter
      if (state.qualityFilters.size > 0 && !state.qualityFilters.has(deal.deal_quality)) {
        return false;
      }

      // Category filter
      if (state.categoryFilters.size > 0) {
        const catMatch = Array.from(state.categoryFilters).some(cat => {
          if (cat === 'mobiles' && ['mobiles', 'smartphones'].includes(deal.category)) return true;
          if (cat === 'laptops' && ['laptops', 'computers'].includes(deal.category)) return true;
          if (cat === 'tv' && ['tv', 'television', 'entertainment'].includes(deal.category)) return true;
          if (cat === 'audio' && ['audio', 'headphones', 'earphones'].includes(deal.category)) return true;
          if (cat === 'home' && ['home', 'kitchen', 'appliances'].includes(deal.category)) return true;
          return deal.category.includes(cat);
        });
        if (!catMatch) return false;
      }

      // Store filter
      if (state.storeFilters.size > 0 && !state.storeFilters.has(deal.store.toLowerCase())) {
        return false;
      }

      // Discount filter
      if (deal.discount_pct < state.minDiscount) {
        return false;
      }

      // Price range filter
      if (deal.price < state.minPrice || deal.price > state.maxPrice) {
        return false;
      }

      return true;
    });

    // Apply sorting
    if (state.sortBy === 'popular') {
      filtered.sort((a, b) => {
        const refIndexA = REFERENCE_DEALS.findIndex(r => r.id === a.id);
        const refIndexB = REFERENCE_DEALS.findIndex(r => r.id === b.id);
        if (refIndexA !== -1 && refIndexB !== -1) {
          return refIndexA - refIndexB;
        }
        if (refIndexA !== -1) return -1;
        if (refIndexB !== -1) return 1;
        return (b.discount_pct * 10) - (a.discount_pct * 10);
      });
    } else if (state.sortBy === 'discount') {
      filtered.sort((a, b) => b.discount_pct - a.discount_pct);
    } else if (state.sortBy === 'price_asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (state.sortBy === 'price_desc') {
      filtered.sort((a, b) => b.price - a.price);
    }

    // Default pristine view: show 6 featured cards in one row matching mockup
    const isDefaultPristine = state.activePill === 'trending' &&
                              state.qualityFilters.size === 0 &&
                              state.categoryFilters.size === 0 &&
                              state.storeFilters.size === 0 &&
                              state.minDiscount === 0 &&
                              state.minPrice === 0 &&
                              state.maxPrice === 100000;

    const displayDeals = isDefaultPristine ? filtered.slice(0, 6) : filtered;
    state.filteredDeals = displayDeals;

    if (displayDeals.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px 20px; text-align: center; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px;">
          <p style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 6px;">No deals match your criteria</p>
          <p style="font-size: 13px; color: #64748B; margin: 0 0 16px;">Try adjusting your price range or resetting selected filters.</p>
          <button id="resetFiltersInnerBtn" style="padding: 6px 16px; background: #16A34A; color: #FFFFFF; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
            Reset All Filters
          </button>
        </div>
      `;
      const innerBtn = document.getElementById('resetFiltersInnerBtn');
      if (innerBtn) innerBtn.addEventListener('click', clearAllFilters);
      return;
    }

    grid.innerHTML = displayDeals.map(deal => {
      const isWishlisted = state.wishlist.has(deal.id);
      return `
        <article class="deal-card" data-deal-id="${deal.id}">
          <div class="deal-card-top">
            <span class="deal-badge badge-${deal.badge_type}">
              ${deal.badge_type === 'hot' ? '🔥' : '⭐'} ${deal.badge_text}
            </span>
            <button class="deal-heart-btn ${isWishlisted ? 'active' : ''}" data-wish-id="${deal.id}" title="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}" aria-label="Wishlist">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
          </div>

          <div class="deal-product-media">
            <img src="${deal.image}" alt="${deal.title}" class="deal-product-img" loading="lazy">
          </div>

          <h3 class="deal-product-title" title="${deal.title}">${deal.title}</h3>

          <div class="deal-price-row">
            <div class="deal-price-left">
              <span class="deal-price-now">${formatINR(deal.price)}</span>
              <span class="deal-price-was">${formatINR(deal.mrp)}</span>
            </div>
            <span class="deal-price-off">${deal.discount_pct}% OFF</span>
          </div>

          <div class="deal-verdict-row">
            <span class="deal-verdict-tag verdict-${deal.verdict_type}">
              ${deal.verdict_type === 'good' ? '✓' : '⭐'} ${deal.verdict}
            </span>
          </div>

          <div class="deal-verdict-note">${deal.verdict_note}</div>

          <div class="deal-sparkline-wrap">
            ${generateSparklineSvg(deal.sparkline)}
          </div>

          <div class="deal-card-footer">
            <img src="${deal.store_logo}" alt="${deal.store}" class="deal-store-logo" loading="lazy">
            <a href="${deal.url}" target="_blank" rel="noopener sponsored" class="deal-view-btn">View Deal</a>
          </div>
        </article>
      `;
    }).join('');

    // Attach wishlist listener
    grid.querySelectorAll('.deal-heart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dealId = btn.getAttribute('data-wish-id');
        toggleWishlist(dealId, btn);
      });
    });
  }

  // --- RENDER PRICES JUST DROPPED ---
  function renderPricesJustDropped() {
    const container = document.getElementById('droppedCardsRow');
    if (!container) return;

    container.innerHTML = DROPPED_DEALS.map(item => `
      <div class="dropped-card" onclick="window.open('${item.url}', '_blank')">
        <div class="dropped-img-wrap">
          <img src="${item.image}" alt="${item.title}" class="dropped-img" loading="lazy">
        </div>
        <div class="dropped-info">
          <div class="dropped-tag-row">
            <span>↓</span> ${item.drop_pct}%
          </div>
          <div class="dropped-title" title="${item.title}">${item.title}</div>
          <div class="dropped-prices">
            <span class="dropped-price-now">${formatINR(item.price)}</span>
            <span class="dropped-price-was">${formatINR(item.mrp)}</span>
          </div>
          <div class="dropped-bot-row">
            <span class="dropped-time">${item.time}</span>
            <img src="${item.store_logo}" alt="Store" class="dropped-store-logo" loading="lazy">
          </div>
        </div>
      </div>
    `).join('');
  }

  // --- WISHLIST TOGGLE ---
  function toggleWishlist(dealId, btn) {
    if (state.wishlist.has(dealId)) {
      state.wishlist.delete(dealId);
      btn.classList.remove('active');
      btn.querySelector('svg').setAttribute('fill', 'none');
    } else {
      state.wishlist.add(dealId);
      btn.classList.add('active');
      btn.querySelector('svg').setAttribute('fill', 'currentColor');
    }
    localStorage.setItem('dealwise_wishlist', JSON.stringify(Array.from(state.wishlist)));
  }

  // --- CLEAR ALL FILTERS ---
  function clearAllFilters() {
    state.qualityFilters.clear();
    state.categoryFilters.clear();
    state.storeFilters.clear();
    state.minDiscount = 0;
    state.minPrice = 0;
    state.maxPrice = 100000;
    state.activePill = 'trending';

    // Uncheck DOM checkboxes
    document.querySelectorAll('.filter-checkbox-input').forEach(cb => cb.checked = false);

    // Reset range sliders
    const minSlider = document.getElementById('priceMinSlider');
    const maxSlider = document.getElementById('priceMaxSlider');
    if (minSlider) minSlider.value = 0;
    if (maxSlider) maxSlider.value = 100000;
    updatePriceSliderUI(0, 100000);

    // Reset pills
    document.querySelectorAll('.deals-pill-btn').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.pill === 'trending');
    });

    renderDeals();
  }

  // --- PRICE SLIDER SYNC ---
  function updatePriceSliderUI(minVal, maxVal) {
    const fill = document.getElementById('priceSliderFill');
    const minBadge = document.getElementById('priceMinBadge');
    const maxBadge = document.getElementById('priceMaxBadge');

    const totalRange = 100000;
    const minPct = (minVal / totalRange) * 100;
    const maxPct = (maxVal / totalRange) * 100;

    if (fill) {
      fill.style.left = `${minPct}%`;
      fill.style.width = `${maxPct - minPct}%`;
    }

    if (minBadge) {
      minBadge.textContent = formatINR(minVal);
    }
    if (maxBadge) {
      maxBadge.textContent = maxVal >= 100000 ? '₹ 1,00,000+' : formatINR(maxVal);
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Quick pills
    document.querySelectorAll('.deals-pill-btn').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.deals-pill-btn').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.activePill = pill.dataset.pill || 'trending';
        renderDeals();
      });
    });

    // Sort select
    const sortSelect = document.getElementById('dealsSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderDeals();
      });
    }

    // Clear all button
    const clearBtn = document.getElementById('dealsClearAllBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearAllFilters);
    }

    // Quality checkboxes
    document.querySelectorAll('input[name="deal_quality"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          state.qualityFilters.add(cb.value);
        } else {
          state.qualityFilters.delete(cb.value);
        }
        renderDeals();
      });
    });

    // Category checkboxes
    document.querySelectorAll('input[name="deal_category"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          state.categoryFilters.add(cb.value);
        } else {
          state.categoryFilters.delete(cb.value);
        }
        renderDeals();
      });
    });

    // Discount checkboxes (acting as min threshold)
    document.querySelectorAll('input[name="deal_discount"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          // uncheck others for radio-like experience
          document.querySelectorAll('input[name="deal_discount"]').forEach(other => {
            if (other !== cb) other.checked = false;
          });
          state.minDiscount = parseInt(cb.value, 10);
        } else {
          state.minDiscount = 0;
        }
        renderDeals();
      });
    });

    // Store checkboxes
    document.querySelectorAll('input[name="deal_store"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          state.storeFilters.add(cb.value.toLowerCase());
        } else {
          state.storeFilters.delete(cb.value.toLowerCase());
        }
        renderDeals();
      });
    });

    // Store search input filter
    const storeSearch = document.getElementById('storeSearchInput');
    if (storeSearch) {
      storeSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.store-filter-item').forEach(item => {
          const storeName = item.dataset.storeName || '';
          if (storeName.toLowerCase().includes(query)) {
            item.style.display = 'flex';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }

    // Dual price range slider
    const minSlider = document.getElementById('priceMinSlider');
    const maxSlider = document.getElementById('priceMaxSlider');
    if (minSlider && maxSlider) {
      const handleSliderChange = () => {
        let minVal = parseInt(minSlider.value, 10);
        let maxVal = parseInt(maxSlider.value, 10);

        if (minVal > maxVal - 1000) {
          if (event && event.target === minSlider) {
            minSlider.value = maxVal - 1000;
            minVal = maxVal - 1000;
          } else {
            maxSlider.value = minVal + 1000;
            maxVal = minVal + 1000;
          }
        }

        state.minPrice = minVal;
        state.maxPrice = maxVal;
        updatePriceSliderUI(minVal, maxVal);
        renderDeals();
      };

      minSlider.addEventListener('input', handleSliderChange);
      maxSlider.addEventListener('input', handleSliderChange);
    }

    // Carousel next button
    const droppedNextBtn = document.getElementById('droppedNextBtn');
    const droppedRow = document.getElementById('droppedCardsRow');
    if (droppedNextBtn && droppedRow) {
      droppedNextBtn.addEventListener('click', () => {
        droppedRow.scrollBy({ left: 300, behavior: 'smooth' });
      });
    }
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeals);
  } else {
    initDeals();
  }
})();
