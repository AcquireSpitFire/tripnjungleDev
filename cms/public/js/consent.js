// YouTube consent. Videos are hosted on YouTube. Before the first contact with Google (player
// script, iframe) the visitor has to agree (§ 25 TDDDG / § 165 TKG, GDPR). The decision is
// remembered in localStorage; /privacy offers a button to reset it.
//
// Needs:    data.js (STORAGE_KEYS), elements.js (setImageSources)
// Provides: hasYouTubeConsent, createYouTubeNotice

function hasYouTubeConsent() {
  try {
    return localStorage.getItem(STORAGE_KEYS.youtubeConsent) === "1";
  } catch (error) {
    return false;
  }
}

function setYouTubeConsent(value) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEYS.youtubeConsent, "1");
    } else {
      localStorage.removeItem(STORAGE_KEYS.youtubeConsent);
    }
  } catch (error) {
    // localStorage not available – then the consent only applies to this click
  }
}

// Notice card in place of the video. options:
//   cover   – medium (cover/poster) as background, from our own server
//   onPlay  – called after the click on "Play video"
function createYouTubeNotice(options = {}) {
  const notice = document.createElement("div");

  notice.className = "yt_notice";

  if (options.cover) {
    const image = document.createElement("img");

    setImageSources(image, options.cover, { size: "medium", lazy: true });
    image.alt = "";
    image.className = "yt_notice_cover";
    notice.appendChild(image);
  }

  const body = document.createElement("div");

  body.className = "yt_notice_body";

  const text = document.createElement("p");

  text.className = "yt_notice_text";
  text.append(
    "This video is hosted on YouTube. If you play it, your IP address and device information are sent to Google. Details in the ",
  );

  const link = document.createElement("a");

  link.href = "/privacy";
  link.textContent = "privacy policy";
  text.appendChild(link);
  text.append(". Your choice is remembered in this browser.");
  body.appendChild(text);

  const button = document.createElement("button");

  button.type = "button";
  button.className = "yt_notice_button";
  button.textContent = "▶ Play video";
  button.addEventListener("click", () => {
    setYouTubeConsent(true);
    options.onPlay?.();
  });
  body.appendChild(button);

  notice.appendChild(body);

  return notice;
}

// /privacy: "Forget my YouTube consent"
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-reset-youtube-consent]");

  if (!button) {
    return;
  }

  setYouTubeConsent(false);
  button.textContent = "Done – the notice will be shown again before videos.";
  button.disabled = true;
});
