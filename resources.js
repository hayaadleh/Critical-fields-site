const resources = [
  {
    title: "Africa is a Country",
    link: "https://africasacountry.com/",
    image: "https://africasacountry.com/static/img/logo/logo-type.png",
    medium: "Blogs & Website",
    themes: ["Decoloniality", "Indigenous"],
    description: "Africa Is a Country offers a critical perspective on various social, political, and cultural issues affecting Africa that push back on continental legacies of colonialism and exploitation."
  },
  {
    title: "Current Affairs Podcast",
    link: "https://www.patreon.com/collection/952003?view=condensed",
    image: "https://c10.patreonusercontent.com/4/patreon-media/p/campaign/1758480/b4884c2275ce4855b56864ecd839b780/eyJ3Ijo2MjB9/5.jpg",
    medium: "Podcasts",
    themes: ["Politics"],
    description: "Current Affairs promised “a new print magazine of political analysis, satire, and entertainment” that would “bring wit, color, and verve back to print media!”."
  },
  {
    title: "Radical History Review",
    link: "https://www.radicalhistoryreview.org/",
    image: "https://www.radicalhistoryreview.org/wp-content/uploads/2021/01/RHR-Logo.png",
    medium: "Journal",
    themes: ["History"],
    description: "For more than forty years Radical History Review has stood at the point where rigorous historical scholarship and active political engagement converge."
  }
];

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("resources-container");
  const mediumSelect = document.getElementById("mediumFilter");
  const themeSelect = document.getElementById("themeFilter");

  function renderResources() {
    const selectedMedium = mediumSelect.value;
    const selectedTheme = themeSelect.value;

    container.innerHTML = "";

    const filtered = resources.filter(item => {
      const matchesMedium = selectedMedium === "" || item.medium === selectedMedium;
      const matchesTheme = selectedTheme === "" || item.themes.includes(selectedTheme);
      return matchesMedium && matchesTheme;
    });

    filtered.forEach(item => {
      const card = document.createElement("a");
      card.className = "resource-card";
      card.href = item.link;
      card.target = "_blank";
      card.innerHTML = `
        <img src="${item.image}" alt="${item.title}" class="resource-image" />
        <div class="resource-overlay">
          <h3>${item.title}</h3>
          <p>${item.description}</p>
          <p class="tags">${item.medium} • ${item.themes.join(", ")}</p>
        </div>
      `;
      container.appendChild(card);
    });
  }

  mediumSelect.addEventListener("change", renderResources);
  themeSelect.addEventListener("change", renderResources);

  renderResources();
});