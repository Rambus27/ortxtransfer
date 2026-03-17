(function () {
  var THEMES = {
    aqua: {
      label: "Aqua",
      swatch: "#7fffd4",
      vars: {
        "--mint": "#7fffd4",
        "--sun": "#ffd166",
        "--accent-end": "#00b4d8",
        "--bg-deep": "#0d1b2a",
        "--bg-mid": "#1b263b",
        "--panel": "rgba(13,27,42,0.72)",
        "--border": "rgba(127,255,212,0.28)"
      },
      bodyBg:
        "radial-gradient(circle at 20% 20%, #274c77 0%, transparent 42%), radial-gradient(circle at 85% 15%, #2d6a4f 0%, transparent 33%), linear-gradient(130deg, #0d1b2a, #1b263b 60%, #0f4c5c)",
      auroraBg:
        "conic-gradient(from 80deg, rgba(255,209,102,.15), rgba(127,255,212,.06), rgba(255,209,102,.12))"
    },
    violet: {
      label: "Violet",
      swatch: "#c084fc",
      vars: {
        "--mint": "#c084fc",
        "--sun": "#f9a8d4",
        "--accent-end": "#818cf8",
        "--bg-deep": "#13111c",
        "--bg-mid": "#1e1b2e",
        "--panel": "rgba(19,17,28,0.72)",
        "--border": "rgba(192,132,252,0.28)"
      },
      bodyBg:
        "radial-gradient(circle at 20% 20%, #3b1065 0%, transparent 42%), radial-gradient(circle at 85% 15%, #5b21b6 0%, transparent 33%), linear-gradient(130deg, #13111c, #1e1b2e 60%, #2e1065)",
      auroraBg:
        "conic-gradient(from 80deg, rgba(249,168,212,.15), rgba(192,132,252,.06), rgba(249,168,212,.12))"
    },
    solar: {
      label: "Solar",
      swatch: "#fb923c",
      vars: {
        "--mint": "#fb923c",
        "--sun": "#fde68a",
        "--accent-end": "#f59e0b",
        "--bg-deep": "#160f02",
        "--bg-mid": "#231a07",
        "--panel": "rgba(22,15,2,0.72)",
        "--border": "rgba(251,146,60,0.28)"
      },
      bodyBg:
        "radial-gradient(circle at 20% 20%, #6b3a0a 0%, transparent 42%), radial-gradient(circle at 85% 15%, #78350f 0%, transparent 33%), linear-gradient(130deg, #160f02, #231a07 60%, #431a03)",
      auroraBg:
        "conic-gradient(from 80deg, rgba(253,230,138,.15), rgba(251,146,60,.06), rgba(253,230,138,.12))"
    },
    rose: {
      label: "Rose",
      swatch: "#f472b6",
      vars: {
        "--mint": "#f472b6",
        "--sun": "#fb7185",
        "--accent-end": "#e11d48",
        "--bg-deep": "#1a0d14",
        "--bg-mid": "#2a1520",
        "--panel": "rgba(26,13,20,0.72)",
        "--border": "rgba(244,114,182,0.28)"
      },
      bodyBg:
        "radial-gradient(circle at 20% 20%, #6d1e4a 0%, transparent 42%), radial-gradient(circle at 85% 15%, #831843 0%, transparent 33%), linear-gradient(130deg, #1a0d14, #2a1520 60%, #440d28)",
      auroraBg:
        "conic-gradient(from 80deg, rgba(251,113,133,.15), rgba(244,114,182,.06), rgba(251,113,133,.12))"
    },
    arctic: {
      label: "Arctic",
      swatch: "#38bdf8",
      vars: {
        "--mint": "#38bdf8",
        "--sun": "#a5f3fc",
        "--accent-end": "#0ea5e9",
        "--bg-deep": "#0a1628",
        "--bg-mid": "#0f2138",
        "--panel": "rgba(10,22,40,0.72)",
        "--border": "rgba(56,189,248,0.28)"
      },
      bodyBg:
        "radial-gradient(circle at 20% 20%, #075985 0%, transparent 42%), radial-gradient(circle at 85% 15%, #0c4a6e 0%, transparent 33%), linear-gradient(130deg, #0a1628, #0f2138 60%, #0a3a5c)",
      auroraBg:
        "conic-gradient(from 80deg, rgba(165,243,252,.15), rgba(56,189,248,.06), rgba(165,243,252,.12))"
    }
  };

  var STORAGE_KEY = "ortx-theme";
  var currentTheme = localStorage.getItem(STORAGE_KEY) || "aqua";

  function applyVars(name) {
    var theme = THEMES[name] || THEMES.aqua;
    var root = document.documentElement;
    Object.keys(theme.vars).forEach(function (k) {
      root.style.setProperty(k, theme.vars[k]);
    });
    root.dataset.theme = name;
  }

  function applyBackground(name) {
    var theme = THEMES[name] || THEMES.aqua;
    document.body.style.background = theme.bodyBg;
    var aurora = document.querySelector(".aurora");
    if (aurora) aurora.style.background = theme.auroraBg;
  }

  function setTheme(name) {
    if (!THEMES[name]) return;
    currentTheme = name;
    localStorage.setItem(STORAGE_KEY, name);
    applyVars(name);
    applyBackground(name);
    document.querySelectorAll(".theme-swatch").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.theme === name);
    });
  }

  function buildPanel() {
    var toggleBtn = document.createElement("button");
    toggleBtn.id = "themeToggleBtn";
    toggleBtn.className = "theme-toggle-btn";
    toggleBtn.setAttribute("aria-label", "Customize appearance");
    toggleBtn.setAttribute("title", "Customize appearance");
    toggleBtn.innerHTML = "&#9881;&#xFE0E;";

    var panel = document.createElement("div");
    panel.id = "themePanel";
    panel.className = "theme-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Appearance settings");

    var swatchesHtml = Object.keys(THEMES).map(function (name) {
      var t = THEMES[name];
      var isActive = name === currentTheme ? " active" : "";
      return (
        '<button class="theme-swatch' + isActive + '" data-theme="' + name + '" type="button">' +
        '<span class="theme-swatch-dot" style="background:' + t.swatch + '"></span>' +
        t.label +
        "</button>"
      );
    }).join("");

    panel.innerHTML =
      '<p class="theme-panel-title">Appearance</p>' +
      '<div class="theme-swatches">' + swatchesHtml + "</div>";

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    var panelOpen = false;

    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      panelOpen = !panelOpen;
      panel.classList.toggle("visible", panelOpen);
    });

    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("click", function () {
      if (panelOpen) {
        panelOpen = false;
        panel.classList.remove("visible");
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panelOpen) {
        panelOpen = false;
        panel.classList.remove("visible");
      }
    });

    panel.querySelectorAll(".theme-swatch").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTheme(btn.dataset.theme);
      });
    });

    applyBackground(currentTheme);
  }

  // Apply CSS variables immediately — before DOM is fully loaded
  applyVars(currentTheme);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
