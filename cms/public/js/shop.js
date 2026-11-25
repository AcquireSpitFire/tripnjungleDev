// Shop (release 3.0): prints of the photos, cart, price requests, withdrawal form.
// Classic script like data.js, loaded on every page (the cart link in the header).
//
// The cart lives in this browser only (localStorage): a list of
//   { exhibition: <exhibition id>, photo: <photo id>, print: <print id>, quantity }
// Names, prices and copies left always come from the server (/shop/offers, /shop/quote),
// so nothing in the browser can change a price. Photos without offered prints ("No price")
// get no shop elements at all.

const CART_KEY = "tj:cart:v1";
const CART_MAX_QUANTITY = 10;

// ---------- Cart storage ----------

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

    return Array.isArray(items)
      ? items.filter((item) => item && item.exhibition && item.photo && item.print)
      : [];
  } catch (error) {
    return [];
  }
}

function writeCart(items) {
  try {
    if (items.length) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } else {
      localStorage.removeItem(CART_KEY);
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
      .filter((item) => item.quantity > 0)
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

// ---------- Requests ----------

async function shopRequest(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "omit",
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

// { enabled, vatNote, offers: [ { exhibition, photo, print, label, size, material, details,
//   pricing ("fixed" | "request"), price, copies, left } ] }
async function loadPrintOffers(exhibitionId) {
  try {
    return await shopRequest("/shop/offers?exhibition=" + encodeURIComponent(exhibitionId));
  } catch (error) {
    console.warn("Prints could not be loaded", error);
    return { enabled: false, offers: [] };
  }
}

function groupOffersByPhoto(offers) {
  const groups = new Map();

  offers.forEach((offer) => {
    const key = String(offer.photo);

    groups.set(key, [...(groups.get(key) || []), offer]);
  });

  return groups;
}

// ---------- Prints of one photo ----------

function stockText(offer) {
  if (offer.left === null || offer.left === undefined) {
    return "";
  }

  if (offer.left < 1) {
    return "Sold out";
  }

  return offer.copies ? offer.left + " of " + offer.copies + " left" : offer.left + " left";
}

// "Prints from €120.00" / "Print €120.00" / "Prints – price on request"
function offersSummary(offers) {
  const prices = offers.filter((offer) => offer.pricing === "fixed").map((offer) => offer.price);

  if (!prices.length) {
    return offers.length > 1 ? "Prints – price on request" : "Print – price on request";
  }

  return (offers.length > 1 ? "Prints from " : "Print ") + formatPrice(Math.min(...prices));
}

function paragraph(className, text) {
  const element = document.createElement("p");

  element.className = className;
  element.textContent = text;

  return element;
}

function createAddButton(offer, feedback) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "shop_button";

  if (offer.left !== null && offer.left < 1) {
    button.textContent = "Sold out";
    button.disabled = true;
    return button;
  }

  button.textContent = "Add to cart";
  button.addEventListener("click", () => {
    const added = addToCart(offer, offer.left);
    const link = document.createElement("a");

    link.href = "/cart";
    link.textContent = "View cart ›";
    feedback.textContent = added
      ? "Added to the cart. "
      : offer.left === null
        ? "At most " + CART_MAX_QUANTITY + " copies per order. "
        : "All copies left are in your cart. ";
    feedback.appendChild(link);
    feedback.hidden = false;
  });

  return button;
}

// The list of prints with "Add to cart" / "Request price".
//   context: { photoName, vatNote, onRequest(offer) }
function createOffersList(offers, context) {
  const list = document.createElement("ul");

  list.className = "print_offers";

  offers.forEach((offer) => {
    const entry = document.createElement("li");
    const specs = [offer.size, offer.material].filter(Boolean).join(" · ");
    const row = document.createElement("div");
    const price = paragraph("print_offer_price", offer.pricing === "fixed" ? formatPrice(offer.price) : "Price on request");
    const feedback = paragraph("print_offer_feedback", "");

    entry.className = "print_offer";
    entry.appendChild(paragraph("print_offer_title", offer.label));

    if (specs) {
      entry.appendChild(paragraph("print_offer_specs", specs));
    }

    if (offer.details) {
      entry.appendChild(paragraph("print_offer_details", offer.details));
    }

    // Price with the VAT note and "plus shipping" (price indication rules)
    if (offer.pricing === "fixed") {
      const note = document.createElement("span");

      note.className = "print_offer_note";
      note.textContent = " " + (context.vatNote ? context.vatNote + ", " : "") + "plus shipping";
      price.appendChild(note);
    }

    row.className = "print_offer_row";
    row.appendChild(price);

    if (stockText(offer)) {
      row.appendChild(paragraph("print_offer_stock" + (offer.left < 1 ? " sold_out" : ""), stockText(offer)));
    }

    if (offer.pricing === "fixed") {
      row.appendChild(createAddButton(offer, feedback));
    } else {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "shop_button";
      button.textContent = "Request price";
      button.addEventListener("click", () => context.onRequest(offer));
      row.appendChild(button);
    }

    feedback.setAttribute("role", "status");
    feedback.hidden = true;
    entry.append(row, feedback);
    list.appendChild(entry);
  });

  return list;
}

// "Shipping costs and delivery time in the cart · Terms · Right of withdrawal"
function createShopLinks() {
  const note = document.createElement("p");

  note.className = "print_links";
  note.innerHTML =
    'Shipping costs and delivery time are shown in the <a href="/cart">cart</a> · ' +
    '<a href="/terms">Terms</a> · <a href="/withdrawal">Right of withdrawal</a>';

  return note;
}

// ---------- Price request form ----------

function createRequestForm(offer, photoName) {
  const form = document.createElement("form");

  form.className = "shop_form";
  form.noValidate = true;
  form.innerHTML =
    '<p class="shop_form_title"></p>' +
    '<label>Your name <input name="name" autocomplete="name" maxlength="120"></label>' +
    '<label>E-mail <input name="email" type="email" autocomplete="email" required maxlength="254"></label>' +
    '<label>Message (optional) <textarea name="message" rows="3" maxlength="2000"></textarea></label>' +
    // Honeypot for bots: hidden from people and screen readers
    '<label class="shop_hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<p class="shop_form_note">We only use your details to answer this request, see the <a href="/privacy">privacy policy</a>.</p>' +
    '<p class="form_message" role="alert" hidden></p>' +
    '<button type="submit" class="shop_button shop_button_primary">Send request</button>';
  form.querySelector(".shop_form_title").textContent = "Request the price of “" + photoName + "” – " + offer.label;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = form.querySelector(".form_message");
    const button = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form).entries());

    if (!/^\S+@\S+\.\S+$/.test(data.email || "")) {
      message.textContent = "Please enter your e-mail address.";
      message.hidden = false;
      return;
    }

    button.disabled = true;
    message.hidden = true;

    try {
      await shopRequest("/shop/request", {
        exhibition: offer.exhibition,
        photo: String(offer.photo),
        print: offer.print,
        name: data.name,
        email: data.email,
        message: data.message,
        website: data.website,
      });
      form.replaceChildren(paragraph("shop_form_done", "Thank you! Your request has been sent; we will answer by e-mail."));
    } catch (error) {
      message.textContent = error.message;
      message.hidden = false;
      button.disabled = false;
    }
  });

  return form;
}

// Offers list + request form + links, used by the dialog and the photo page
function createOffersBlock(offers, context) {
  const block = document.createElement("div");
  const links = createShopLinks();

  block.className = "print_block";
  block.appendChild(
    createOffersList(offers, {
      ...context,
      onRequest: (offer) => {
        block.querySelector(".shop_form")?.remove();
        block.insertBefore(createRequestForm(offer, context.photoName), links);
        block.querySelector(".shop_form input")?.focus();
      },
    })
  );
  block.appendChild(links);

  return block;
}

// ---------- Exhibition page: button below the photo → dialog ----------

let printDialog = null;

function openPrintDialog(item, offers, context) {
  if (!printDialog) {
    printDialog = document.createElement("dialog");
    printDialog.className = "print_dialog";
    printDialog.addEventListener("click", (event) => {
      // Click on the backdrop closes the dialog
      if (event.target === printDialog) {
        printDialog.close();
      }
    });
    document.body.appendChild(printDialog);
  }

  const close = document.createElement("button");
  const body = document.createElement("div");
  const content = document.createElement("div");
  const heading = document.createElement("h2");

  close.type = "button";
  close.className = "print_dialog_close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => printDialog.close());

  body.className = "print_dialog_body";

  if (item.type === "image") {
    const image = document.createElement("img");

    setImageSources(image, item, { size: "thumb", sizes: "240px" });
    image.alt = item.alt || "";
    image.className = "print_dialog_image";
    body.appendChild(image);
  }

  heading.className = "print_dialog_title";
  heading.textContent = context.photoName;
  content.append(heading, createOffersBlock(offers, context));
  body.appendChild(content);

  printDialog.replaceChildren(close, body);
  printDialog.showModal();
}

// Called by exhibition.js after the gallery is built
async function setupExhibitionShop(exhibition) {
  const data = await loadPrintOffers(exhibition.id);

  if (!data.enabled || !data.offers.length) {
    return;
  }

  const groups = groupOffersByPhoto(data.offers);

  (exhibition.gallery || []).forEach((item) => {
    const offers = groups.get(String(item.id));
    const figure = document.getElementById("media-" + item.id);

    if (!offers || !figure) {
      return;
    }

    const button = document.createElement("button");
    const photoName = item.name || item.alt || exhibition.title;

    button.type = "button";
    button.className = "print_button";
    button.textContent = offersSummary(offers) + " ›";
    button.addEventListener("click", () => openPrintDialog(item, offers, { photoName, vatNote: data.vatNote }));
    figure.appendChild(button);
  });
}

// ---------- Photo page: the list below the photo ----------

// Called by photo.js after the photo is shown
async function setupPhotoShop(exhibition, item, container) {
  const data = await loadPrintOffers(exhibition.id);
  const offers = data.enabled ? groupOffersByPhoto(data.offers).get(String(item.id)) : null;

  if (!offers || !container) {
    return;
  }

  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const photoName = item.name || item.alt || exhibition.title;

  section.className = "photo_prints";
  heading.className = "section_title";
  heading.textContent = offers.length > 1 ? "Prints of this photo" : "Print of this photo";
  section.append(heading, createOffersBlock(offers, { photoName, vatNote: data.vatNote }));
  container.appendChild(section);
}

// ---------- Withdrawal function (/withdrawal) ----------

function setupWithdrawalForm() {
  const form = document.getElementById("withdrawal_form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = form.querySelector(".form_message");
    const button = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form).entries());

    button.disabled = true;
    message.hidden = true;

    try {
      const result = await shopRequest("/shop/withdrawal", data);
      const received = new Date(result.received).toLocaleString("en-GB");

      form.replaceChildren(
        paragraph(
          "shop_form_done",
          "Your withdrawal from order " + String(data.orderNumber).trim().toUpperCase() + " was received on " + received + ". " +
            (result.note || "You will receive an acknowledgement by e-mail. Please send the goods back within 14 days.")
        )
      );
    } catch (error) {
      message.textContent = error.message;
      message.hidden = false;
      button.disabled = false;
    }
  });
}

// ---------- Start ----------

// After a successful payment the cart is emptied (/order/thanks)
if (document.body.hasAttribute("data-order-thanks")) {
  writeCart([]);
}

updateCartLink();
setupWithdrawalForm();

// Cart changed in another tab
window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY) {
    updateCartLink();
  }
});
