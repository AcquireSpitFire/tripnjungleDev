// Fullscreen view of a photo (exhibition page and photo page): the large version (2560 px).
// Close: click anywhere, Esc or leaving the browser's fullscreen. Videos have their own
// fullscreen button in the video controls.
//
// Needs:    elements.js (setImageSources)
// Provides: createViewer(options) → { open(media, fallbackImage), isOpen() }
//
//   options.element / options.image   the #viewer element and the <img> inside it
//   options.onOpen / options.onClose  e.g. pause and resume the slideshow

function createViewer(options) {
  const { element, image } = options;

  function close() {
    if (element.hidden) {
      return;
    }

    element.hidden = true;
    document.documentElement.classList.remove("viewer_open");

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    options.onClose?.();
  }

  // media: the medium in page format; without one (not found) the clicked <img> is shown as it is
  function open(media, fallbackImage) {
    options.onOpen?.();

    image.removeAttribute("srcset");
    image.removeAttribute("sizes");

    if (media) {
      setImageSources(image, media, { size: "large", sizes: "100vw" });
      image.alt = media.alt || media.name || "";
    } else {
      image.src = fallbackImage.src;
      image.alt = fallbackImage.alt;
    }

    element.hidden = false;
    document.documentElement.classList.add("viewer_open");

    // Real fullscreen where the browser allows it (not on iPhone – there the view still fills
    // the whole screen)
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(() => {});
    }
  }

  element.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  // Esc in real fullscreen mode ends it without firing keydown
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      close();
    }
  });

  return { open, isOpen: () => !element.hidden };
}
