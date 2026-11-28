// Navigation: hamburger button (three bars) top right in the header, the menu opens below it.
// The menu itself is in the HTML of every page (src/templates/partials/nav.html), so search
// engines and screen readers see the links; this script adds the button and opens/closes it.
//
// Needs:    –
// Provides: –

function setupMenu() {
  const header = document.querySelector("header");
  const menu = document.getElementById("menu");

  if (!header || !menu) {
    return null;
  }

  const headerInner = header.querySelector(".header_inner") || header;
  const list = menu.querySelector("ul");
  const toggle = document.createElement("button");

  toggle.className = "menu_toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "menu");
  toggle.innerHTML = "<span></span><span></span><span></span>";

  // Current page: "/" or "/exhibitions" … (without query and trailing slash)
  const currentPath = location.pathname.replace(/\/$/, "") || "/";

  list.querySelectorAll("a").forEach((link) => {
    if (link.getAttribute("href") === currentPath) {
      link.setAttribute("aria-current", "page");
    }
  });

  // The menu drops down below the header
  header.appendChild(menu);
  headerInner.appendChild(toggle);

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", () => {
    setOpen(menu.hidden);
  });

  // Close: Esc, click outside the header, click on a link
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !header.contains(event.target)) {
      setOpen(false);
    }
  });

  menu.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      setOpen(false);
    }
  });

  return list;
}

// Logged-in accounts get "Admin" and "Log out" at the end of the menu.
// The login state is only checked in the browser: pages are cached publicly,
// so it must never be part of the HTML. The session cookie stays httpOnly.
async function addAccountItems(list) {
  if (!list) {
    return;
  }

  let user = null;

  try {
    const response = await fetch("/api/users/me", {
      credentials: "same-origin",
      cache: "no-store",
    });

    if (response.ok) {
      user = (await response.json()).user || null;
    }
  } catch {
    return;
  }

  if (!user) {
    return;
  }

  const adminEntry = document.createElement("li");
  const adminLink = document.createElement("a");

  adminEntry.className = "menu_account";
  adminLink.href = "/admin";
  adminLink.textContent = "Admin";
  adminEntry.appendChild(adminLink);

  const logoutEntry = document.createElement("li");
  const logoutButton = document.createElement("button");

  logoutButton.type = "button";
  logoutButton.className = "menu_logout";
  logoutButton.textContent = "Log out";

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
      const response = await fetch("/api/users/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      location.reload();
    } catch {
      logoutButton.disabled = false;
      alert("Logging out did not work. Please try again.");
    }
  });

  logoutEntry.appendChild(logoutButton);
  list.append(adminEntry, logoutEntry);
}

addAccountItems(setupMenu());
