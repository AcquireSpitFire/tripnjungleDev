// Exhibitions: grid of all public exhibitions (locked: false).
// Every card shows the cover, the title and the theme.
// Click → straight to the exhibition.
//
// Needs:    data.js, elements.js
// Provides: –

const listElement = document.getElementById("list");

function createCard(exhibition, index) {
  const card = document.createElement("a");
  const frontPage = exhibition.frontPage;

  card.className = "card";
  card.href = getExhibitionLink(exhibition);

  if (frontPage?.type === "video") {
    const video = document.createElement("video");

    video.src = frontPage.src;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    card.appendChild(video);
  } else if (frontPage?.src) {
    const image = document.createElement("img");

    setImageSources(image, frontPage, {
      size: "medium",
      sizes: "(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 400px",
      lazy: index > 2,
      priority: index === 0,
    });
    image.alt = frontPage.alt || exhibition.title;
    card.appendChild(image);
  } else {
    const placeholder = document.createElement("div");

    placeholder.className = "card_placeholder";
    card.appendChild(placeholder);
  }

  const title = document.createElement("h2");

  title.className = "card_title";
  title.textContent = exhibition.title;
  card.appendChild(title);

  if (exhibition.theme) {
    const theme = document.createElement("p");

    theme.className = "card_theme";
    theme.textContent = exhibition.theme;
    card.appendChild(theme);
  }

  return card;
}

async function startExhibitions() {
  let exhibitions;

  try {
    exhibitions = await loadExhibitions();
  } catch (error) {
    listElement.textContent = "Exhibitions could not be loaded.";
    console.error(error);
    return;
  }

  const open = exhibitions
    .filter((exhibition) => !isLocked(exhibition));

  if (open.length === 0) {
    listElement.textContent = "No exhibitions available yet.";
    return;
  }

  open.forEach((exhibition, index) => {
    listElement.appendChild(createCard(exhibition, index));
  });
}

startExhibitions();
