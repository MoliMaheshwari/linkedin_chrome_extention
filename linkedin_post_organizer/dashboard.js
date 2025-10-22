let currentPosts = [];
let currentFilterTag = null;

document.addEventListener("DOMContentLoaded", () => {
  // Load saved posts
  chrome.storage.local.get("savedPosts", (data) => {
    currentPosts = data.savedPosts || [];
    renderPosts(currentPosts);
    populateFolderFilter(currentPosts);
  });

  // Event listeners
  document.getElementById("searchInput").addEventListener("input", () => {
    renderPosts(currentPosts);
  });

  document.getElementById("folderFilter").addEventListener("change", () => {
    renderPosts(currentPosts);
  });

  document.getElementById("clearFilterBtn").addEventListener("click", () => {
    currentFilterTag = null;
    document.getElementById("activeFilter").style.display = "none";
    renderPosts(currentPosts);
  });

  // Dark mode toggle
  const toggleBtn = document.getElementById("toggleDarkMode");
  if (toggleBtn) {
    const isDark = localStorage.getItem("darkMode") === "true";
    document.body.classList.toggle("dark-mode", isDark);

    toggleBtn.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark-mode");
      localStorage.setItem("darkMode", isDark);
    });
  }
});

// Populate folder filter
function populateFolderFilter(posts) {
  const folderFilter = document.getElementById("folderFilter");
  const uniqueFolders = new Set(posts.map(p => p.folder || "Uncategorized"));
  folderFilter.innerHTML = `<option value="__all__">All Folders</option>`;
  for (const folder of uniqueFolders) {
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = folder;
    folderFilter.appendChild(option);
  }
}

// Render posts as cards
function renderPosts(posts) {
  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  let filtered = [...posts];

  // Folder filter
  const selectedFolder = document.getElementById("folderFilter").value;
  if (selectedFolder !== "__all__") {
    filtered = filtered.filter(post => post.folder === selectedFolder);
  }

  // Search filter
  const search = document.getElementById("searchInput").value.toLowerCase();
  if (search) {
    filtered = filtered.filter(post =>
      post.content.toLowerCase().includes(search) ||
      (post.author && post.author.toLowerCase().includes(search)) ||
      (post.tags && post.tags.some(tag => tag.toLowerCase().includes(search)))
    );
  }

  // Tag filter
  if (currentFilterTag) {
    filtered = filtered.filter(post => post.tags?.includes(currentFilterTag));
  }

  if (filtered.length === 0) {
    container.innerHTML = "<p>No matching posts found.</p>";
    return;
  }

  filtered.forEach((post) => {
    const card = document.createElement("div");
    card.className = "post-card";

    card.innerHTML = `
      <h3>${post.author || "Anonymous"}</h3>
      <p>${post.content ? post.content.slice(0, 120) + "..." : "No content available."}</p>
      <p><b>Folder:</b> ${post.folder || "Uncategorized"}</p>
      
      ${post.tags && post.tags.length > 0 ? `
        <div class="tag-list">
          ${post.tags.map(tag => `<span class="tag clickable-tag">${tag}</span>`).join("")}
        </div>
      ` : ""}
      
      <a href="${post.url}" target="_blank" class="post-link">🔗 View on LinkedIn</a>
    `;

    container.appendChild(card);
  });

  // Tag click events
  document.querySelectorAll(".clickable-tag").forEach(tagEl => {
    tagEl.addEventListener("click", () => {
      currentFilterTag = tagEl.innerText;
      document.getElementById("filterTag").innerText = currentFilterTag;
      document.getElementById("activeFilter").style.display = "block";
      renderPosts(currentPosts);
    });
  });
}

