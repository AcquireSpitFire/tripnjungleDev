// The slideshow of the home page (script.js) and of the exhibition page (exhibition.js):
// one item after the other, dots, arrows, swipe, arrow keys, next item after 5 seconds
// (videos: when they end), and a button to pause it (WCAG 2.2.2). Visitors who asked their system
// for reduced motion get it paused from the start.
//
// Needs:    –
// Provides: createSlideshow(options)
//
//   const slideshow = createSlideshow({
//     content,        element that shows the current item
//     dots,           element for the dot buttons
//     prev, next,     the arrow buttons
//     items,          the items (exhibitions or media)
//     render(item, index, content)   fills "content"; returns the <video> if the item is a video
//     dotLabel(index)                label of a dot for screen readers
//     keysPaused()                   true while the arrow keys belong to something else
//   })
//   slideshow.show(0); slideshow.pause(); slideshow.resume(); slideshow.currentItem()

const SLIDE_DURATION = 5000;

function createSlideshow(options) {
  const { content, dots, items } = options;
  let current = 0;
  let timer;
  let paused = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  // With only one item there is nothing to advance to
  function startTimer() {
    clearTimeout(timer);

    if (items.length > 1 && !paused) {
      timer = setTimeout(next, SLIDE_DURATION);
    }
  }

  const pauseButton = document.createElement("button");

  // The label says what a click does
  function updatePauseButton() {
    pauseButton.textContent = paused ? "Play slideshow" : "Pause slideshow";
  }

  pauseButton.type = "button";
  pauseButton.className = "slideshow_pause";
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    updatePauseButton();

    if (paused) {
      clearTimeout(timer);
    } else {
      startTimer();
    }
  });

  if (items.length > 1) {
    updatePauseButton();
    dots.insertAdjacentElement("afterend", pauseButton);
  }

  function updateDots() {
    dots.innerHTML = "";

    items.forEach((item, index) => {
      const dot = document.createElement("button");

      dot.type = "button";
      dot.className = "dot";
      dot.setAttribute("aria-label", options.dotLabel(index));

      if (index === current) {
        dot.classList.add("active");
      }

      dot.addEventListener("click", () => show(index));
      dots.appendChild(dot);
    });
  }

  function show(index) {
    clearTimeout(timer);
    current = (index + items.length) % items.length;
    content.innerHTML = "";

    const video = options.render(items[current], current, content);

    if (video) {
      // Move to the next item when the video ends (not while paused)
      video.addEventListener("ended", () => {
        if (!paused) {
          next();
        }
      });
    } else {
      startTimer();
    }

    updateDots();
  }

  function next() {
    show(current + 1);
  }

  function previous() {
    show(current - 1);
  }

  // Swipe left = next item, swipe right = previous item
  let startX = 0;
  let startY = 0;

  content.addEventListener(
    "touchstart",
    (event) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    },
    { passive: true },
  );

  content.addEventListener("touchend", (event) => {
    const deltaX = event.changedTouches[0].clientX - startX;
    const deltaY = event.changedTouches[0].clientY - startY;

    // Only clear, mostly horizontal swipes count (no scrolling, no tapping)
    if (items.length < 2 || Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      next();
    } else {
      previous();
    }
  });

  // Arrow right = next item, arrow left = previous item. A focused video uses the arrow keys
  // itself for seeking.
  document.addEventListener("keydown", (event) => {
    if (items.length < 2 || event.target.tagName === "VIDEO" || options.keysPaused?.()) {
      return;
    }

    if (event.key === "ArrowRight") {
      next();
    } else if (event.key === "ArrowLeft") {
      previous();
    }
  });

  options.next.addEventListener("click", next);
  options.prev.addEventListener("click", previous);

  return {
    show,
    currentItem: () => items[current],
    // Stop moving on (intro video, fullscreen view); a playing video is paused too
    pause() {
      clearTimeout(timer);
      content.querySelector("video")?.pause();
    },
    resume() {
      const video = content.querySelector("video");

      if (video) {
        video.play().catch(() => {});
      } else {
        startTimer();
      }
    },
  };
}
