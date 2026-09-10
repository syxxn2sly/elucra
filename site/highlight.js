/* Extracted from index.html so the page's Content-Security-Policy can keep
   script-src 'self' instead of allowing inline script. Same code, same
   behaviour — it just lives in a file the CSP can name. */
  /* Clicking an explanation lights the lines it was drawn from. This is
     the same relationship the app renders: every card item carries the
     ids of the source blocks behind it. */
  (function () {
    const doc = document.getElementById("doc");
    const facts = document.getElementById("facts");
    if (!doc || !facts) return;

    const lines = new Map();
    doc.querySelectorAll("[data-line]").forEach((el) => lines.set(el.dataset.line, el));

    const buttons = Array.from(facts.querySelectorAll(".fact"));

    function clear() {
      lines.forEach((el) => el.classList.remove("lit"));
      buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    }

    function show(button) {
      const already = button.getAttribute("aria-pressed") === "true";
      clear();
      if (already) return;
      button.setAttribute("aria-pressed", "true");
      button.dataset.refs.split(" ").forEach((id) => lines.get(id)?.classList.add("lit"));
    }

    buttons.forEach((b) => {
      b.addEventListener("click", () => show(b));
      b.addEventListener("mouseenter", () => {
        if (buttons.some((x) => x.getAttribute("aria-pressed") === "true")) return;
        b.dataset.refs.split(" ").forEach((id) => lines.get(id)?.classList.add("lit"));
      });
      b.addEventListener("mouseleave", () => {
        if (buttons.some((x) => x.getAttribute("aria-pressed") === "true")) return;
        lines.forEach((el) => el.classList.remove("lit"));
      });
    });

    // Open on the first one so the relationship is visible without a hover,
    // which is the only way it reads on a touch screen.
    show(buttons[0]);
  })();
