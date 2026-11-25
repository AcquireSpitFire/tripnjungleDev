// Shows one exhibition. Which one is in the URL:
// /exhibition/exhibition-1  →  exhibition with slug "exhibition-1"
// (the old form exhibition.html?id=… is redirected by the server).
//
// Top: title, theme, "by <artists>" and the slideshow with the cover + all images/videos.
// Below: description, gallery with all images/videos
// (phone: stacked, desktop: horizontally scrolling strip), the artists with
// their short text and at the very bottom the intro video to watch again.
// Locked exhibitions (locked: true) only show a notice,
// except with visibility "link" (access via the direct address).
// The data comes from sessionStorage (preloaded by intro.js) or the API.

const titleElement = document.getElementById("title");
const themeElement = document.getElementById("theme");
const descriptionElement = document.getElementById("description");
const slideshowElement = document.getElementById("slideshow");
const slideContent = document.getElementById("slide_content");
const dotsContainer = document.getElementById("dots");
const galleryElement = document.getElementById("gallery");
const videoSection = document.getElementById("video");
const videoBox = document.getElementById("video_box");
const artistsElement = document.getElementById("artists");
const aboutArtistsSection = document.getElementById("about_artists");
const aboutArtistsList = document.getElementById("about_artists_list");

let slides = [];
let currentSlide = 0;
let timer;

// Name of an image/video: "name" from the gallery row, otherwise the alt text
function getName(item) {
  return item.name || item.alt || "";
}

function createMedia(item, options = {}) {
  if (item.type === "video") {
    const video = document.createElement("video");

    video.src = item.src;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";

    return video;
  }

  const image = document.createElement("img");

  setImageSources(image, item, {
    size: "medium",
    sizes: "(max-width: 600px) 100vw, min(1200px, 90vw)",
    lazy: true,
    ...options,
  });
  image.alt = item.alt || "";

  return image;
}

// ---------- Slideshow ----------

function showSlide(index) {
  clearTimeout(timer);
  currentSlide = (index + slides.length) % slides.length;

  const item = slides[currentSlide];

  slideContent.innerHTML = "";

  if (item.type === "video") {
    const video = createMedia(item);

    video.autoplay = true;
    video.muted = true;

    // Move to the next slide when the video ends
    video.addEventListener("ended", nextSlide);
    slideContent.appendChild(video);
  } else {
    // load the visible image right away
    const image = createMedia(item, { lazy: false, priority: index === 0 });

    slideContent.appendChild(image);
    startTimer(5000);
  }

  // Name below the image, like the link on the home page. The line is
  // always there, even without a name, so the dots do not jump.
  const caption = document.createElement("p");

  caption.className = "slide_caption";
  caption.textContent = getName(item);
  slideContent.appendChild(caption);

  updateDots();
}

function nextSlide() {
  showSlide(currentSlide + 1);
}

function previousSlide() {
  showSlide(currentSlide - 1);
}

// Swipe left = next image, swipe right = previous image
function setupSwipe() {
  let startX = 0;
  let startY = 0;

  slideContent.addEventListener("touchstart", (event) => {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });

  slideContent.addEventListener("touchend", (event) => {
    const deltaX = event.changedTouches[0].clientX - startX;
    const deltaY = event.changedTouches[0].clientY - startY;

    // Only clear, mostly horizontal swipes count (no scrolling, no tapping)
    if (slides.length < 2 || Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      nextSlide();
    } else {
      previousSlide();
    }
  });
}

// Arrow right = next image, arrow left = previous image
function setupKeys() {
  document.addEventListener("keydown", (event) => {
    // A focused video uses the arrow keys itself for seeking,
    // and while an image is open in fullscreen the slideshow stays put
    if (slides.length < 2 || event.target.tagName === "VIDEO" || !viewerElement.hidden) {
      return;
    }

    if (event.key === "ArrowRight") {
      nextSlide();
    } else if (event.key === "ArrowLeft") {
      previousSlide();
    }
  });
}

function startTimer(duration) {
  clearTimeout(timer);

  // With only one image there is nothing to advance to
  if (slides.length > 1) {
    timer = setTimeout(nextSlide, duration);
  }
}

function updateDots() {
  dotsContainer.innerHTML = "";

  slides.forEach((slide, index) => {
    const dot = document.createElement("button");

    dot.className = "dot";
    dot.setAttribute("aria-label", `Image ${index + 1}`);

    if (index === currentSlide) {
      dot.classList.add("active");
    }

    dot.addEventListener("click", () => {
      showSlide(index);
    });

    dotsContainer.appendChild(dot);
  });
}

function setupSlideshow(exhibition) {
  // Cover first, then all gallery items – without showing the cover twice
  const gallery = exhibition.gallery || [];
  const frontPageReference = exhibition.frontPage;
  const frontPage = frontPageReference?.src
    ? frontPageReference
    : gallery.find((item) => item.id === frontPageReference?.id);

  slides = frontPage
    ? [frontPage, ...gallery.filter((item) => item.id !== frontPage.id && item.src !== frontPage.src)]
    : gallery.slice();

  if (slides.length === 0) {
    slideshowElement.hidden = true;
    return;
  }

  // Dots only when there is more than one image
  if (slides.length === 1) {
    slideshowElement.classList.add("single");
  }

  document.getElementById("next").addEventListener("click", nextSlide);
  document.getElementById("prev").addEventListener("click", previousSlide);
  setupSwipe();
  setupKeys();
  showSlide(0);
}

// ---------- Gallery ----------

function setupGallery(exhibition) {
  (exhibition.gallery || []).forEach((item) => {
    // Every image/video sits in a <figure>, its name below it (if any)
    const figure = document.createElement("figure");
    const name = getName(item);

    figure.appendChild(
      createMedia(item, { sizes: "(max-width: 600px) 100vw, 480px" })
    );

    // Aspect ratio of the image: on phones the figure is sized by it
    // (portrait images larger instead of small inside the 3:2 box, see CSS).
    // Dimensions come from the generated sizes: those are rotated correctly.
    // The original may be stored landscape and only be portrait via EXIF.
    const dims = item.sizes?.medium || item.sizes?.large || item.sizes?.thumb || item;

    if (item.type === "image" && dims.width && dims.height) {
      figure.style.setProperty("--ratio", dims.width / dims.height);
    }

    // Credit only when the photo is by someone else than the exhibition's artists
    const otherArtist =
      item.artist && !(exhibition.artists || []).some((artist) => artist.slug === item.artist.slug)
        ? item.artist
        : null;

    if (name || otherArtist) {
      const caption = document.createElement("figcaption");

      caption.className = "caption";
      caption.textContent = name;

      if (otherArtist) {
        const credit = document.createElement("span");

        credit.className = "caption_artist";
        credit.appendChild(createArtistCredit([otherArtist]));
        caption.append(name ? " – " : "", credit);
      }

      figure.appendChild(caption);
    }

    // Every photo/video has an id, e.g. for links like /exhibition/…#media-123
    if (item.id) {
      figure.id = "media-" + item.id;
    }

    galleryElement.appendChild(figure);
  });

  // Desktop: the mouse wheel scrolls the strip horizontally. At the start/end
  // of the strip the page scrolls again so you do not "get stuck".
  galleryElement.addEventListener(
    "wheel",
    (event) => {
      const canScroll = galleryElement.scrollWidth > galleryElement.clientWidth;

      if (!canScroll || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;   // no strip (phone) or the touchpad already scrolls sideways
      }

      const atStart = galleryElement.scrollLeft <= 0;
      const atEnd =
        galleryElement.scrollLeft + galleryElement.clientWidth >= galleryElement.scrollWidth - 1;

      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) {
        return;
      }

      event.preventDefault();
      galleryElement.scrollLeft += event.deltaY;
    },
    { passive: false }
  );
}

// ---------- Fullscreen ----------
// Clicking an image (slideshow or gallery) shows it filling the screen
// in the large version (2560 px). Close: click anywhere, Esc or ×.
// Videos have their own fullscreen button in the video controls.

const viewerElement = document.getElementById("viewer");
const viewerImage = document.getElementById("viewer_image");

// Which medium is behind an <img>? (via the URL of one of its sizes)
function findMediaForImage(image, exhibition) {
  const all = [exhibition.frontPage, ...(exhibition.gallery || [])].filter(Boolean);

  return all.find((item) => image.currentSrc === item.src || image.src === item.src
    || Object.values(item.sizes || {}).some((size) => size.url === image.currentSrc || size.url === image.src));
}

let currentExhibition = null;

function openViewer(image) {
  clearTimeout(timer);   // pause the slideshow while the image is open

  const media = currentExhibition && findMediaForImage(image, currentExhibition);

  viewerImage.removeAttribute("srcset");
  viewerImage.removeAttribute("sizes");

  if (media) {
    setImageSources(viewerImage, media, { size: "large", sizes: "100vw" });
  } else {
    viewerImage.src = image.src;
  }

  viewerImage.alt = image.alt;
  viewerElement.hidden = false;
  document.documentElement.classList.add("viewer_open");

  // Real fullscreen where the browser allows it (not on iPhone –
  // there the view still fills the whole screen)
  if (viewerElement.requestFullscreen) {
    viewerElement.requestFullscreen().catch(() => {});
  }
}

function closeViewer() {
  if (viewerElement.hidden) {
    return;
  }

  viewerElement.hidden = true;
  document.documentElement.classList.remove("viewer_open");

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // Let the slideshow continue if an image is currently shown
  if (slides[currentSlide] && slides[currentSlide].type !== "video") {
    startTimer(5000);
  }
}

function setupViewer() {
  [slideContent, galleryElement].forEach((container) => {
    container.addEventListener("click", (event) => {
      if (event.target.tagName === "IMG") {
        openViewer(event.target);
      }
    });
  });

  viewerElement.addEventListener("click", closeViewer);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeViewer();
    }
  });

  // Esc in real fullscreen mode ends it without firing keydown
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      closeViewer();
    }
  });
}

// ---------- Artists ----------

// "by …" in the header (also for locked exhibitions: the credit is public)
function setupArtistCredit(exhibition) {
  const artists = exhibition.artists || [];

  if (!artists.length) {
    return;
  }

  artistsElement.appendChild(createArtistCredit(artists));
  artistsElement.hidden = false;
}

// Below the gallery: name, short text, link to the artist page
function setupAboutArtists(exhibition) {
  const artists = exhibition.artists || [];

  if (!artists.length) {
    return;
  }

  document.getElementById("about_artists_title").textContent =
    artists.length > 1 ? "About the artists" : "About the artist";

  artists.forEach((artist) => {
    const entry = document.createElement("div");
    const name = document.createElement("h3");

    entry.className = "about_artist";
    name.className = "about_artist_name";
    name.textContent = artist.name;
    entry.appendChild(name);

    artist.shortText
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .forEach((block) => {
        const paragraph = document.createElement("p");

        paragraph.textContent = block;
        entry.appendChild(paragraph);
      });

    const link = document.createElement("a");

    link.className = "about_artist_link";
    link.href = artist.link;
    link.textContent = artist.shortText ? "More about " + artist.name + " ›" : "Website of " + artist.name + " ›";
    entry.appendChild(link);

    aboutArtistsList.appendChild(entry);
  });

  aboutArtistsSection.hidden = false;
}

// ---------- Loading ----------

function showError(message) {
  titleElement.textContent = "Exhibition not found";
  descriptionElement.textContent = message;
  slideshowElement.hidden = true;
}

// Locked exhibition: title, but no images
function showLocked(exhibition) {
  document.title = exhibition.title + " – Tripnjungle";

  titleElement.textContent = exhibition.title;
  themeElement.textContent = exhibition.theme || "";
  descriptionElement.textContent = "This exhibition is not available yet.";
  slideshowElement.hidden = true;
  setupArtistCredit(exhibition);
}

// Embed the intro video of the exhibition below the gallery.
// Without stored YouTube consent there is a notice card first (cover/poster
// as background, from our own server); the iframe only comes after the click.
function embedVideo(exhibition, videoId, autoplay) {
  const iframe = document.createElement("iframe");

  iframe.src =
    "https://www.youtube-nocookie.com/embed/" + videoId + "?rel=0" + (autoplay ? "&autoplay=1" : "");
  iframe.title = "Video: " + exhibition.title;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.loading = "lazy";

  videoBox.innerHTML = "";
  videoBox.appendChild(iframe);
}

function setupVideo(exhibition) {
  const videoId = getYouTubeId(exhibition.video);

  if (!videoId) {
    return;
  }

  if (hasYouTubeConsent()) {
    embedVideo(exhibition, videoId, false);
  } else {
    const cover = resolveFrontPage(exhibition).frontPage || exhibition.posters?.[0];

    videoBox.appendChild(
      createYouTubeNotice({
        cover,
        onPlay: () => embedVideo(exhibition, videoId, true),
      })
    );
  }

  videoSection.hidden = false;
}

// Preview from the admin: mark the page so it is not mistaken for the public view
function showPreviewNote(exhibition) {
  const note = document.createElement("p");

  note.className = "preview_note";
  note.textContent =
    "Preview with your login – visitors see this exhibition as: " +
    ({ locked: "locked", link: "locked with link", public: "public" }[exhibition.visibility] || "locked") +
    (exhibition.release === "planning" ? ", planning (not visible at all)" : "") +
    ".";
  document.querySelector("main")?.prepend(note);
  document.title = "Preview: " + exhibition.title + " – Tripnjungle";
}

function showExhibition(exhibition) {
  currentExhibition = exhibition;

  if (PREVIEW) {
    showPreviewNote(exhibition);
  }

  // "Locked with link" counts as visible here: whoever has the address sees the content
  if (!canView(exhibition)) {
    showLocked(exhibition);
    return;
  }

  // The server already set title/meta; here only the visible content
  titleElement.textContent = exhibition.title;
  themeElement.textContent = exhibition.theme || "";
  descriptionElement.textContent = exhibition.description || "";

  setupArtistCredit(exhibition);
  setupSlideshow(exhibition);
  setupGallery(exhibition);
  setupAboutArtists(exhibition);
  setupVideo(exhibition);
  setupViewer();

  // "Prints from …" below the photos that are for sale (shop.js)
  setupExhibitionShop(exhibition);
}

// id from /exhibition/<id>, fallback ?id=… (old links)
function getIdFromUrl() {
  const match = /^\/exhibition\/([^/?#]+)/.exec(window.location.pathname);

  if (match) {
    return decodeURIComponent(match[1]);
  }

  return new URLSearchParams(window.location.search).get("id");
}

async function startExhibition() {
  const id = getIdFromUrl();

  if (!isValidId(id)) {
    showError("No valid exhibition specified.");
    return;
  }

  try {
    showExhibition(await loadExhibition(id));
  } catch (error) {
    showError("The exhibition “" + id + "” could not be loaded.");
    console.error(error);
  }
}

startExhibition();
