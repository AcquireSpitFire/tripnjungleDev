// Building blocks for page elements: images in a suitable size, posters, the artist credit,
// paragraphs.
//
// Needs:    data.js (SIZE_ORDER, isLocked, getExhibitionLink, getYouTubeId)
// Provides: getImageUrl, setImageSources, preloadExhibitionImages, createPosterElement,
//           createArtistCredit, createParagraph

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

  const candidates = SIZE_ORDER.map((name) => media.sizes?.[name]).filter(
    (entry) => entry?.url && entry.width,
  );

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

// "by A, B & C" with links to the artist pages, as a DocumentFragment
function createArtistCredit(artists) {
  const fragment = document.createDocumentFragment();

  fragment.append("by ");

  artists.forEach((artist, index) => {
    if (index > 0) {
      fragment.append(index === artists.length - 1 ? " & " : ", ");
    }

    const link = document.createElement("a");

    link.href = artist.link;
    link.textContent = artist.name;
    fragment.appendChild(link);
  });

  return fragment;
}

// <p class="…">text</p> (text, never HTML)
function createParagraph(className, text) {
  const element = document.createElement("p");

  element.className = className;
  element.textContent = text;

  return element;
}
