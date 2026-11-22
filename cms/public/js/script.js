// Home page. The exhibitions are loaded via data.js:
// every public exhibition is a slide with its cover.
// If there is an upcoming exhibition with a poster, its poster sits above
// the slideshow, all other upcoming posters below it.
// Clicks on posters with a video are caught by intro.js, slides lead straight to the exhibition.
let slides = [];

let currentSlide = 0;
let timer;

const slideContent = document.getElementById("slide_content");
const dotsContainer = document.getElementById("dots");
const posterContainer = document.getElementById("front_poster");

function showSlide(index) {
  clearTimeout(timer);
  currentSlide = (index + slides.length) % slides.length;

  const exhibition = slides[currentSlide];
  const frontPage = exhibition.frontPage;
  const link = getExhibitionLink(exhibition);

  slideContent.innerHTML = "";

  if (frontPage?.type === "image") {
    // The whole image is a link to the exhibition
    const anchor = document.createElement("a");
    anchor.href = link;

    const image = document.createElement("img");

    setImageSources(image, frontPage, {
      size: "medium",
      sizes: "(max-width: 600px) 100vw, min(1200px, 90vw)",
      priority: index === 0,
    });
    image.alt = frontPage.alt || exhibition.title;

    anchor.appendChild(image);
    slideContent.appendChild(anchor);
    startTimer(5000);
  }

  if (frontPage?.type === "video") {
    const video = document.createElement("video");

    video.src = frontPage.src;
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    slideContent.appendChild(video);

    // Move to the next slide when the video ends
    video.addEventListener("ended", nextSlide);
  } else if (!frontPage) {
    startTimer(5000);
  }

  // Title as a link below every slide (for videos the only link,
  // because the video controls catch clicks on the video itself)
  const titleLink = document.createElement("a");
  titleLink.href = link;
  titleLink.className = "slide_link";
  titleLink.textContent = exhibition.title + " – view exhibition ›";
  slideContent.appendChild(titleLink);

  updateDots();
}

function nextSlide() {
  showSlide(currentSlide + 1);
}

function previousSlide() {
  showSlide(currentSlide - 1);
}

// Swipe left = next slide, swipe right = previous slide
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
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      nextSlide();
    } else {
      previousSlide();
    }
  });
}

// Arrow right = next slide, arrow left = previous slide
function setupKeys() {
  document.addEventListener("keydown", (event) => {
    // A focused video uses the arrow keys itself for seeking,
    // and while the intro is open the slideshow stays put
    if (event.target.tagName === "VIDEO" || document.getElementById("intro")) {
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
  timer = setTimeout(nextSlide, duration);
}

// For intro.js: pause the slideshow while the intro video plays
window.pauseSlideshow = () => {
  clearTimeout(timer);
  slideContent.querySelector("video")?.pause();
};

window.resumeSlideshow = () => {
  if (slides.length === 0) {
    return;
  }

  const video = slideContent.querySelector("video");

  if (video) {
    video.play().catch(() => {});
  } else {
    startTimer(5000);
  }
};

function updateDots() {
  dotsContainer.innerHTML = "";

  slides.forEach((slide, index) => {
    const dot = document.createElement("button");

    dot.className = "dot";
    dot.setAttribute("aria-label", `Slide ${index + 1}`);

    if (index === currentSlide) {
      dot.classList.add("active");
    }

    dot.addEventListener("click", () => {
      showSlide(index);
    });

    dotsContainer.appendChild(dot);
  });
}

// ---------- Posters ----------

// The exhibition with the earliest date from today on,
// on the same date the one with the lowest number
function findNextExhibition(exhibitions) {
  const today = getToday();

  const upcoming = exhibitions
    .filter((exhibition) => exhibition.posters?.[0]?.src)
    .filter((exhibition) => isUpcoming(exhibition, today))
    .sort(compareByDate);

  return upcoming[0];
}

// The poster takes the place of the slideshow, the slideshow moves below it.
// The page then no longer fits on one screen and scrolls.
// The poster is the most important image of the page: large version, high priority.
function showPoster(exhibition) {
  posterContainer.appendChild(
    createPosterElement(exhibition, exhibition.posters[0], {
      size: "large",
      sizes: "(max-width: 600px) 100vw, min(100vw, 70vh)",
      priority: true,
    })
  );
  posterContainer.hidden = false;
  document.documentElement.classList.replace("fit", "has_poster");
}

// All upcoming posters below the slideshow, sorted by date.
// The poster already shown above the slideshow is skipped.
function showUpcomingPosters(exhibitions, shownPoster) {
  const container = document.getElementById("upcoming_posters");
  const today = getToday();
  const upcoming = exhibitions
    .filter((exhibition) => exhibition.posters?.length && isUpcoming(exhibition, today))
    .sort(compareByDate);

  upcoming.forEach((exhibition) => {
    exhibition.posters.forEach((poster) => {
      if (!poster.src || poster === shownPoster) {
        return;
      }

      const element = createPosterElement(exhibition, poster, {
        size: "medium",
        sizes: "(max-width: 600px) 100vw, 25vw",
        lazy: true,
      });
      const caption = document.createElement("p");

      caption.className = "upcoming_caption";
      caption.textContent = exhibition.title + " · " + formatDate(exhibition);

      element.appendChild(caption);
      container.appendChild(element);
    });
  });

  container.hidden = container.childElementCount === 0;
}

// ---------- Loading ----------

async function start() {
  let exhibitions;

  try {
    exhibitions = await loadExhibitions();
  } catch (error) {
    slideContent.textContent = "Exhibitions could not be loaded.";
    console.error(error);
    return;
  }

  if (exhibitions.length === 0) {
    slideContent.textContent = "No exhibitions yet.";
    return;
  }

  // Insert the poster before the slideshow so nothing visibly jumps
  const nextExhibition = findNextExhibition(exhibitions);

  if (nextExhibition) {
    showPoster(nextExhibition);
  }

  showUpcomingPosters(exhibitions, nextExhibition?.posters[0]);

  // Only public exhibitions in the slideshow: locked ones are visible
  // through their poster, their cover should not be seen yet
  slides = exhibitions
    .filter((exhibition) => !isLocked(exhibition))
    .map(resolveFrontPage);

  if (slides.length === 0) {
    slideContent.textContent = "No exhibitions available yet.";
    return;
  }

  document.getElementById("next").addEventListener("click", nextSlide);
  document.getElementById("prev").addEventListener("click", previousSlide);
  setupSwipe();
  setupKeys();

  showSlide(0);
}

start();
