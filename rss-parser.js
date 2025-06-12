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
  )).then(() => {
    // Sort items by date (newest first)
    allItems.sort((a, b) => b.pubDate - a.pubDate);

    let output = "<ul>";
    allItems.slice(0, 10).forEach(item => {
      output += `
        <li>
          <a href="${item.link}" target="_blank">${item.title}</a>
          <p>${item.description}</p>
        </li>
      `;
    });
    output += "</ul>";

    feedContainer.innerHTML = output;
  });
});
