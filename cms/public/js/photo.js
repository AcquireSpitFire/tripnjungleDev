// Page of a single photo: /exhibition/<exhibition id>/photo/<media id>
// (target of the QR codes, reached via the short link /p/<media id>).
//
// Shows the photo large, its name, the artist and links to the previous/next
// photo and to the whole exhibition. Arrow keys switch photos, a click opens
// the fullscreen view. Same visibility as the exhibition page: public and
// "locked with link" show the photo, otherwise "not available yet".

const photoTitle = document.getElementById("title");
const photoArtists = document.getElementById("artists");
const photoFigure = document.getElementById("photo");
const photoNote = document.getElementById("photo_note");
const prevLink = document.getElementById("prev_photo");
const nextLink = document.getElementById("next_photo");
const photoViewer = document.getElementById("viewer");
const photoViewerImage = document.getElementById("viewer_image");

// /exhibition/<slug>/photo/<id>
function getPhotoIds() {
  const match = /^\/exhibition\/([^/?#]+)\/photo\/(\d+)\/?$/.exec(window.location.pathname);

  return match ? { slug: decodeURIComponent(match[1]), photo: match[2] } : null;
}

function photoLink(exhibition, item) {
  return getExhibitionLink(exhibition) + "/photo/" + encodeURIComponent(item.id) + (PREVIEW ? "?preview" : "");
}

function showPhotoNote(message) {
  photoNote.textContent = message;
  photoNote.hidden = false;
}

function setCredit(artists) {
  if (artists.length) {
    photoArtists.appendChild(createArtistCredit(artists));
    photoArtists.hidden = false;
  }
}

function openPhotoViewer(item) {
  setImageSources(photoViewerImage, item, { size: "large", sizes: "100vw" });
  photoViewerImage.alt = item.alt || "";
  photoViewer.hidden = false;
  document.documentElement.classList.add("viewer_open");

  if (photoViewer.requestFullscreen) {
    photoViewer.requestFullscreen().catch(() => {});
  }
}

function closePhotoViewer() {
  if (photoViewer.hidden) {
    return;
  }

  photoViewer.hidden = true;
  document.documentElement.classList.remove("viewer_open");

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function renderPhoto(exhibition, item, index) {
  const gallery = exhibition.gallery;

  photoTitle.textContent = item.name || exhibition.title;
  setCredit(item.artist ? [item.artist] : exhibition.artists || []);

  if (item.type === "video") {
    const video = document.createElement("video");

    video.src = item.src;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    photoFigure.appendChild(video);
  } else {
    const image = document.createElement("img");

    setImageSources(image, item, {
      size: "large",
      sizes: "(max-width: 600px) 100vw, min(1600px, 92vw)",
      priority: true,
    });
    image.alt = item.alt || item.name || "";
    image.addEventListener("click", () => openPhotoViewer(item));
    photoFigure.appendChild(image);
  }

  photoFigure.hidden = false;

  // Previous/next photo of the exhibition (wraps around)
  if (gallery.length > 1) {
    const previous = gallery[(index - 1 + gallery.length) % gallery.length];
    const next = gallery[(index + 1) % gallery.length];

    prevLink.href = photoLink(exhibition, previous);
    nextLink.href = photoLink(exhibition, next);
    prevLink.hidden = false;
    nextLink.hidden = false;

    document.addEventListener("keydown", (event) => {
      if (!photoViewer.hidden || event.target.tagName === "VIDEO") {
        return;
      }

      if (event.key === "ArrowLeft") {
        location.href = prevLink.href;
      } else if (event.key === "ArrowRight") {
        location.href = nextLink.href;
      }
    });
  }

  photoViewer.addEventListener("click", closePhotoViewer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePhotoViewer();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      closePhotoViewer();
    }
  });
}

async function startPhoto() {
  // The server already answered "not found"
  if (document.body.dataset.photoState === "missing") {
    showPhotoNote("This photo does not exist (anymore).");
    return;
  }

  const ids = getPhotoIds();

  if (!ids || !isValidId(ids.slug)) {
    showPhotoNote("This photo does not exist.");
    return;
  }

  let exhibition;

  try {
    exhibition = await loadExhibition(ids.slug);
  } catch (error) {
    showPhotoNote("The photo could not be loaded.");
    console.error(error);
    return;
  }

  if (!canView(exhibition)) {
    setCredit(exhibition.artists || []);
    showPhotoNote("This photo is not available yet.");
    return;
  }

  const index = (exhibition.gallery || []).findIndex((item) => item.id === ids.photo);

  if (index < 0) {
    showPhotoNote("This photo is no longer part of the exhibition.");
    return;
  }

  if (PREVIEW) {
    document.title = "Preview: " + document.title;
  }

  renderPhoto(exhibition, exhibition.gallery[index], index);

  // Prints of this photo below the navigation (shop.js)
  setupPhotoShop(exhibition, exhibition.gallery[index], document.querySelector(".photo_page"));
}

startPhoto();
