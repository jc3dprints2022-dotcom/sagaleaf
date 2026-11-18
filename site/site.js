/* Applies site.config.js to the page. No tracking, no cookies, no third-party requests. */
(function () {
  var c = window.SITE_CONFIG || {};
  var root = document.documentElement.style;
  if (c.accentColor) root.setProperty("--accent", c.accentColor);
  if (c.inkColor) root.setProperty("--ink", c.inkColor);
  if (c.paperColor) root.setProperty("--paper", c.paperColor);

  function fill() {
    document.querySelectorAll("[data-site]").forEach(function (el) {
      var v = c[el.getAttribute("data-site")];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll("[data-site-href]").forEach(function (el) {
      var key = el.getAttribute("data-site-href");
      var v = c[key];
      if (v == null) return;
      el.setAttribute("href", key === "contactEmail" ? "mailto:" + v : v);
    });
    var t = document.querySelector("title[data-title-suffix]");
    document.title = (t ? t.getAttribute("data-title-suffix") + " · " : "") + c.productName;
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    wireForm();
  }

  function wireForm() {
    var form = document.getElementById("waitlist-form");
    if (!form) return;
    var msg = document.getElementById("waitlist-msg");
    var btn = form.querySelector("button");
    if (c.waitlistEndpoint) form.setAttribute("action", c.waitlistEndpoint);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!form.email.checkValidity() || !email) {
        msg.textContent = "Please enter a valid email address.";
        msg.className = "msg err";
        form.email.focus();
        return;
      }
      btn.disabled = true;
      msg.textContent = "Adding you…";
      msg.className = "msg";
      fetch(form.getAttribute("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email, website: form.website.value }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, b: b }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.b.error || "Something went wrong.");
          form.reset();
          msg.textContent = "Thanks. You're on the list. We'll only email you about " + c.productName + " and " + c.deviceName + ".";
          msg.className = "msg ok";
        })
        .catch(function (err) {
          msg.textContent = (err && err.message && err.message !== "Failed to fetch")
            ? err.message
            : "Couldn't reach the sign-up server. Please try again later.";
          msg.className = "msg err";
        })
        .finally(function () { btn.disabled = false; });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
  else fill();
})();
