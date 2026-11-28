// Data of the exhibitions for all pages: loading from the API, the page format, dates.
//
// Needs:    –
// Provides: SITE_NAME, STORAGE_KEYS, PREVIEW, SIZE_ORDER, getExhibitionLink, isLocked, canView, getYouTubeId,
//           getToday, isUpcoming, isPast, compareByDate, formatExhibitionDate, isValidId,
//           loadExhibition, loadExhibitions, getExhibition
//
// Classic script (no modules): every page loads the same base scripts in this order
// (src/templates/partials/scripts.html): data.js, elements.js, consent.js, nav.js, cart-store.js,
// shop.js – each one may use what the earlier ones provide.
//
// The data comes from the Payload API (/api/exhibitions), served by the same app. Here it is
// brought into the shape the page scripts expect:
//   id, title, theme, description, date, time, location,
//   locked (true/false), visibility ("locked"|"link"|"public"),
//   release ("scheduled"|"comingSoon"), video (YouTube URL or ID),
//   posters [ medium ], frontPage medium, gallery [ medium ], artists [ artist ]
// A medium: { id, type ("image"|"video"), src, alt, name, width, height,
//             sizes: { thumb, medium, large } (each {url, width, height}),
//             artist (only gallery items by someone else, otherwise null) }
// An artist: { slug, name, link ("/artist/<slug>"), shortText }
//
// For locked exhibitions (locked: true) the API returns neither the cover nor the gallery to
// anonymous visitors, and the files cannot be fetched. Exception visibility "link": it counts as
// locked everywhere (no links, not in slideshow and lists), but the exhibition page itself shows
// the content. Exhibitions in release "planning" are not returned by the API at all.
//
// The API is called WITHOUT cookies: a logged-in admin sees the site exactly like a visitor.
// Only the preview (?preview in the address, "Preview" button in the admin) sends the login, so
// the account sees what it may see in the admin (also "planning" and locked content). Nothing is
// cached in preview.

const SITE_NAME = "Tripnjungle";

// Everything this site keeps in the visitor's browser (see the privacy policy, section 4)
const STORAGE_KEYS = {
  exhibitionCache: "tj:exhibition:v2:", // + id, sessionStorage, a few minutes
  youtubeConsent: "tj:consent:youtube", // localStorage, consent.js
  cart: "tj:cart:v1", // localStorage, cart-store.js
  cartCountry: "tj:cart:country", // localStorage, cart.js
};

const API_PATH = "/api/exhibitions";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const SIZE_ORDER = ["thumb", "medium", "large"];

let exhibitionsCache = null; // all exhibitions, once loaded

const PREVIEW = new URLSearchParams(window.location.search).has("preview");

function getExhibitionLink(exhibition) {
  return "/exhibition/" + encodeURIComponent(exhibition.id);
}

// Only explicitly public exhibitions (locked: false) are open.
// If the field is missing, the exhibition counts as locked.
function isLocked(exhibition) {
  return exhibition?.locked !== false;
}

// May the exhibition page show the content? Public or "with link"
function canView(exhibition) {
  return !isLocked(exhibition) || exhibition?.visibility === "link";
}

// Announced without a fixed date
function isComingSoon(exhibition) {
  return exhibition?.release === "comingSoon";
}

// YouTube ID from a URL (watch, youtu.be, embed, shorts, live) or a bare ID
function getYouTubeId(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();

  if (/^[\w-]{11}$/.test(text)) {
    return text;
  }

  const match =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(
      text,
    );

  return match ? match[1] : null;
}

// ---------- Dates ----------

// The date of an exhibition (ISO string from the API) → Date at local midnight, null if missing
function parseDate(exhibition) {
  const value = exhibition?.date;

  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    console.warn("Invalid date for “" + exhibition.id + "”:", value);
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

function getToday() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

// Still to come (today or later) or announced as "Coming soon"
function isUpcoming(exhibition, today = getToday()) {
  if (isComingSoon(exhibition)) {
    return true;
  }

  const date = parseDate(exhibition);

  return !!date && date >= today;
}

// Already took place
function isPast(exhibition, today = getToday()) {
  const date = parseDate(exhibition);

  return !!date && date < today;
}

// Earliest date first; "Coming soon" always comes after all exhibitions with a date.
// Exhibitions on the same day keep the order of the API.
function compareByDate(a, b) {
  const soonA = isComingSoon(a);
  const soonB = isComingSoon(b);

  if (soonA || soonB) {
    return Number(soonA) - Number(soonB);
  }

  return parseDate(a) - parseDate(b);
}

// "24 December 2026", or "Coming soon"
function formatExhibitionDate(exhibition) {
  if (isComingSoon(exhibition)) {
    return "Coming soon";
  }

  const date = parseDate(exhibition);

  return date
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";
}

// ---------- Loading ----------

// Only allow simple ids
function isValidId(id) {
  return /^[a-z0-9-]+$/i.test(id || "");
}

async function fetchJson(path) {
  const response = await fetch(
    path,
    PREVIEW ? { credentials: "same-origin", cache: "no-store" } : { credentials: "omit" },
  );

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  return response.json();
}

// An artist profile from the API → page format (null if not populated)
function mapArtist(artist) {
  if (!artist || typeof artist !== "object" || !artist.slug) {
    return null;
  }

  return {
    slug: artist.slug,
    name: artist.name || "",
    link: "/artist/" + encodeURIComponent(artist.slug),
    // Artists with an external website have no text on this site
    shortText: artist.pageType === "external" ? "" : artist.shortText || "",
  };
}

// A medium from the API (upload document) → page format
function mapMedia(media, name, alt, artist) {
  if (!media || typeof media !== "object" || !media.url) {
    return null;
  }

  const sizes = {};

  SIZE_ORDER.forEach((sizeName) => {
    const entry = media.sizes?.[sizeName];

    if (entry?.url) {
      sizes[sizeName] = { url: entry.url, width: entry.width, height: entry.height };
    }
  });

  return {
    id: String(media.id),
    type: (media.mimeType || "").startsWith("video/") ? "video" : "image",
    src: media.url,
    // Alt text of the gallery row, otherwise the one of the file, otherwise the name
    alt: alt || media.alt || name || media.name || "",
    name: name || media.name || "",
    width: media.width,
    height: media.height,
    sizes,
    artist: mapArtist(artist),
  };
}

function mapExhibition(doc) {
  return {
    id: doc.slug,
    title: doc.title,
    theme: doc.theme || "",
    description: doc.description || "",
    // "Coming soon" has no date, even if an old one is still stored
    date: doc.release === "comingSoon" ? null : doc.date || null,
    time: doc.time || "",
    location: doc.location || "",
    locked: doc.locked,
    visibility: doc.visibility || (doc.locked === false ? "public" : "locked"),
    release: doc.release || "scheduled",
    video: doc.video || "",
    posters: (doc.posters || []).map((poster) => mapMedia(poster)).filter(Boolean),
    frontPage: mapMedia(doc.frontPage),
    gallery: (doc.gallery || [])
      .map((row) => mapMedia(row.file, row.name, row.alt, row.artist))
      .filter(Boolean),
    artists: (doc.artists || []).map(mapArtist).filter(Boolean),
  };
}

// Short-term cache in sessionStorage: intro.js stores the exhibition while the video plays,
// exhibition.js then renders it without waiting
function readCachedExhibition(id) {
  if (PREVIEW) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.exhibitionCache + id);
    const entry = raw && JSON.parse(raw);

    if (entry && Date.now() - entry.time < CACHE_TTL) {
      return entry.data;
    }
  } catch (error) {
    // sessionStorage not available (private mode etc.) – just go without the cache
  }

  return null;
}

function cacheExhibition(exhibition) {
  if (PREVIEW) {
    return;
  }

  try {
    sessionStorage.setItem(
      STORAGE_KEYS.exhibitionCache + exhibition.id,
      JSON.stringify({ time: Date.now(), data: exhibition }),
    );
  } catch (error) {
    // full or not available – ignore
  }
}

// A single exhibition by its id (= slug), from the short-term cache first
async function loadExhibition(id) {
  if (!isValidId(id)) {
    throw new Error("Invalid id: " + id);
  }

  const cached = readCachedExhibition(id);

  if (cached) {
    return cached;
  }

  const result = await fetchJson(
    API_PATH + "?where[slug][equals]=" + encodeURIComponent(id) + "&depth=1&limit=1",
  );

  if (!result.docs?.length) {
    throw new Error("Not found: " + id);
  }

  const exhibition = mapExhibition(result.docs[0]);

  cacheExhibition(exhibition);

  return exhibition;
}

// All exhibitions, sorted by date
async function loadExhibitions() {
  if (exhibitionsCache) {
    return exhibitionsCache;
  }

  const result = await fetchJson(API_PATH + "?limit=100&depth=1&sort=date");

  exhibitionsCache = (result.docs || []).map(mapExhibition);

  return exhibitionsCache;
}

// One exhibition: from the cache, otherwise load it on its own
async function getExhibition(id) {
  const cached = exhibitionsCache?.find((exhibition) => exhibition.id === id);

  return cached || loadExhibition(id);
}
