/**
 * DealSense India — Theme Switcher System
 * Defaults to Light (White) Theme, allows instantaneous switching to Deep Obsidian Dark Theme.
 * Persists user preference across visits in localStorage ('dealsense_theme').
 */

(function () {
  'use strict';

  var THEME_KEY = 'dealsense_theme';
  var THEME_LIGHT = 'light';
  var THEME_DARK = 'dark';

  function getCurrentTheme() {
    var stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (e) {
      stored = null;
    }
    // Default to 'light' if not explicitly set to 'dark'
    return stored === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  }

  function applyTheme(theme, save) {
    if (theme !== THEME_DARK && theme !== THEME_LIGHT) {
      theme = THEME_LIGHT;
    }

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;

    if (save !== false) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (e) {
        console.warn('[DealSense Theme] Could not save theme preference:', e);
      }
    }

    // Update aria labels on all toggle buttons
    var buttons = document.querySelectorAll('.theme-toggle-btn, #themeToggleBtn, #mobileThemeToggleBtn');
    buttons.forEach(function (btn) {
      if (theme === THEME_DARK) {
        btn.setAttribute('title', 'Switch to Light Theme');
        btn.setAttribute('aria-label', 'Switch to Light Theme');
      } else {
        btn.setAttribute('title', 'Switch to Dark Theme');
        btn.setAttribute('aria-label', 'Switch to Dark Theme');
      }
    });

    // Notify listeners (e.g. charts / SVG curves / canvas)
    try {
      window.dispatchEvent(new CustomEvent('dealsense:themechange', { detail: { theme: theme } }));
    } catch (e) {
      // Ignore in older environments
    }
  }

  function toggleTheme() {
    var current = getCurrentTheme();
    var nextTheme = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    applyTheme(nextTheme, true);
    return nextTheme;
  }

  // Initial apply on DOM execution
  applyTheme(getCurrentTheme(), false);

  // Wire event handlers when DOM is ready
  function initThemeButtons() {
    var buttons = document.querySelectorAll('.theme-toggle-btn, #themeToggleBtn, #mobileThemeToggleBtn');
    buttons.forEach(function (btn) {
      btn.removeEventListener('click', toggleTheme);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleTheme();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeButtons);
  } else {
    initThemeButtons();
  }

  // Expose API globally
  window.DealSenseTheme = {
    getTheme: getCurrentTheme,
    setTheme: applyTheme,
    toggleTheme: toggleTheme,
    initButtons: initThemeButtons
  };
})();
