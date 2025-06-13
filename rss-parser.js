document.addEventListener("DOMContentLoaded", () => {
  const feedContainer = document.getElementById("rss-feed");

  const feedUrls = [
    "https://corsproxy.io/?https://activehistory.ca/feed/",
    "https://corsproxy.io/?https://www.aaihs.org/feed/",
    "https://corsproxy.io/?https://africasacountry.com/rss",
    "https://corsproxy.io/?https://abusablepast.org/feed/",
    "https://corsproxy.io/?https://www.versobooks.com/blogs/news.atom",
    "https://corsproxy.io/?https://bostonreview.net/feed/",
    "https://corsproxy.io/?https://thefunambulist.net/feed/",
    "https://corsproxy.io/?https://globalsocialtheory.org/feed/",
    "https://corsproxy.io/?https://keywordsechoes.com/feed/"
  ];

  let allItems = [];

  Promise.all(feedUrls.map(url =>
    fetch(url)
      .then(res => res.text())
      .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
      .then(data => {
        const isAtom = data.querySelector("feed > entry");
        const items = isAtom ? data.querySelectorAll("entry") : data.querySelectorAll("item");

        items.forEach(el => {
          const title = el.querySelector("title")?.textContent || "No title";
          const link = isAtom
            ? el.querySelector("link")?.getAttribute("href")
            : el.querySelector("link")?.textContent || "#";
          const description =
            el.querySelector("summary")?.textContent ||
            el.querySelector("description")?.textContent ||
            "No description available";
          const pubDate = new Date(
            el.querySelector("updated")?.textContent ||
            el.querySelector("pubDate")?.textContent ||
            Date.now()
          );

          // Source extraction fallback
          const source = el.querySelector("source")?.textContent || new URL(url).hostname;

          allItems.push({ title, link, description, pubDate, source });
        });
      })
      .catch(err => console.error(`Error fetching feed at ${url}:`, err))
  )).then(() => {
    allItems.sort((a, b) => b.pubDate - a.pubDate);

    const grid = document.createElement("div");
    grid.className = "rss-grid";

    allItems.slice(0, 20).forEach(item => {
      const card = document.createElement("div");
      card.className = "rss-card";

      card.innerHTML = `
        <div class="rss-content">
          <a href="${item.link}" target="_blank" class="rss-title">${item.title}</a>
          <p class="rss-date">${item.pubDate.toLocaleDateString()}</p>
          <p class="rss-summary">${item.description.length > 180 ? item.description.slice(0, 180) + "..." : item.description}</p>
          <p class="rss-source">Source: ${item.source}</p>
        </div>
      `;

      grid.appendChild(card);
    });

    feedContainer.innerHTML = "";
    feedContainer.appendChild(grid);
  });
});