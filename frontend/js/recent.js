// ==========================================================================
// DEALWISE RECENT PRODUCTS & LOCALSTORAGE MANAGER
// ==========================================================================

export function saveRecentProduct(data, originalUrl) {
  if (!data || !data.product) return;
  const prod = data.product;
  const pricing = data.pricing || {};
  const listing = data.listing || {};

  const currentPrice = pricing.current_price
    ? `₹${Math.round(pricing.current_price).toLocaleString("en-IN")}`
    : "";
  const mrp = pricing.mrp
    ? `₹${Math.round(pricing.mrp).toLocaleString("en-IN")}`
    : "";
  const discount = pricing.discount_pct && pricing.discount_pct > 0
    ? `${Math.round(pricing.discount_pct)}% OFF`
    : "";

  const recentItem = {
    title: prod.title || "Analyzed Product",
    subspec: prod.brand ? `${prod.brand} • ${listing.merchant || "Verified"}` : (listing.merchant || "Featured Deal"),
    price: currentPrice,
    mrp: mrp,
    discount: discount,
    image_url: prod.image_url || "/assets/apple-watch-s9.png",
    url: originalUrl || (listing.clean_url || "https://www.amazon.in/dp/B0CHX6PXX6"),
    badge: "Recently Viewed",
  };

  try {
    localStorage.setItem("dealwise_recent_product", JSON.stringify(recentItem));
  } catch (e) {
    console.warn("Could not save recent product to localStorage", e);
  }

  renderRecentHeroProduct(recentItem);
}

export function renderRecentHeroProduct(item) {
  if (!item) return;
  const titleEl = document.getElementById("heroFeaturedTitle");
  const subspecEl = document.getElementById("heroFeaturedSubspec");
  const imgEl = document.getElementById("heroFeaturedImg");
  const priceEl = document.getElementById("heroFeaturedPrice");
  const mrpEl = document.getElementById("heroFeaturedMrp");
  const discEl = document.getElementById("heroFeaturedDisc");
  const badgeEl = document.getElementById("heroFeaturedBadge");
  const cardEl = document.getElementById("heroFeaturedDealCard");
  const btnEl = document.getElementById("heroFeaturedViewBtn");

  if (titleEl && item.title) {
    titleEl.textContent = item.title;
    titleEl.title = item.title;
  }
  if (subspecEl && item.subspec) subspecEl.textContent = item.subspec;
  if (imgEl && item.image_url) imgEl.src = item.image_url;
  if (priceEl && item.price) priceEl.textContent = item.price;
  if (mrpEl) {
    if (item.mrp) {
      mrpEl.textContent = item.mrp;
      mrpEl.style.display = "inline";
    } else {
      mrpEl.style.display = "none";
    }
  }
  if (discEl) {
    if (item.discount) {
      discEl.textContent = item.discount;
      discEl.style.display = "inline-block";
    } else {
      discEl.style.display = "none";
    }
  }
  if (badgeEl && item.badge) badgeEl.textContent = item.badge;
  if (cardEl && item.url) cardEl.setAttribute("data-url", item.url);
  if (btnEl && item.url) btnEl.setAttribute("data-url", item.url);
}

export function initRecentProduct() {
  try {
    const saved = localStorage.getItem("dealwise_recent_product");
    if (saved) {
      const item = JSON.parse(saved);
      renderRecentHeroProduct(item);
    }
  } catch (e) {
    console.warn("Could not load recent product from localStorage", e);
  }
}
