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

        // Extract feed-level source title (for 'source' display)
        const feedTitle = data.querySelector("channel > title")?.textContent || data.querySelector("title")?.textContent || "Unknown Source";

        items.forEach(el => {
          const title = el.querySelector("title")?.textContent || "No title";
          const link = isAtom
            ? el.querySelector("link")?.getAttribute("href")
            : el.querySelector("link")?.textContent;
          const description =
            el.querySelector("summary")?.textContent ||
            el.querySelector("description")?.textContent ||
            "";
          const pubDate = new Date(
            el.querySelector("updated")?.textContent ||
            el.querySelector("pubDate")?.textContent ||
            ""
          );

          allItems.push({ 
            title, 
            link, 
            description, 
            pubDate, 
            source: feedTitle  // assign feed source here
          });
        });
      })
      .catch(err => console.error(`Error fetching feed at ${url}:`, err))
  )).then(() => {
    allItems.sort((a, b) => b.pubDate - a.pubDate);

    const grid = document.createElement("div");
    grid.className = "rss-grid";

    allItems.slice(0, 20).forEach(item => {
      // Try to extract image URL from description or media:content tag
      const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/i) 
        || item.description.match(/<media:content[^>]+url="([^">]+)"/i);
      const imageUrl = imgMatch?.[1] || null;

      // Clean description from HTML tags for summary preview
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = item.description;
      const plainTextDescription = tempDiv.textContent || tempDiv.innerText || "";

      const card = document.createElement("div");
      card.className = "rss-card";

      card.innerHTML = `
        ${imageUrl ? `<img src="${imageUrl}" alt="Image" class="rss-image">` : ""}
        <div class="rss-content">
          <a href="${item.link}" target="_blank" class="rss-title">${item.title}</a>
          <p class="rss-date">${item.pubDate.toLocaleDateString()}</p>
          <p class="rss-summary">${plainTextDescription.slice(0, 180)}${plainTextDescription.length > 180 ? "..." : ""}</p>
          <p class="rss-source">Source: ${item.source}</p>
        </div>
      `;

      grid.appendChild(card);
    });

    feedContainer.innerHTML = "";
    feedContainer.appendChild(grid);
  });
});