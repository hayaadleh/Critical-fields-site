document.addEventListener("DOMContentLoaded", () => {
  const feedContainer = document.getElementById("rss-feed");

  const feedUrls = [
  "https://corsproxy.io/?https://activehistory.ca/feed/",
  "https://corsproxy.io/?https://www.aaihs.org/feed/",
  "https://corsproxy.io/?https://africasacountry.com/rss"
];

  let allItems = [];

  Promise.all(feedUrls.map(url =>
    fetch(url)
      .then(res => res.text())
      .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
      .then(data => {
        const items = data.querySelectorAll("item");
        items.forEach(el => {
          allItems.push({
            title: el.querySelector("title")?.textContent,
            link: el.querySelector("link")?.textContent,
            description: el.querySelector("description")?.textContent || "",
            pubDate: new Date(el.querySelector("pubDate")?.textContent || "")
          });
        });
      })
      .catch(err => console.error("Error fetching feed:", err))
  .then(() => {
  allItems.sort((a, b) => b.pubDate - a.pubDate);

  const grid = document.createElement("div");
  grid.className = "rss-grid";

  allItems.slice(0, 12).forEach(item => {
    // Try to extract image from description if any
    const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    const card = document.createElement("div");
    card.className = "rss-card";

    card.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="Image" class="rss-image">` : ""}
      <div class="rss-content">
        <a href="${item.link}" target="_blank" class="rss-title">${item.title}</a>
        <p class="rss-date">${item.pubDate.toLocaleDateString()}</p>
      </div>
    `;

    grid.appendChild(card);
  });

  feedContainer.innerHTML = "";
  feedContainer.appendChild(grid);
});
