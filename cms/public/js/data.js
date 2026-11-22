// Shared data functions for all pages.
// Classic script (no modules): the functions are global and are used by
// script.js, exhibition.js, intro.js, events.js and exhibitions.js.
//
// The data comes from the Payload API (/api/exhibitions), served by the same
// app. Here it is brought into the shape the page scripts expect:
//   id, title, theme, description, date, time, location,
//   locked (true/false), visibility ("locked"|"link"|"public"),
//   release ("scheduled"|"comingSoon"), video (YouTube URL or ID),
//   posters [ medium ], frontPage medium, gallery [ medium ]
// A medium: { id, type ("image"|"video"), src, alt, name, width, height,
//             sizes: { thumb, medium, large } (each {url, width, height}) }
//
// For locked exhibitions (locked: true) the API returns neither the cover nor
// the gallery to anonymous visitors, and the files cannot be fetched.
// Exception visibility "link": it counts as locked everywhere (no links, not
// in slideshow and lists), but the exhibition page itself shows the content.
// Exhibitions in release "planning" are not returned by the API at all.

const API_PATH = "/api/exhibitions";
const CACHE_PREFIX = "tj:exhibition:v2:";
const CACHE_TTL = 10 * 60 * 1000;   // 10 minutes

let exhibitionsCache = null;   // all exhibitions, once loaded

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

  const match = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(text);

  return match ? match[1] : null;
}

// Date → Date (local time, midnight), null for an invalid date.
// The API returns ISO strings ("2026-12-24T00:00:00.000Z" for local
// midnight), the old JSON files used "YYYY-MM-DD".
function parseDate(exhibition) {
  const value = exhibition?.date;

  if (!value) {
    return null;
  }

  let date;

  if (value.includes("T")) {
    date = new Date(value);
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    if (date && (date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3]))) {
      date = null;
    }
  }

  if (!date || Number.isNaN(date.getTime())) {
    console.warn("Invalid date for “" + exhibition.id + "”:", value);
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

// Number from the id: "exhibition-12" → 12
function getNumber(exhibition) {
  const match = /(\d+)$/.exec(exhibition.id);

  return match ? Number(match[1]) : Infinity;
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

// Earliest date first, on the same date the lower number.
// "Coming soon" always comes after all exhibitions with a date.
function compareByDate(a, b) {
  const soonA = isComingSoon(a);
  const soonB = isComingSoon(b);

  if (soonA || soonB) {
    return Number(soonA) - Number(soonB);
  }

  return (parseDate(a) - parseDate(b)) || (getNumber(a) - getNumber(b));
}

// "2026-12-24" → "24 December 2026"
function formatDate(exhibition) {
  if (isComingSoon(exhibition)) {
    return "Coming soon";
  }

  const date = parseDate(exhibition);

  return date
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";
}

// Completes the cover with the matching gallery medium if it only exists as an id
// (from the API it already comes complete with src)
function resolveFrontPage(exhibition) {
  const frontPageReference = exhibition.frontPage;

  if (!frontPageReference?.id || frontPageReference.src) {
    return exhibition;
  }

  const media = (exhibition.gallery || []).find((item) => item.id === frontPageReference.id);

  if (!media) {
    console.error("Cover medium not found: " + frontPageReference.id);
  }

  return { ...exhibition, frontPage: media || null };
}

// ---------- Images in a suitable size ----------

const SIZE_ORDER = ["thumb", "medium", "large"];

// URL of a size, falling back to the next larger one or the original
function getImageUrl(media, size) {
  if (!media) {
    return "";
  }

  const start = Math.max(0, SIZE_ORDER.indexOf(size));

  for (let index = start; index < SIZE_ORDER.length; index += 1) {
    const candidate = media.sizes?.[SIZE_ORDER[index]];

    if (candidate?.url) {
      return candidate.url;
    }
  }

  return media.src || "";
}

// Sets src, srcset, sizes, width/height (no layout shift) and decoding.
//   size:  preferred size ("thumb" | "medium" | "large")
//   sizes: HTML "sizes" attribute for responsive selection, e.g. "(max-width: 600px) 100vw, 50vw"
//   lazy:  true → loading="lazy"
//   priority: true → fetchpriority="high" (first visible image)
function setImageSources(image, media, options = {}) {
  const size = options.size || "medium";
  const chosen = media.sizes?.[size];

  image.src = getImageUrl(media, size);

  const candidates = SIZE_ORDER
    .map((name) => media.sizes?.[name])
    .filter((entry) => entry?.url && entry.width);

  if (candidates.length > 1) {
    image.srcset = candidates.map((entry) => entry.url + " " + entry.width + "w").join(", ");
    image.sizes = options.sizes || "100vw";
  }

  const width = chosen?.width || media.width;
  const height = chosen?.height || media.height;

  if (width && height) {
    image.width = width;
    image.height = height;
  }

  image.decoding = "async";

  if (options.lazy) {
    image.loading = "lazy";
  }

  if (options.priority) {
    image.setAttribute("fetchpriority", "high");
  }

  return image;
}

// Pull the images of an exhibition into the browser cache ahead of time
// (cover + the first gallery items), e.g. while the intro video is playing
function preloadExhibitionImages(exhibition, count = 6) {
  const items = [exhibition.frontPage, ...(exhibition.gallery || [])]
    .filter((item) => item && item.type === "image")
    .slice(0, count + 1);

  items.forEach((item) => {
    const image = new Image();

    image.decoding = "async";
    image.src = getImageUrl(item, "medium");
  });
}

// Poster as an element:
//   locked              → <div class="poster_locked"><img></div>, no link
//   with intro video    → <a data-intro data-id> (intro.js opens the overlay)
//   without video       → <a> straight to the exhibition
// options: { altText, size, sizes, lazy, priority } as in setImageSources
function createPosterElement(exhibition, poster, options = {}) {
  const image = document.createElement("img");

  setImageSources(image, poster, { size: "medium", ...options });
  image.alt = poster.alt || options.altText || "Poster: " + exhibition.title;

  let wrapper;

  if (isLocked(exhibition)) {
    wrapper = document.createElement("div");
    wrapper.className = "poster_locked";
  } else {
    wrapper = document.createElement("a");
    wrapper.href = getExhibitionLink(exhibition);
    wrapper.dataset.id = exhibition.id;

    if (getYouTubeId(exhibition.video)) {
      wrapper.dataset.intro = "true";
    }
  }

  wrapper.appendChild(image);

  return wrapper;
}

// ---------- Loading ----------

// Only allow simple ids
function isValidId(id) {
  return /^[a-z0-9-]+$/i.test(id || "");
}

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  return response.json();
}

// A medium from the API (upload document) → page format
function mapMedia(media, name, alt) {
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
    // Alt text of the gallery row, otherwise the one of the file
    alt: alt || media.alt || "",
    name: name || media.name || "",
    width: media.width,
    height: media.height,
    sizes,
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
      .map((row) => mapMedia(row.file, row.name, row.alt))
      .filter(Boolean),
  };
}

// Short-term cache in sessionStorage: intro.js stores the exhibition while the
// video plays, exhibition.js then renders it without waiting
function readCachedExhibition(id) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + id);
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
  try {
    sessionStorage.setItem(
      CACHE_PREFIX + exhibition.id,
      JSON.stringify({ time: Date.now(), data: exhibition })
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
    API_PATH + "?where[slug][equals]=" + encodeURIComponent(id) + "&depth=1&limit=1"
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

// ---------- YouTube consent ----------
//
// Videos are hosted on YouTube. Before the first contact with Google (player
// script, iframe) the visitor has to agree (§ 25 TDDDG / GDPR). The decision
// is remembered in localStorage; /privacy offers a button to reset it.

const YOUTUBE_CONSENT_KEY = "tj:consent:youtube";

function hasYouTubeConsent() {
  try {
    return localStorage.getItem(YOUTUBE_CONSENT_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function setYouTubeConsent(value) {
  try {
    if (value) {
      localStorage.setItem(YOUTUBE_CONSENT_KEY, "1");
    } else {
      localStorage.removeItem(YOUTUBE_CONSENT_KEY);
    }
  } catch (error) {
    // localStorage not available – then the consent only applies to this click
  }
}

// Notice card in place of the video. options:
//   cover   – medium (cover/poster) as background, from our own server
//   onPlay  – called after the click on "Play video"
function createYouTubeNotice(options = {}) {
  const notice = document.createElement("div");

  notice.className = "yt_notice";

  if (options.cover) {
    const image = document.createElement("img");

    setImageSources(image, options.cover, { size: "medium", lazy: true });
    image.alt = "";
    image.className = "yt_notice_cover";
    notice.appendChild(image);
  }

  const body = document.createElement("div");

  body.className = "yt_notice_body";

  const text = document.createElement("p");

  text.className = "yt_notice_text";
  text.append(
    "This video is hosted on YouTube. If you play it, your IP address and device information are sent to Google. Details in the ",
  );

  const link = document.createElement("a");

  link.href = "/privacy";
  link.textContent = "privacy policy";
  text.appendChild(link);
  text.append(". Your choice is remembered in this browser.");
  body.appendChild(text);

  const button = document.createElement("button");

  button.type = "button";
  button.className = "yt_notice_button";
  button.textContent = "▶ Play video";
  button.addEventListener("click", () => {
    setYouTubeConsent(true);
    options.onPlay?.();
  });
  body.appendChild(button);

  notice.appendChild(body);

  return notice;
}

// /privacy: "Forget my YouTube consent"
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-reset-youtube-consent]");

  if (!button) {
    return;
  }

  setYouTubeConsent(false);
  button.textContent = "Done – the notice will be shown again before videos.";
  button.disabled = true;
});
