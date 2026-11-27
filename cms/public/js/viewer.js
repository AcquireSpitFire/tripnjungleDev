// Fullscreen view of the photos (exhibition page and photo page): the large version (2560 px),
// one after the other. Next/previous: swipe left/right, arrow keys or the ‹ › buttons (at the end
// it starts again from the beginning). Close: tap the photo, swipe down, Esc, × or leaving the
// browser's fullscreen. Videos are not part of it (they have their own fullscreen button).
//
// Swiping uses Pointer Events, so finger, pen and mouse behave the same. The photo follows the
// finger and the view decides on release: far or fast enough sideways → next/previous photo,
// far enough down → close, hardly moved and short → a tap (close). A second finger cancels the
// gesture. The tap is recognised here and not through "click": after a touch that opened the
// view, mobile browsers do not always send a click for the next tap.
//
// Needs:    elements.js (setImageSources, getImageUrl)
// Provides: createViewer(options) → { open(index), setItems(items), isOpen() }
//
//   options.element   the #viewer element (contains #viewer_image, .viewer_prev, .viewer_next,
//                     .viewer_close, .viewer_counter)
//   options.items     the photos in page format (only images)
//   options.onOpen / options.onClose()        e.g. pause and resume the slideshow
//   options.onChange(media, index)            after every photo change

const SWIPE_DISTANCE = 40; // px sideways for the next photo
const SWIPE_SPEED = 0.35; // px per ms: a quick flick counts even when it is short
const CLOSE_DISTANCE = 90; // px down to close
const TAP_SLOP = 10; // px a tap may move
const TAP_TIME = 600; // ms a tap may last (longer = the finger rests on the photo)

function createViewer(options) {
  const { element } = options;
  const image = element.querySelector("#viewer_image");
  const prevButton = element.querySelector(".viewer_prev");
  const nextButton = element.querySelector(".viewer_next");
  const closeButton = element.querySelector(".viewer_close");
  const counter = element.querySelector(".viewer_counter");
  const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  let items = options.items || [];
  let index = 0;
  let gesture = null;

  function isOpen() {
    return !element.hidden;
  }

  function preloadNeighbours() {
    if (items.length < 2) {
      return;
    }

    [index - 1, index + 1].forEach((position) => {
      const media = items[(position + items.length) % items.length];
      const preload = new Image();

      preload.decoding = "async";
      preload.src = getImageUrl(media, "large");
    });
  }

  // direction: -1 previous, 1 next, 0 no animation
  function show(position, direction = 0) {
    if (!items.length) {
      return;
    }

    index = (position + items.length) % items.length;

    const media = items[index];

    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    setImageSources(image, media, { size: "large", sizes: "100vw" });
    image.alt = media.alt || media.name || "";

    const several = items.length > 1;

    prevButton.hidden = !several;
    nextButton.hidden = !several;
    counter.textContent = several ? index + 1 + " / " + items.length : "";

    // The new photo slides in from the side it comes from
    image.style.transition = "none";
    image.style.opacity = "";
    image.style.transform =
      direction && !reducedMotion ? "translateX(" + direction * 25 + "%)" : "";

    if (direction && !reducedMotion) {
      // Two frames: the start position has to be on screen before the transition begins
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          image.style.transition = "";
          image.style.transform = "";
        }),
      );
    }

    preloadNeighbours();
    options.onChange?.(media, index);
  }

  function step(direction) {
    if (items.length > 1) {
      show(index + direction, direction);
    }
  }

  function close() {
    if (!isOpen()) {
      return;
    }

    gesture = null;
    element.hidden = true;
    document.documentElement.classList.remove("viewer_open");

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    options.onClose?.();
  }

  // Closed by a finger: some browsers still send a "click" to the spot afterwards, which would hit
  // the gallery image below (and open its page). That one click is caught for a moment.
  let catchClicksUntil = 0;

  function closeByGesture() {
    catchClicksUntil = Date.now() + 500;
    close();
  }

  document.addEventListener(
    "click",
    (event) => {
      if (Date.now() < catchClicksUntil) {
        catchClicksUntil = 0;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  function open(position) {
    if (!items.length) {
      return;
    }

    options.onOpen?.();
    gesture = null;
    element.hidden = false;
    document.documentElement.classList.add("viewer_open");
    show(position);

    // Real fullscreen where the browser allows it (not on iPhone – there the view still fills
    // the whole screen)
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(() => {});
    }
  }

  // Back to the resting position (gesture cancelled or too short)
  function settle() {
    image.style.transition = "";
    image.style.transform = "";
    image.style.opacity = "";
  }

  element.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    // A second finger (pinch): no swipe, no tap
    if (gesture) {
      gesture = null;
      settle();
      return;
    }

    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
      dx: 0,
      dy: 0,
    };
    image.style.transition = "none";

    try {
      element.setPointerCapture(event.pointerId);
    } catch (error) {
      // not supported: the events still arrive while the pointer stays on the view
    }
  });

  element.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.id) {
      return;
    }

    gesture.dx = event.clientX - gesture.x;
    gesture.dy = event.clientY - gesture.y;

    if (Math.abs(gesture.dx) >= Math.abs(gesture.dy)) {
      image.style.transform = items.length > 1 ? "translateX(" + gesture.dx + "px)" : "";
      image.style.opacity = "";
    } else if (gesture.dy > 0) {
      image.style.transform = "translateY(" + gesture.dy + "px)";
      image.style.opacity = String(Math.max(0.3, 1 - gesture.dy / 400));
    }
  });

  function endGesture(event, cancelled) {
    if (!gesture || event.pointerId !== gesture.id) {
      return;
    }

    const { dx, dy, time } = gesture;
    const speed = Math.abs(dx) / Math.max(1, Date.now() - time);
    const sideways = Math.abs(dx) > Math.abs(dy);

    gesture = null;

    if (cancelled) {
      settle();
      return;
    }

    if (
      sideways &&
      items.length > 1 &&
      (Math.abs(dx) >= SWIPE_DISTANCE || (speed >= SWIPE_SPEED && Math.abs(dx) >= 15))
    ) {
      step(dx < 0 ? 1 : -1);
      return;
    }

    if (!sideways && dy >= CLOSE_DISTANCE) {
      closeByGesture();
      return;
    }

    // A tap on the photo or the background closes the view
    if (Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP && Date.now() - time < TAP_TIME) {
      closeByGesture();
      return;
    }

    // Moved, but not enough: back to the resting position
    settle();
  }

  // Dragging the photo with the mouse would start the browser's own drag & drop
  image.draggable = false;
  element.addEventListener("dragstart", (event) => event.preventDefault());

  element.addEventListener("pointerup", (event) => endGesture(event, false));
  element.addEventListener("pointercancel", (event) => endGesture(event, true));

  prevButton.addEventListener("click", () => step(-1));
  nextButton.addEventListener("click", () => step(1));
  closeButton.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) {
      return;
    }

    if (event.key === "Escape") {
      close();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  });

  // Esc in real fullscreen mode ends it without firing keydown
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      close();
    }
  });

  return {
    open,
    isOpen,
    setItems(list) {
      items = list;
    },
  };
}
