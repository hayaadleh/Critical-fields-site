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
    image: "https://c10.patreonusercontent.com/4/patreon-media/p/campaign/1758480/b4884c2275ce4855b56864ecd839b780/eyJ3Ijo2MjB9/5.jpg?token-hash=TSsqaEXWLrLwpy2w406dNXMa3h-bhnkU5e5Kq5mm0XI%3D&token-time=1751155200",
    medium: "Podcasts",
    themes: ["Politics"],
    description: "Current Affairs promised “a new print magazine of political analysis, satire, and entertainment” that would “bring wit, color, and verve back to print media!”."
  },
  {
    title: "Radical History Review",
    link: "https://www.radicalhistoryreview.org/",
    image: "https://www.radicalhistoryreview.org/wp-content/uploads/2021/01/RHR-Logo.png",
    medium: "Journal",
    themes: ["History", "Anticolonialism"],
    description: "For more than forty years Radical History Review has stood at the point where rigorous historical scholarship and active political engagement converge."
  }
];

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("resources-container");
  const mediumFilter = document.getElementById("mediumFilter");
  const themeFilter = document.getElementById("themeFilter");

  const unique = (arr) => [...new Set(arr)];

  const allMediums = unique(resources.map(r => r.medium)).sort();
  const allThemes = unique(resources.flatMap(r => r.themes)).sort();

  allMediums.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    mediumFilter.appendChild(opt);
  });

  allThemes.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    themeFilter.appendChild(opt);
  });

  function renderResources(filterMedium = "", filterTheme = "") {
    container.innerHTML = "";

    const filtered = resources.filter(r => {
      const mediumMatch = filterMedium ? r.medium === filterMedium : true;
      const themeMatch = filterTheme ? r.themes.includes(filterTheme) : true;
      return mediumMatch && themeMatch;
    });

    filtered.forEach(item => {
      const card = document.createElement("a");
      card.className = "resource-card";
      card.href = item.link;
      card.target = "_blank";
      card.innerHTML = `
        <img src="${item.image}" alt="${item.title}" class="resource-image">
        <div class="resource-overlay">
          <h3>${item.title}</h3>
          <p>${item.description}</p>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderResources();

  mediumFilter.addEventListener("change", () => {
    renderResources(mediumFilter.value, themeFilter.value);
  });

  themeFilter.addEventListener("change", () => {
    renderResources(mediumFilter.value, themeFilter.value);
  });
});