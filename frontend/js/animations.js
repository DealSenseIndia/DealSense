// ==========================================================================
// DEALSENSE ANIME.JS BUTTON & SYNCED INTERACTION ANIMATIONS
// ==========================================================================

let borderAnim = null;

export function startAnalyzingAnimation(heroSubmitBtn) {
  if (!heroSubmitBtn) return;
  heroSubmitBtn.disabled = true;
  heroSubmitBtn.classList.remove("is-verified");
  heroSubmitBtn._isAnalyzing = true;

  const btnDefault = heroSubmitBtn.querySelector(".btn-default-content");
  const btnLoading = heroSubmitBtn.querySelector(".btn-loading-content");
  const btnSuccess = heroSubmitBtn.querySelector(".btn-success-content");
  const btnProgressBorder = heroSubmitBtn.querySelector(".btn-progress-border");
  const progressBorderRect = heroSubmitBtn.querySelector(".progress-border-rect");
  const btnLoadingLabel = heroSubmitBtn.querySelector(".btn-loading-label");

  if (btnSuccess) btnSuccess.style.display = "none";
  if (btnProgressBorder) btnProgressBorder.style.opacity = "1";
  if (progressBorderRect) progressBorderRect.style.strokeDashoffset = "410";

  if (window.anime) {
    window.anime.remove(btnDefault);
    window.anime.remove(btnLoading);
    window.anime({
      targets: btnDefault,
      opacity: [1, 0],
      scale: [1, 0.88],
      duration: 180,
      easing: "easeOutQuad",
      complete: () => {
        if (!heroSubmitBtn._isAnalyzing) return;
        if (btnDefault) btnDefault.style.display = "none";
        if (btnLoading) {
          btnLoading.style.display = "inline-flex";
          btnLoading.style.opacity = "0";
          window.anime({
            targets: btnLoading,
            opacity: [0, 1],
            scale: [0.92, 1],
            duration: 220,
            easing: "easeOutQuad",
          });
        }
      },
    });

    // Animate progress border trace around button
    if (progressBorderRect) {
      window.anime.remove(progressBorderRect);
      borderAnim = window.anime({
        targets: progressBorderRect,
        strokeDashoffset: [410, 80],
        duration: 2200,
        easing: "easeInOutSine",
      });
    }
  } else {
    if (btnDefault) btnDefault.style.display = "none";
    if (btnLoading) btnLoading.style.display = "inline-flex";
  }

  // Dynamic micro-steps while analyzing in sync with backend
  let step = 0;
  const steps = ["Checking store...", "Verifying history...", "Evaluating deal..."];
  if (btnLoadingLabel) btnLoadingLabel.textContent = steps[0];
  clearInterval(heroSubmitBtn._labelTimer);
  heroSubmitBtn._labelTimer = setInterval(() => {
    if (!heroSubmitBtn._isAnalyzing) {
      clearInterval(heroSubmitBtn._labelTimer);
      return;
    }
    step = (step + 1) % steps.length;
    if (btnLoadingLabel) btnLoadingLabel.textContent = steps[step];
  }, 650);
}

export function finishAnalyzingAnimation(heroSubmitBtn, success, callback) {
  if (!heroSubmitBtn) {
    if (callback) callback();
    return;
  }
  heroSubmitBtn._isAnalyzing = false;
  clearInterval(heroSubmitBtn._labelTimer);
  heroSubmitBtn._labelTimer = null;

  const btnLoading = heroSubmitBtn.querySelector(".btn-loading-content");
  const btnSuccess = heroSubmitBtn.querySelector(".btn-success-content");
  const progressBorderRect = heroSubmitBtn.querySelector(".progress-border-rect");
  const checkPolyline = heroSubmitBtn.querySelector(".check-polyline");

  if (borderAnim) {
    try { borderAnim.pause(); } catch (e) {}
    borderAnim = null;
  }

  if (success && window.anime) {
    // Fast-forward border to 100% completion
    if (progressBorderRect) {
      window.anime({
        targets: progressBorderRect,
        strokeDashoffset: 0,
        duration: 200,
        easing: "easeOutQuad",
        complete: () => {
          if (btnLoading) btnLoading.style.display = "none";
          if (btnSuccess) btnSuccess.style.display = "inline-flex";
          heroSubmitBtn.classList.add("is-verified");

          // Draw the SVG checkmark path
          if (checkPolyline) {
            checkPolyline.style.strokeDashoffset = "24";
            window.anime({
              targets: checkPolyline,
              strokeDashoffset: [24, 0],
              duration: 350,
              easing: "easeOutQuad",
            });
          }

          // Button celebratory pulse
          window.anime({
            targets: heroSubmitBtn,
            scale: [1, 1.05, 1],
            duration: 280,
            easing: "easeInOutQuad",
            complete: () => {
              setTimeout(() => {
                resetSubmitBtn(heroSubmitBtn);
                if (callback) callback();
              }, 420);
            },
          });
        },
      });
    } else {
      if (btnLoading) btnLoading.style.display = "none";
      if (btnSuccess) btnSuccess.style.display = "inline-flex";
      heroSubmitBtn.classList.add("is-verified");
      setTimeout(() => {
        resetSubmitBtn(heroSubmitBtn);
        if (callback) callback();
      }, 420);
    }
  } else {
    // Failure case: instantly reset button and run short error shake
    resetSubmitBtn(heroSubmitBtn);
    if (window.anime) {
      window.anime({
        targets: heroSubmitBtn,
        translateX: [-9, 9, -6, 6, -3, 3, 0],
        duration: 380,
        easing: "easeInOutSine",
        complete: () => {
          heroSubmitBtn.style.transform = "none";
          if (callback) callback();
        },
      });
    } else {
      if (callback) callback();
    }
  }
}

export function resetSubmitBtn(heroSubmitBtn) {
  if (!heroSubmitBtn) return;
  heroSubmitBtn._isAnalyzing = false;
  clearInterval(heroSubmitBtn._labelTimer);
  heroSubmitBtn._labelTimer = null;

  const btnDefault = heroSubmitBtn.querySelector(".btn-default-content");
  const btnLoading = heroSubmitBtn.querySelector(".btn-loading-content");
  const btnSuccess = heroSubmitBtn.querySelector(".btn-success-content");
  const btnProgressBorder = heroSubmitBtn.querySelector(".btn-progress-border");
  const progressBorderRect = heroSubmitBtn.querySelector(".progress-border-rect");

  if (window.anime) {
    window.anime.remove(heroSubmitBtn);
    if (btnDefault) window.anime.remove(btnDefault);
    if (btnLoading) window.anime.remove(btnLoading);
    if (btnSuccess) window.anime.remove(btnSuccess);
    if (progressBorderRect) window.anime.remove(progressBorderRect);
  }
  if (borderAnim) {
    try { borderAnim.pause(); } catch (e) {}
    borderAnim = null;
  }

  heroSubmitBtn.disabled = false;
  heroSubmitBtn.classList.remove("is-verified");
  heroSubmitBtn.style.transform = "none";

  if (btnDefault) {
    btnDefault.style.display = "inline-flex";
    btnDefault.style.opacity = "1";
    btnDefault.style.transform = "none";
  }
  if (btnLoading) {
    btnLoading.style.display = "none";
    btnLoading.style.opacity = "0";
  }
  if (btnSuccess) btnSuccess.style.display = "none";
  if (btnProgressBorder) btnProgressBorder.style.opacity = "0";
}
