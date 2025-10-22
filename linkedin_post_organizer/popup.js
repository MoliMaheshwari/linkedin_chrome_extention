let currentPosts = [];
let currentFilterTag = null;

document.addEventListener("DOMContentLoaded", () => {
  // Load saved posts
  chrome.storage.local.get("savedPosts", (data) => {
    currentPosts = data.savedPosts || [];
    renderPosts(currentPosts);
  });

  // Save Post Button Logic with fallback reinjection if needed
  document.getElementById("savePostBtn").addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.startsWith("https://www.linkedin.com")) {
      alert(" Please open a LinkedIn post or feed page to save.");
      return;
    }

    const tagInput = document.getElementById("tagsInput").value.trim();
    const tags = tagInput ? tagInput.split(",").map(t => t.trim()) : [];

    const folderInput = document.getElementById("folderInput").value.trim();
    const folder = folderInput || "Uncategorized";

    function savePost(postData) {
      postData.tags = tags;
      postData.folder = folder;

      chrome.storage.local.get({ savedPosts: [] }, (result) => {
        const updatedPosts = [postData, ...result.savedPosts];
        chrome.storage.local.set({ savedPosts: updatedPosts }, () => {
          alert("Post Saved: " + postData.content.slice(0, 50) + "...");
          currentPosts = updatedPosts;
          renderPosts(currentPosts);
          document.getElementById("tagsInput").value = "";
          document.getElementById("folderInput").value = "";
          document.getElementById("suggestedTagsContainer").innerHTML = "";
        });
      });
    }

    chrome.tabs.sendMessage(tab.id, { action: "extract_post" }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        // Reinjection attempt
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          });

          // Retry extract_post after reinjection
          chrome.tabs.sendMessage(tab.id, { action: "extract_post" }, (retryResponse) => {
            if (!retryResponse || !retryResponse.success) {
              alert("Couldn't connect to the LinkedIn page. Please refresh the tab and try again.");
              return;
            }

            savePost(retryResponse.postData);
          });
        } catch (e) {
          alert("Please refresh the LinkedIn tab and try again.");
        }
      } else {
        savePost(response.postData);
      }
    });
  });


  // Search filter
  document.getElementById("searchInput").addEventListener("input", () => {
    renderPosts(currentPosts);
  });

  // Clear tag filter
  document.getElementById("clearFilterBtn").addEventListener("click", () => {
    currentFilterTag = null;
    document.getElementById("activeFilter").style.display = "none";
    renderPosts(currentPosts);
  });

  // Open Dashboard
  document.getElementById("openDashboardBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  // Dark Mode Toggle
  const toggleBtn = document.getElementById("toggleDarkMode");
  if (toggleBtn) {
    const isDark = localStorage.getItem("darkMode") === "true";
    document.body.classList.toggle("dark-mode", isDark);

    toggleBtn.addEventListener("click", () => {
      const isDarkNow = document.body.classList.toggle("dark-mode");
      localStorage.setItem("darkMode", isDarkNow);
    });
  }
});

// Renders saved posts in popup
function renderPosts(posts) {
  const container = document.getElementById("postsContainer");
  container.innerHTML = "";

  let filtered = [...posts];

  // Folder filter
  const selectedFolder = document.getElementById("folderFilter")?.value;
  if (selectedFolder && selectedFolder !== "__all__") {
    filtered = filtered.filter(post => post.folder === selectedFolder);
  }

  // Tag filter
  if (currentFilterTag) {
    filtered = filtered.filter(post => post.tags?.includes(currentFilterTag));
  }

  // Search filter
  const search = document.getElementById("searchInput")?.value.toLowerCase();
  if (search) {
    filtered = filtered.filter(post =>
      post.content.toLowerCase().includes(search) ||
      (post.author && post.author.toLowerCase().includes(search)) ||
      (post.tags && post.tags.some(tag => tag.toLowerCase().includes(search)))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = "<p>No matching posts found.</p>";
    return;
  }

  filtered.forEach((post) => {
    const index = currentPosts.findIndex(p => p.content === post.content && p.url === post.url);

    const postDiv = document.createElement("div");
    postDiv.className = "post";

    postDiv.innerHTML = `
      <div class="post-header">
        <div class="post-author">${post.author || "LinkedIn User"}</div>
        <button class="delete-btn" data-index="${index}">&times;</button>
      </div>

      <p class="post-content">${post.content.slice(0, 100)}...</p>
      <p class="post-folder">&#128193; <b>${post.folder || "Uncategorized"}</b></p>

      ${post.tags && post.tags.length > 0 ? `
        <div class="tag-list">
          ${post.tags.map(tag => `<span class="tag clickable-tag">${tag}</span>`).join("")}
        </div>
      ` : ""}

      <a href="${post.url}" target="_blank" class="post-link">&#128279; View on LinkedIn</a>
    `;

    container.appendChild(postDiv);
  });

  // Delete buttons
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      chrome.storage.local.get("savedPosts", (data) => {
        const updated = data.savedPosts;
        updated.splice(index, 1);
        chrome.storage.local.set({ savedPosts: updated }, () => {
          currentPosts = updated;
          renderPosts(currentPosts);
        });
      });
    });
  });

  // Tag click filters
  document.querySelectorAll(".clickable-tag").forEach(tagEl => {
    tagEl.addEventListener("click", () => {
      currentFilterTag = tagEl.innerText;
      document.getElementById("filterTag").innerText = currentFilterTag;
      document.getElementById("activeFilter").style.display = "block";
      renderPosts(currentPosts);
    });
  });
}

//  Auto-tag on typing in the input box
let lastSuggestedContent = "";

const tagsInputEl = document.getElementById("tagsInput");
if (tagsInputEl) {
  tagsInputEl.addEventListener("input", async () => {
    const inputText = tagsInputEl.value.trim();
    if (inputText.length < 2) return;

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { action: "extract_post" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success || !response.postData?.content) {
        console.warn("❌ Could not extract post content");
        return;
      }

      const content = response.postData.content;
      if (content === lastSuggestedContent) return;
      lastSuggestedContent = content;

      fetch("https://web-production-6d5d1.up.railway.app/extract_tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content })
      })
        .then(res => res.json())
        .then(data => {
          const suggestedTags = data.auto_tags || [];
          const container = document.getElementById("suggestedTagsContainer");
          container.innerHTML = "<strong>Suggested Tags:</strong> ";

          suggestedTags.forEach(tag => {
            const span = document.createElement("span");
            span.className = "suggested-tag";
            span.innerText = tag;
            span.style.margin = "5px";
            span.style.padding = "4px 8px";
            span.style.border = "1px solid #999";
            span.style.borderRadius = "8px";
            span.style.cursor = "pointer";

            span.onclick = () => {
              const input = document.getElementById("tagsInput");
              const currentTags = input.value.split(",").map(t => t.trim()).filter(Boolean);
              if (!currentTags.includes(tag)) {
                currentTags.push(tag);
                input.value = currentTags.join(", ");
              }
            };

            container.appendChild(span);
          });
        })
        .catch(err => {
          console.error("Failed to fetch auto-tags:", err);
          const container = document.getElementById("suggestedTagsContainer");
          if (container) container.innerHTML = "<i> Couldn't fetch suggestions</i>";
        });
    });
  });
}
