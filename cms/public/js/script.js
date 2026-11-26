// Home page. Every public exhibition is a slide with its cover (slideshow.js). If there is an
// upcoming exhibition with a poster, its poster sits above the slideshow, all other upcoming
// posters below it. Clicks on posters with a video are caught by intro.js, slides lead straight
// to the exhibition.
//
// Needs:    data.js, elements.js, slideshow.js
// Provides: window.pauseSlideshow / window.resumeSlideshow (for intro.js)

const slideContent = document.getElementById("slide_content");
const posterContainer = document.getElementById("front_poster");

let slideshow = null;

// One slide: the cover (image as a link, or video) and the title as a link below it – for
// videos the only link, because the video controls catch clicks on the video itself
function renderSlide(exhibition, index, content) {
  const frontPage = exhibition.frontPage;
  const link = getExhibitionLink(exhibition);
  let video = null;

  if (frontPage?.type === "image") {
    const anchor = document.createElement("a");
    const image = document.createElement("img");

    anchor.href = link;
    setImageSources(image, frontPage, {
      size: "medium",
      sizes: "(max-width: 600px) 100vw, min(1200px, 90vw)",
      priority: index === 0,
    });
    image.alt = frontPage.alt || exhibition.title;
    anchor.appendChild(image);
    content.appendChild(anchor);
  } else if (frontPage?.type === "video") {
    video = document.createElement("video");
    video.src = frontPage.src;
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    content.appendChild(video);
  }

  const titleLink = document.createElement("a");

  titleLink.href = link;
  titleLink.className = "slide_link";
  titleLink.textContent = exhibition.title + " – view exhibition ›";
  content.appendChild(titleLink);

  return video;
}

// For intro.js: pause the slideshow while the intro video plays
window.pauseSlideshow = () => slideshow?.pause();
window.resumeSlideshow = () => slideshow?.resume();

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
    }),
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
      caption.textContent = exhibition.title + " · " + formatExhibitionDate(exhibition);

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

  // Only public exhibitions in the slideshow: locked ones are visible through their poster,
  // their cover should not be seen yet
  const slides = exhibitions.filter((exhibition) => !isLocked(exhibition));

  if (slides.length === 0) {
    slideContent.textContent = "No exhibitions available yet.";
    return;
  }

  slideshow = createSlideshow({
    content: slideContent,
    dots: document.getElementById("dots"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    items: slides,
    render: renderSlide,
    dotLabel: (index) => `Slide ${index + 1}`,
    // While the intro is open the slideshow stays put
    keysPaused: () => Boolean(document.getElementById("intro")),
  });
  slideshow.show(0);
}

start();
