// Keep a live list of posts so we don't query the whole DOM each time.
let livePosts = [];
let postsObserver = null;

// Initialize livePosts and start observing for added/removed posts.
function trackLinkedInPosts() {
  // Seed initial posts
  livePosts = Array.from(document.querySelectorAll("div.feed-shared-update-v2"));

  // Clean up previous observer if any
  if (postsObserver) {
    try { postsObserver.disconnect(); } catch (e) { /* ignore */ }
  }

  postsObserver = new MutationObserver((mutations) => {
    let changed = false;

    for (let mutation of mutations) {
      // Added nodes
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        // If the added node itself is a post
        if (node.matches && node.matches("div.feed-shared-update-v2")) {
          livePosts.push(node);
          changed = true;
        } else {
          // Or if it contains posts inside
          try {
            const inside = node.querySelectorAll && node.querySelectorAll("div.feed-shared-update-v2");
            if (inside && inside.length) {
              livePosts.push(...Array.from(inside));
              changed = true;
            }
          } catch (err) {
            // ignore
          }
        }
      });

      // Removed nodes - remove from livePosts
      mutation.removedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches("div.feed-shared-update-v2")) {
          livePosts = livePosts.filter(p => p !== node);
          changed = true;
        } else {
          try {
            const inside = node.querySelectorAll && node.querySelectorAll("div.feed-shared-update-v2");
            if (inside && inside.length) {
              const arr = Array.from(inside);
              livePosts = livePosts.filter(p => !arr.includes(p));
              changed = true;
            }
          } catch (err) {
            // ignore
          }
        }
      });
    }

    if (changed) {
      // Optional: keep de-duplicated and only attached posts
      livePosts = livePosts.filter(p => p && p.isConnected);
    }
  });

  postsObserver.observe(document.body, { childList: true, subtree: true });
}

// Find the post whose vertical center is closest to the viewport center
function findClosestPost() {
  if (!livePosts || livePosts.length === 0) return null;

  const centerY = window.innerHeight / 2;
  let closest = null;
  let bestDist = Infinity;

  for (let post of livePosts) {
    try {
      if (!post || !post.getBoundingClientRect) continue;
      const rect = post.getBoundingClientRect();
      // Skip posts that are essentially invisible
      if (rect.height === 0 && rect.width === 0) continue;
      const postCenter = rect.top + rect.height / 2;
      const d = Math.abs(centerY - postCenter);
      if (d < bestDist) {
        bestDist = d;
        closest = post;
      }
    } catch (err) {
      // ignore errors for removed nodes, etc.
    }
  }

  return closest;
}

// Extracts author/content/url from a given post element (keeps original selectors)
function extractFromPostElement(closestPost) {
  if (!closestPost) return null;

  // Content selectors used previously
  const contentEl = closestPost.querySelector(".feed-shared-update-v2__description, span.break-words");
  const content = contentEl?.innerText?.trim() || "";

  let author = "";
  try {
    const authorEl =
      closestPost.querySelector("span.feed-shared-actor__title a") ||
      closestPost.querySelector("span.feed-shared-actor__name") ||
      closestPost.querySelector("a.app-aware-link");

    if (authorEl) {
      author = authorEl.innerText?.trim() || "";
    }
  } catch (err) {
    // ignore
  }

  if (!author) {
    const spanCandidates = closestPost.querySelectorAll("span[aria-hidden='true']");
    for (let span of spanCandidates) {
      const text = span.innerText?.trim();
      if (text && text.length > 2 && text.length < 50) {
        author = text;
        break;
      }
    }
  }

  // Try to build permalink from data-urn
  let postUrl = window.location.href;
  try {
    const activityUrn = closestPost.getAttribute("data-urn");
    if (activityUrn && activityUrn.includes("activity:")) {
      const postId = activityUrn.split("activity:")[1];
      postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${postId}`;
    } else {
      // Try to find a link inside the post as fallback
      const a = closestPost.querySelector("a.app-aware-link, a[href*='/feed/update/']");
      if (a && a.href) postUrl = a.href;
    }
  } catch (err) {
    // ignore
  }

  return { content, author, url: postUrl };
}

// Message listener (popup triggers this with action "extract_post")
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "extract_post") return;

  try {
    let closestPost = findClosestPost();
    if (closestPost) {
      const postData = extractFromPostElement(closestPost);
      if (postData && (postData.content || postData.author || postData.url)) {
        sendResponse({ success: true, postData });
        return true;
      }
    }

    // If nothing found immediately, wait briefly (MutationObserver fallback)
    // This covers the case where post elements are still being loaded after popup click.
    const fallbackObserver = new MutationObserver((mutations, obs) => {
      const cp = findClosestPost();
      if (cp) {
        obs.disconnect();
        const postData = extractFromPostElement(cp);
        if (postData && (postData.content || postData.author || postData.url)) {
          sendResponse({ success: true, postData });
        } else {
          sendResponse({ success: false });
        }
      }
    });

    fallbackObserver.observe(document.body, { childList: true, subtree: true });

    // Safety timeout so the popup doesn't hang forever
    const WAIT_MS = 5000;
    setTimeout(() => {
      try { fallbackObserver.disconnect(); } catch (e) {}
      sendResponse({ success: false });
    }, WAIT_MS);

  } catch (e) {
    console.error("content.js extract error:", e);
    sendResponse({ success: false });
  }

  // Return true to indicate we'll call sendResponse asynchronously
  return true;
});

// Start tracking posts now
try {
  trackLinkedInPosts();
} catch (e) {
  console.warn("trackLinkedInPosts failed:", e);
}

// Handle SPA navigation: reinitialize tracking if the URL changes
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    try {
      trackLinkedInPosts();
    } catch (e) {
      // ignore
    }
  }
}, 1000);
