// The cart in this browser (localStorage) and the cart link in the header, on every page.
//
// Needs:    data.js (STORAGE_KEYS)
// Provides: CART_MAX_QUANTITY, readCart, writeCart, addToCart, setCartQuantity, formatPrice,
//           shopRequest
//
// The cart is a list of { exhibition: <exhibition id>, photo: <photo id>, print: <print id>,
// quantity }. Names, prices and copies left always come from the server (/shop/offers,
// /shop/quote), so nothing in the browser can change a price.

const CART_MAX_QUANTITY = 10;

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) || "[]");

    return Array.isArray(items) ? items.filter((item) => item && item.exhibition && item.photo && item.print) : [];
  } catch (error) {
    return [];
  }
}

function writeCart(items) {
  try {
    if (items.length) {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(items));
    } else {
      localStorage.removeItem(STORAGE_KEYS.cart);
    }
  } catch (error) {
    // localStorage not available (private mode): the cart only lives until the page changes
  }

  updateCartLink();
}

function cartCount(items = readCart()) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
}

function sameItem(a, b) {
  return a.exhibition === b.exhibition && String(a.photo) === String(b.photo) && a.print === b.print;
}

// Adds one copy; false if the limit (copies left, at most 10) is reached
function addToCart(entry, limit) {
  const items = readCart();
  const existing = items.find((item) => sameItem(item, entry));
  const max = Math.min(CART_MAX_QUANTITY, limit ?? CART_MAX_QUANTITY);

  if ((existing?.quantity ?? 0) >= max) {
    return false;
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ exhibition: entry.exhibition, photo: String(entry.photo), print: entry.print, quantity: 1 });
  }

  writeCart(items);

  return true;
}

function setCartQuantity(entry, quantity) {
  writeCart(
    readCart()
      .map((item) => (sameItem(item, entry) ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0),
  );
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
}

// ---------- Cart link in the header ----------

function updateCartLink() {
  const header = document.querySelector("header .header_inner");

  if (!header) {
    return;
  }

  let link = header.querySelector(".cart_link");
  const count = cartCount();

  if (!count) {
    link?.remove();
    return;
  }

  if (!link) {
    link = document.createElement("a");
    link.className = "cart_link";
    link.href = "/cart";
    header.insertBefore(link, header.querySelector(".menu_toggle"));
  }

  link.textContent = "Cart (" + count + ")";
  link.setAttribute("aria-label", "Cart, " + count + (count === 1 ? " item" : " items"));
}

// ---------- Requests to /shop/… ----------

// Without the login cookie, like a visitor – except "withLogin" (the admin preview).
// Errors become an Error with the message of the server ({ error }), .status and .data.
async function shopRequest(path, body, options = {}) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: options.withLogin ? "same-origin" : "omit",
    cache: "no-store",
  });
  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    // no JSON body
  }

  if (!response.ok) {
    const error = new Error(data?.error || "Something went wrong. Please try again.");

    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ---------- Start ----------

// After a successful payment the cart is emptied (/order/thanks)
if (document.body.hasAttribute("data-order-thanks")) {
  writeCart([]);
}

updateCartLink();

// Cart changed in another tab
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEYS.cart) {
    updateCartLink();
  }
});
