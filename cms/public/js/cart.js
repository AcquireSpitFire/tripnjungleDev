// Cart page (/cart). The items come from localStorage (cart-store.js); everything shown about
// them – name, details, price, copies left, shipping, total – comes from the server (/shop/quote).
// "Continue to payment" asks the server for a Stripe payment page (/shop/checkout) and goes there.
//
// Needs:    data.js (STORAGE_KEYS), elements.js (createParagraph), cart-store.js
// Provides: –

const cartStatus = document.getElementById("cart_status");
const cartLines = document.getElementById("cart_lines");
const cartSummary = document.getElementById("cart_summary");
const countrySelect = document.getElementById("cart_country");
const checkoutButton = document.getElementById("cart_checkout");
const cartMessage = document.getElementById("cart_message");

let lastQuote = null;
let quoteRequest = 0;

function readCountry() {
  try {
    return localStorage.getItem(STORAGE_KEYS.cartCountry) || "";
  } catch (error) {
    return "";
  }
}

function writeCountry(code) {
  try {
    localStorage.setItem(STORAGE_KEYS.cartCountry, code);
  } catch (error) {
    // not available: the choice only applies to this page
  }
}

function setupCountries() {
  let countries = [];

  try {
    countries = JSON.parse(document.body.dataset.countries || "[]");
  } catch (error) {
    countries = [];
  }

  countries.forEach((country) => {
    const option = document.createElement("option");

    option.value = country.code;
    option.textContent = country.name;
    countrySelect.appendChild(option);
  });

  const stored = readCountry();

  if (countries.some((country) => country.code === stored)) {
    countrySelect.value = stored;
  } else if (countries.length === 1) {
    countrySelect.value = countries[0].code;
  }

  countrySelect.addEventListener("change", () => {
    writeCountry(countrySelect.value);
    refresh();
  });
}

function showMessage(text) {
  cartMessage.textContent = text || "";
  cartMessage.hidden = !text;
}

function lineEntry(line) {
  return { exhibition: line.exhibitionSlug, photo: line.mediaId, print: line.printId };
}

function createLine(line) {
  const entry = document.createElement("li");
  const text = document.createElement("div");
  const title = document.createElement("a");

  entry.className = "cart_line" + (line.problem ? " has_problem" : "");

  if (line.thumbUrl) {
    const image = document.createElement("img");

    image.src = line.thumbUrl;
    image.alt = "";
    image.loading = "lazy";
    image.className = "cart_line_image";
    entry.appendChild(image);
  }

  text.className = "cart_line_text";
  title.className = "cart_line_title";
  title.href = line.photoUrl;
  title.textContent = line.photoName;
  text.appendChild(title);

  // Essential characteristics: print, size, material, details, artist, exhibition
  [
    line.label,
    [line.size, line.material].filter(Boolean).join(" · "),
    line.details,
    [line.artistName ? "by " + line.artistName : "", line.exhibitionTitle ? "Exhibition: " + line.exhibitionTitle : ""]
      .filter(Boolean)
      .join(" · "),
    line.left !== null && !line.problem ? line.left + (line.left === 1 ? " copy" : " copies") + " left" : "",
  ]
    .filter(Boolean)
    .forEach((value) => text.appendChild(createParagraph("", value)));

  if (line.problem) {
    text.appendChild(createParagraph("cart_problem", line.problem));
  }

  entry.appendChild(text);

  const controls = document.createElement("div");
  const quantity = document.createElement("select");
  const max = Math.max(line.quantity, Math.min(CART_MAX_QUANTITY, line.left ?? CART_MAX_QUANTITY));
  const price = createParagraph("cart_line_price", line.price ? formatPrice(line.lineTotal) : "");
  const remove = document.createElement("button");

  controls.className = "cart_line_controls";
  quantity.setAttribute("aria-label", "Quantity of " + line.photoName);

  for (let count = 1; count <= max; count += 1) {
    const option = document.createElement("option");

    option.value = String(count);
    option.textContent = String(count);
    quantity.appendChild(option);
  }

  quantity.value = String(line.quantity);
  quantity.addEventListener("change", () => {
    setCartQuantity(lineEntry(line), Number(quantity.value));
    refresh();
  });

  if (line.quantity > 1 && line.price) {
    const each = document.createElement("span");

    each.className = "cart_muted";
    each.textContent = " (" + formatPrice(line.price) + " each)";
    price.appendChild(each);
  }

  remove.type = "button";
  remove.className = "cart_remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    setCartQuantity(lineEntry(line), 0);
    refresh();
  });

  controls.append(quantity, price, remove);
  entry.appendChild(controls);

  return entry;
}

function render(quote) {
  const empty = !quote.lines.length;

  lastQuote = quote;
  cartLines.replaceChildren(...quote.lines.map(createLine));
  cartLines.hidden = empty;
  cartSummary.hidden = empty;
  cartStatus.hidden = !empty && !quote.missing.length;
  cartStatus.textContent = empty
    ? "Your cart is empty. Prints can be ordered below the photos in the exhibitions."
    : "Some items are no longer available and have been removed from your cart.";

  document.getElementById("cart_subtotal").textContent = formatPrice(quote.subtotal);
  document.getElementById("cart_zone").textContent = quote.zone ? "(" + quote.countryName + ")" : "";
  document.getElementById("cart_shipping").textContent =
    quote.shipping === null ? (quote.country ? "–" : "choose the country") : formatPrice(quote.shipping);
  document.getElementById("cart_total").textContent = quote.total === null ? "–" : formatPrice(quote.total);
  document.getElementById("cart_vat").textContent =
    quote.vatNote + (quote.vatAmount ? " (" + formatPrice(quote.vatAmount) + ")" : "");
  document.getElementById("cart_delivery").textContent = quote.deliveryTime
    ? quote.deliveryTime + " to " + quote.countryName
    : "depends on the country of delivery, shown after choosing it";

  showMessage(empty ? "" : quote.message);
  checkoutButton.disabled = !quote.ok;
}

async function refresh() {
  const items = readCart();
  const request = ++quoteRequest;

  if (document.body.dataset.shopOpen !== "true") {
    cartStatus.textContent = "The shop is closed at the moment.";
    cartLines.hidden = true;
    cartSummary.hidden = true;
    return;
  }

  try {
    const quote = await shopRequest("/shop/quote", { items, country: countrySelect.value || null });

    // An older answer must not overwrite a newer one
    if (request !== quoteRequest) {
      return;
    }

    // Drop items that no longer exist (removed, locked, "No price" …)
    if (quote.missing.length) {
      writeCart(items.filter((item) => !quote.missing.includes(item.exhibition + "/" + item.photo + "/" + item.print)));
    }

    render(quote);
  } catch (error) {
    cartStatus.hidden = false;
    cartStatus.textContent = error.message;
  }
}

checkoutButton.addEventListener("click", async () => {
  if (!lastQuote?.ok) {
    return;
  }

  checkoutButton.disabled = true;
  checkoutButton.textContent = "Opening the payment page …";
  showMessage("");

  try {
    const result = await shopRequest("/shop/checkout", { items: readCart(), country: countrySelect.value });

    window.location.href = result.url;
  } catch (error) {
    if (error.data?.quote) {
      render(error.data.quote);
    }

    showMessage(error.message);
    checkoutButton.textContent = "Continue to payment";
    checkoutButton.disabled = !(error.data?.quote?.ok ?? lastQuote?.ok);
  }
});

// Back from Stripe with the browser's back button: show the current state again
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    checkoutButton.textContent = "Continue to payment";
    refresh();
  }
});

// Back from the payment page with Stripe's "back" link (/cart?released=…): the copies held for
// that checkout are given back at once instead of after 35 minutes
async function releaseCheckout() {
  const release = new URLSearchParams(window.location.search).get("released");

  if (!release) {
    return;
  }

  history.replaceState(null, "", window.location.pathname);

  try {
    await shopRequest("/shop/checkout/release", { release });
  } catch (error) {
    // The checkout simply runs out after 35 minutes
  }
}

setupCountries();
releaseCheckout().finally(refresh);
