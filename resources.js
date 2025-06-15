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
    image: "https://i.scdn.co/image/ab6765630000ba8a42b1456483e792db9613b985",
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

const container = document.getElementById("resources-container");
const mediumFilter = document.getElementById("mediumFilter");
const themeFilter = document.getElementById("themeFilter");

function displayResources(filteredResources) {
  container.innerHTML = "";

  filteredResources.forEach(resource => {
    const card = document.createElement("a");
    card.className = "resource-card";
    card.href = resource.link;
    card.target = "_blank";
    card.innerHTML = `
      <img src="${resource.image}" alt="${resource.title}" class="resource-image">
      <div class="resource-overlay">
        <h3>${resource.title}</h3>
        <p>${resource.description}</p>
        <div class="tags"><strong>Medium:</strong> ${resource.medium} | <strong>Themes:</strong> ${resource.themes.join(", ")}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function filterResources() {
  const selectedMedium = mediumFilter.value;
  const selectedTheme = themeFilter.value;

  const filtered = resources.filter(res => {
    const matchesMedium = !selectedMedium || res.medium === selectedMedium;
    const matchesTheme = !selectedTheme || res.themes.includes(selectedTheme);
    return matchesMedium && matchesTheme;
  });

  displayResources(filtered);
}

// Initial display
displayResources(resources);

// Event listeners
mediumFilter.addEventListener("change", filterResources);
themeFilter.addEventListener("change", filterResources);