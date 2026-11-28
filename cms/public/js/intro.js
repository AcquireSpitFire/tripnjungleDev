// Intro video before an exhibition.
//
// Only links with data-intro (posters, see createPosterElement in elements.js)
// are intercepted. Instead of jumping straight to the exhibition, an
// overlay opens with the YouTube video of the exhibition (field "video").
// Below it is the "Continue to exhibition" button. When the video ends,
// it continues automatically. Slides, cards and text links lead straight
// to the exhibition.
//
// Privacy: before the first contact with YouTube/Google the visitor has to
// agree (notice card in the overlay, see createYouTubeNotice in consent.js).
// The consent is remembered in the browser. Only with stored consent is
// the YouTube API preloaded while idle or when touching a poster.
//
// Fast: as soon as the overlay is open, the data and first images of the
// exhibition (own server) are preloaded, so the exhibition page is there
// immediately afterwards.
//
// Why an overlay and not a separate page: browsers only allow autoplay with
// sound after a click on the same page. The click on the poster is that
// click; a new page would not have it and the intro would play muted.
//
// Note on quality: 1080p is requested (vq + setPlaybackQuality), but
// YouTube decides itself what it actually plays.
//
// Needs:    data.js, elements.js, consent.js; window.pauseSlideshow/resumeSlideshow (script.js, if there)
// Provides: –

(function () {
  let overlayElement = null;
  let player = null;
  let apiPromise = null;
  const prefetched = new Set();

  // Load the YouTube IFrame Player API once
  function loadYouTubeApi() {
    if (window.YT?.Player) {
      return Promise.resolve();
    }

    if (!apiPromise) {
      apiPromise = new Promise((resolve) => {
        const previous = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
          previous?.();
          resolve();
        };

        const script = document.createElement("script");

        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      });
    }

    return apiPromise;
  }

  // Preload the API while idle as soon as the page contains posters with a
  // video – only with stored consent. Posters only appear after the API
  // call, hence the MutationObserver.
  function warmUpWhenPostersAppear() {
    if (!hasYouTubeConsent()) {
      return;
    }

    const start = () => {
      const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 1500));

      idle(() => loadYouTubeApi());
    };

    if (document.querySelector("a[data-intro]")) {
      start();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector("a[data-intro]")) {
        observer.disconnect();
        start();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Fetch the exhibition in the background: data into sessionStorage,
  // first images into the browser cache, the page via prefetch
  async function prefetchExhibition(exhibition) {
    if (prefetched.has(exhibition.id) || isLocked(exhibition)) {
      return;
    }

    prefetched.add(exhibition.id);

    const link = document.createElement("link");

    link.rel = "prefetch";
    link.href = getExhibitionLink(exhibition);
    document.head.appendChild(link);

    try {
      const full = await loadExhibition(exhibition.id);

      preloadExhibitionImages(full, 6);
    } catch (error) {
      console.warn("Prefetch failed for “" + exhibition.id + "”", error);
    }
  }

  function closeIntro() {
    if (!overlayElement) {
      return;
    }

    player?.destroy();
    player = null;
    overlayElement.remove();
    overlayElement = null;
    document.documentElement.classList.remove("intro_open");

    // Home page: let the slideshow continue
    window.resumeSlideshow?.();
  }

  function goToExhibition(exhibition) {
    location.href = getExhibitionLink(exhibition);
  }

  function buildOverlay(exhibition, videoId) {
    const overlay = document.createElement("div");

    overlay.id = "intro";
    overlay.className = "intro";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Intro: " + exhibition.title);

    const close = document.createElement("button");

    close.className = "intro_close";
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", closeIntro);

    const inner = document.createElement("div");

    inner.className = "intro_inner";

    if (videoId) {
      const box = document.createElement("div");

      box.className = "intro_player_box";

      if (hasYouTubeConsent()) {
        box.appendChild(createPlayerTarget());
      } else {
        box.appendChild(
          createYouTubeNotice({
            cover: exhibition.posters?.[0] || exhibition.frontPage,
            onPlay: () => {
              box.innerHTML = "";
              box.appendChild(createPlayerTarget());
              startPlayer(exhibition, videoId);
            },
          }),
        );
      }

      inner.appendChild(box);
    }

    const title = document.createElement("p");

    title.className = "intro_title";
    title.textContent = exhibition.title;
    inner.appendChild(title);

    const actions = document.createElement("div");

    actions.className = "intro_actions";

    if (isLocked(exhibition)) {
      const note = document.createElement("p");

      note.className = "intro_locked";
      note.textContent = "This exhibition is not available yet.";
      actions.appendChild(note);
    } else {
      const button = document.createElement("button");

      button.className = "intro_button";
      button.type = "button";
      button.textContent = "Continue to exhibition ›";
      button.addEventListener("click", () => {
        closeIntro();
        goToExhibition(exhibition);
      });
      actions.appendChild(button);
    }

    inner.appendChild(actions);
    overlay.appendChild(close);
    overlay.appendChild(inner);

    // A click on the dark background closes it
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeIntro();
      }
    });

    return overlay;
  }

  function createPlayerTarget() {
    const target = document.createElement("div");

    target.id = "intro_player";

    return target;
  }

  async function startPlayer(exhibition, videoId) {
    await loadYouTubeApi();

    // The overlay was closed in the meantime
    if (!overlayElement || !document.getElementById("intro_player")) {
      return;
    }

    const playerVars = {
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      vq: "hd1080",
    };

    if (/^https?:$/.test(location.protocol)) {
      playerVars.origin = location.origin;
    }

    player = new YT.Player("intro_player", {
      videoId,
      host: "https://www.youtube-nocookie.com",
      width: "100%",
      height: "100%",
      playerVars,
      events: {
        onReady: (event) => {
          event.target.setPlaybackQuality("hd1080");
          event.target.playVideo();
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.ENDED && !isLocked(exhibition)) {
            goToExhibition(exhibition);
          }
        },
        onError: (event) => {
          showPlayerError(event.data);
        },
      },
    });
  }

  // YouTube could not play the video: show the reason instead of a black box.
  // Codes: 2 = invalid ID, 5 = player error, 100 = not found/private,
  // 101/150 = embedding not allowed by the owner
  function showPlayerError(code) {
    const box = overlayElement?.querySelector(".intro_player_box");

    if (!box) {
      return;
    }

    const reasons = {
      2: "The video ID is invalid.",
      100: "The video was not found or is private.",
      101: "The owner does not allow embedding this video (YouTube Studio → video → “Allow embedding”).",
      150: "The owner does not allow embedding this video (YouTube Studio → video → “Allow embedding”).",
    };

    const message = document.createElement("p");

    message.className = "intro_error";
    message.textContent =
      "The video cannot be played (YouTube error " + code + "). " + (reasons[code] || "");

    box.innerHTML = "";
    box.appendChild(message);
    console.error("YouTube error", code);
  }

  async function openIntro(id) {
    let exhibition;

    try {
      exhibition = await getExhibition(id);
    } catch (error) {
      console.error("Exhibition “" + id + "” could not be loaded.", error);
      location.href = "/exhibition/" + encodeURIComponent(id);
      return;
    }

    const videoId = getYouTubeId(exhibition.video);

    // No video and public: straight to the exhibition, no empty overlay
    if (!videoId && !isLocked(exhibition)) {
      goToExhibition(exhibition);
      return;
    }

    closeIntro();
    window.pauseSlideshow?.();

    overlayElement = buildOverlay(exhibition, videoId);
    document.body.appendChild(overlayElement);
    document.documentElement.classList.add("intro_open");

    // Load the exhibition (own server) already while the notice or video is shown
    prefetchExhibition(exhibition);

    if (videoId && hasYouTubeConsent()) {
      startPlayer(exhibition, videoId);
    }
  }

  // Only intercept poster links (data-intro), including ones that are
  // added to the DOM later
  document.addEventListener("click", (event) => {
    // Still allow new tabs via Ctrl/Cmd/middle click
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    const anchor = event.target.closest?.("a[data-intro]");

    if (!anchor || anchor.closest("#intro")) {
      return;
    }

    const id = anchor.dataset.id;

    if (!id) {
      return;
    }

    event.preventDefault();
    openIntro(id);
  });

  // When the mouse points at a poster (or a finger touches it): load the API
  // now, provided the visitor has already agreed to YouTube
  ["pointerenter", "touchstart", "focusin"].forEach((type) => {
    document.addEventListener(
      type,
      (event) => {
        if (hasYouTubeConsent() && event.target.closest?.("a[data-intro]")) {
          loadYouTubeApi();
        }
      },
      { capture: true, passive: true },
    );
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeIntro();
    }
  });

  warmUpWhenPostersAppear();
})();
