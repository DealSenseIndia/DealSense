// ==========================================================================
// DEALWISE TRACKED DEALS & WATCHLIST CONTROLLER
// Manages real-time price drop alerts, drawer slide-out, and deletion.
// ==========================================================================

import { escapeHtml, showToast } from "./ui.js";

export function initTrackedDealsDrawer({ onAnalyzeUrl } = {}) {
  const backdrop = document.getElementById("trackedDealsDrawerBackdrop");
  const drawer = document.getElementById("trackedDealsDrawer");
  const closeBtn = document.getElementById("closeTrackedDrawerBtn");
  const listContainer = document.getElementById("trackedDealsList");
  const countBadge = document.getElementById("drawerActiveAlertsCount");

  // Trigger buttons across header and PDP
  const headerTrackBtn = document.getElementById("headerTrackNavBtn");
  const pdpTrackPriceBtn = document.getElementById("pdpTrackPriceBtn");
  const pdpWishlistBtn = document.getElementById("pdpWishlistBtn");

  async function openDrawer() {
    if (!backdrop || !drawer) return;
    backdrop.style.display = "flex";
    // Force reflow for smooth CSS slide transition
    void drawer.offsetWidth;
    backdrop.classList.add("active");
    drawer.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");

    await refreshAlerts();
  }

  function closeDrawer() {
    if (!backdrop || !drawer) return;
    drawer.classList.remove("open");
    backdrop.classList.remove("active");
    backdrop.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      if (!backdrop.classList.contains("active")) {
        backdrop.style.display = "none";
      }
    }, 280);
  }

  async function refreshAlerts() {
    if (!listContainer) return;
    listContainer.innerHTML = `
      <div style="padding:40px 20px; text-align:center; color:#64748B; font-size:13px;">
        <svg class="btn-spinner-ring" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" style="display:inline-block; margin-bottom:10px;">
          <circle cx="12" cy="12" r="10" stroke="rgba(16,185,129,0.2)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#10B981" stroke-linecap="round"></path>
        </svg>
        <div>Loading your tracked price alerts...</div>
      </div>
    `;

    try {
      const resp = await fetch("/api/alerts");
      if (!resp.ok) throw new Error("Could not fetch alerts");
      const alerts = await resp.json();

      if (countBadge) {
        countBadge.textContent = `${alerts.length} Active`;
      }

      if (!alerts || alerts.length === 0) {
        listContainer.innerHTML = `
          <div class="drawer-empty-state">
            <span class="drawer-empty-ico">🔕</span>
            <h4 class="drawer-empty-title">No Active Price Watches</h4>
            <p class="drawer-empty-desc">
              You haven't set any price drop alerts yet. Search for any product and set a target price to get instant WhatsApp alerts!
            </p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = alerts.map((a) => {
        const isWa = a.channel === "whatsapp";
        const channelClass = isWa ? "whatsapp" : "email";
        const channelLabel = isWa ? `💬 WhatsApp (${escapeHtml(a.contact)})` : `✉️ Email (${escapeHtml(a.contact)})`;
        const targetStr = `₹${Math.round(a.target_price).toLocaleString("en-IN")}`;
        const curStr = `₹${Math.round(a.current_price).toLocaleString("en-IN")}`;
        const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "Recently";

        return `
          <div class="tracked-alert-card" data-alert-id="${a.id}">
            <div class="alert-card-top-row">
              <span class="alert-card-title">${escapeHtml(a.product_title)}</span>
              <button class="btn-delete-alert" data-id="${a.id}" title="Remove alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>

            <div class="alert-card-pricing-row">
              <div class="alert-target-col">
                <span class="alert-lbl">Target Price</span>
                <span class="alert-target-val">${targetStr}</span>
              </div>
              <div class="alert-cur-col">
                <span class="alert-lbl">Current Price</span>
                <span class="alert-cur-val">${curStr}</span>
              </div>
            </div>

            <div class="alert-card-meta-row">
              <span class="alert-channel-chip ${channelClass}">${channelLabel}</span>
              <span class="alert-date-txt">Active since ${dateStr}</span>
            </div>
          </div>
        `;
      }).join("");

      // Bind delete buttons
      listContainer.querySelectorAll(".btn-delete-alert").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const alertId = btn.getAttribute("data-id");
          btn.disabled = true;

          try {
            const delResp = await fetch(`/api/alerts/${alertId}`, { method: "DELETE" });
            if (delResp.ok) {
              const card = listContainer.querySelector(`.tracked-alert-card[data-alert-id="${alertId}"]`);
              if (card) {
                card.style.opacity = "0";
                card.style.transform = "translateX(20px)";
                setTimeout(() => {
                  card.remove();
                  const remaining = listContainer.querySelectorAll(".tracked-alert-card").length;
                  if (countBadge) countBadge.textContent = `${remaining} Active`;
                  if (remaining === 0) refreshAlerts();
                }, 200);
              }
              showToast("Price alert removed.", "success");
            } else {
              showToast("Could not remove alert.", "error");
              btn.disabled = false;
            }
          } catch {
            showToast("Network error removing alert.", "error");
            btn.disabled = false;
          }
        });
      });

    } catch (err) {
      listContainer.innerHTML = `
        <div style="padding:30px 20px; text-align:center; color:#EF4444; font-size:13px;">
          Failed to load active alerts. Please check your connection.
        </div>
      `;
    }
  }

  // Event Listeners
  if (headerTrackBtn) {
    headerTrackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  const headerBellBtn = document.getElementById("headerBellBtn");
  if (headerBellBtn) {
    headerBellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  if (pdpTrackPriceBtn) {
    pdpTrackPriceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  if (pdpWishlistBtn) {
    pdpWishlistBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDrawer();
    });
  }

  return { openDrawer, closeDrawer, refreshAlerts };
}
