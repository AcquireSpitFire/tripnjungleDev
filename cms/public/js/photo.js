// Page of a single photo: /exhibition/<exhibition id>/photo/<media id>
// (target of the QR codes, reached via the short link /p/<media id>).
//
// Shows the photo large, its name, the artist and links to the previous/next
// photo and to the whole exhibition. Arrow keys switch photos, a click opens
// the fullscreen view. Same visibility as the exhibition page: public and
// "locked with link" show the photo, otherwise "not available yet".
//
// Needs:    data.js, elements.js, shop.js (setupPhotoShop), viewer.js
// Provides: –

const photoTitle = document.getElementById("title");
const photoArtists = document.getElementById("artists");
const photoFigure = document.getElementById("photo");
const photoNote = document.getElementById("photo_note");
const prevLink = document.getElementById("prev_photo");
const nextLink = document.getElementById("next_photo");
// Fullscreen view through all photos of the exhibition; the photos are set in renderPhoto
let shownInViewer = null;
let afterViewerClose = () => {};
const photoViewer = createViewer({
  element: document.getElementById("viewer"),
  onChange: (media) => {
    shownInViewer = media;
  },
  onClose: () => afterViewerClose(),
});

// /exhibition/<slug>/photo/<id>
function getPhotoIds() {
  const match = /^\/exhibition\/([^/?#]+)\/photo\/(\d+)\/?$/.exec(window.location.pathname);

  return match ? { slug: decodeURIComponent(match[1]), photo: match[2] } : null;
}

function photoLink(exhibition, item) {
  return (
    getExhibitionLink(exhibition) +
    "/photo/" +
    encodeURIComponent(item.id) +
    (PREVIEW ? "?preview" : "")
  );
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

function renderPhoto(exhibition, item, index) {
  const gallery = exhibition.gallery;
  const photos = gallery.filter((entry) => entry.type === "image");

  photoViewer.setItems(photos);

  // Closed on another photo than this one: go to that photo's page
  afterViewerClose = () => {
    if (shownInViewer && shownInViewer.id !== item.id) {
      location.replace(photoLink(exhibition, shownInViewer));
    }
  };

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
    image.addEventListener("click", () =>
      photoViewer.open(photos.findIndex((photo) => photo.id === item.id)),
    );
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
      if (photoViewer.isOpen() || event.target.tagName === "VIDEO") {
        return;
      }

      if (event.key === "ArrowLeft") {
        location.href = prevLink.href;
      } else if (event.key === "ArrowRight") {
        location.href = nextLink.href;
      }
    });
  }
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
