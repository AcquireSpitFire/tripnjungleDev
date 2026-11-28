// Shows one exhibition: /exhibition/<id> (the old form exhibition.html?id=… is redirected by the
// server).
//
// Top: title, theme, "by <artists>" and the slideshow with the cover + all images/videos – on
// phones (≤ 600 px) no slideshow, only the cover as one large image.
// Below: description, gallery with all images/videos (phone: stacked, desktop: horizontally
// scrolling strip), the artists with their short text and at the very bottom the intro video to
// watch again. Locked exhibitions (locked: true) only show a notice, except with visibility
// "link" (access via the direct address). The data comes from sessionStorage (preloaded by
// intro.js) or the API.
//
// Needs:    data.js, elements.js, consent.js, shop.js (setupExhibitionShop), slideshow.js, viewer.js
// Provides: –

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

let slideshow = null;
let viewer = null;

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
  image.dataset.mediaId = item.id;

  return image;
}

// ---------- Slideshow ----------

// One slide: the image (or video) and its name below it. The line is always there, even
// without a name, so the dots do not jump.
function renderSlide(item, index, content) {
  let video = null;

  if (item.type === "video") {
    video = createMedia(item);
    video.autoplay = true;
    video.muted = true;
    content.appendChild(video);
  } else {
    // load the visible image right away
    content.appendChild(createMedia(item, { lazy: false, priority: index === 0 }));
  }

  content.appendChild(createParagraph("slide_caption", getName(item)));

  return video;
}

// Cover first, then all gallery items – without showing the cover twice
function mediaItems(exhibition) {
  const gallery = exhibition.gallery || [];
  const frontPage = exhibition.frontPage;

  return frontPage
    ? [
        frontPage,
        ...gallery.filter((item) => item.id !== frontPage.id && item.src !== frontPage.src),
      ]
    : gallery.slice();
}

// Phones get no slideshow (swiping through the photos happens in the fullscreen view)
const wideScreen = window.matchMedia("(min-width: 601px)");

function buildSlideshow(items) {
  slideshow = createSlideshow({
    content: slideContent,
    dots: dotsContainer,
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    items,
    render: renderSlide,
    dotLabel: (index) => `Image ${index + 1}`,
    // While an image is open in fullscreen the slideshow stays put
    keysPaused: () => viewer?.isOpen(),
  });
  slideshow.show(0);
}

// Phones: the cover as one large image where the slideshow would be (tap → fullscreen view)
function showCover(exhibition) {
  const cover = mediaItems(exhibition)[0];

  if (!cover) {
    return;
  }

  const figure = document.createElement("figure");
  const media = createMedia(cover, {
    sizes: "100vw",
    lazy: wideScreen.matches,
    priority: !wideScreen.matches,
  });

  figure.className = "mobile_cover";
  figure.appendChild(media);
  slideshowElement.insertAdjacentElement("afterend", figure);
}

function setupSlideshow(exhibition) {
  const items = mediaItems(exhibition);

  if (items.length === 0) {
    slideshowElement.hidden = true;
    return;
  }

  // Dots only when there is more than one image
  if (items.length === 1) {
    slideshowElement.classList.add("single");
  }

  showCover(exhibition);

  if (wideScreen.matches) {
    buildSlideshow(items);
  }

  // Turning the phone or resizing the window across the breakpoint
  wideScreen.addEventListener("change", (event) => {
    if (event.matches && !slideshow) {
      buildSlideshow(items);
    } else if (event.matches) {
      slideshow.resume();
    } else {
      slideshow?.pause();
    }
  });
}

// ---------- Gallery ----------

function setupGallery(exhibition) {
  (exhibition.gallery || []).forEach((item) => {
    // Every image/video sits in a <figure>, its name below it (if any)
    const figure = document.createElement("figure");
    const name = getName(item);
    const media = createMedia(item, { sizes: "(max-width: 600px) 100vw, 480px" });

    // Every photo has a page of its own (QR codes, prints): the image links there. A plain click
    // opens the fullscreen view instead (setupViewer); Ctrl/Cmd/middle click opens the page.
    if (item.type === "image" && item.id) {
      const link = document.createElement("a");

      link.href = getExhibitionLink(exhibition) + "/photo/" + encodeURIComponent(item.id);
      link.className = "photo_link";
      link.appendChild(media);
      figure.appendChild(link);
    } else {
      figure.appendChild(media);
    }

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
        return; // no strip (phone) or the touchpad already scrolls sideways
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
    { passive: false },
  );
}

// ---------- Fullscreen ----------
// Clicking an image (slideshow, cover or gallery) shows it filling the screen; swipe or the arrow
// keys go to the next/previous photo (viewer.js).

function setupViewer(exhibition) {
  const photos = mediaItems(exhibition).filter((item) => item.type === "image");

  viewer = createViewer({
    element: document.getElementById("viewer"),
    items: photos,
    // The slideshow pauses while an image is open
    onOpen: () => slideshow?.pause(),
    onClose: () => {
      if (wideScreen.matches) {
        slideshow?.resume();
      }
    },
  });

  document.querySelector("main").addEventListener("click", (event) => {
    const image = event.target.closest?.("img[data-media-id]");

    if (
      !image ||
      !(
        slideContent.contains(image) ||
        galleryElement.contains(image) ||
        image.closest(".mobile_cover")
      )
    ) {
      return;
    }

    // With a modifier key the link to the photo page works as usual
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    const position = photos.findIndex((item) => item.id === image.dataset.mediaId);

    if (position >= 0) {
      event.preventDefault();
      viewer.open(position);
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
    link.textContent = artist.shortText
      ? "More about " + artist.name + " ›"
      : "Website of " + artist.name + " ›";
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
  document.title = exhibition.title + " – " + SITE_NAME;

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
    "https://www.youtube-nocookie.com/embed/" +
    videoId +
    "?rel=0" +
    (autoplay ? "&autoplay=1" : "");
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
    const cover = exhibition.frontPage || exhibition.posters?.[0];

    videoBox.appendChild(
      createYouTubeNotice({
        cover,
        onPlay: () => embedVideo(exhibition, videoId, true),
      }),
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
    ({ locked: "locked", link: "locked with link", public: "public" }[exhibition.visibility] ||
      "locked") +
    (exhibition.release === "planning" ? ", planning (not visible at all)" : "") +
    ".";
  document.querySelector("main")?.prepend(note);
  document.title = "Preview: " + exhibition.title + " – " + SITE_NAME;
}

function showExhibition(exhibition) {
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
  setupViewer(exhibition);

  // "Prints from …" below the photos that are for sale (shop.js)
  setupExhibitionShop(exhibition);
}

// id from /exhibition/<id>
function getIdFromUrl() {
  const match = /^\/exhibition\/([^/?#]+)/.exec(window.location.pathname);

  return match ? decodeURIComponent(match[1]) : null;
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
