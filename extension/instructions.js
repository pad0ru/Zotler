const promptField = document.getElementById("csv-prompt");
const copyStatus = document.getElementById("copy-status");
const copyButton = document.getElementById("copy-prompt");

// Render common Markdown formatting using DOM nodes, keeping HTML as text.
function appendInline(parent, text) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(offset, match.index)));
    const token = match[0];
    let node;
    if (token.startsWith("[")) {
      const [, label, url] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (/^https?:\/\//i.test(url)) {
        node = document.createElement("a");
        node.href = url;
        node.target = "_blank";
        node.rel = "noopener";
        node.textContent = label;
      } else {
        node = document.createTextNode(token);
      }
    } else {
      const marker = token.startsWith("**") ? 2 : 1;
      node = document.createElement(token.startsWith("`") ? "code" : marker === 2 ? "strong" : "em");
      node.textContent = token.slice(marker, -marker);
    }
    parent.append(node);
    offset = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
}

function renderMarkdown(container, markdown) {
  container.replaceChildren();
  let list = null;
  let paragraph = null;
  let code = null;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("```")) {
      if (code) { code = null; } else {
        const pre = document.createElement("pre");
        code = document.createElement("code");
        pre.append(code);
        container.append(pre);
      }
      list = paragraph = null;
      continue;
    }
    if (code) { code.append(document.createTextNode(line + "\n")); continue; }
    if (!line.trim()) { list = paragraph = null; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const item = line.match(/^\s*(?:(\d+)\.\s+|[-*+]\s+)(.+)$/);
    if (heading) {
      const node = document.createElement(`h${heading[1].length}`);
      appendInline(node, heading[2]);
      container.append(node);
      list = paragraph = null;
    } else if (item) {
      const type = item[1] ? "ol" : "ul";
      if (!list || list.localName !== type) {
        list = document.createElement(type);
        if (item[1]) list.start = Number(item[1]);
        container.append(list);
      }
      const node = document.createElement("li");
      appendInline(node, item[2]);
      list.append(node);
      paragraph = null;
    } else {
      list = null;
      if (!paragraph) { paragraph = document.createElement("p"); container.append(paragraph); }
      else paragraph.append(document.createTextNode(" "));
      appendInline(paragraph, line);
    }
  }
}

async function loadMarkdown(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.text();
}

async function loadGuide() {
  const content = document.getElementById("instructions-content");
  await Promise.all([
    loadMarkdown("Instructions/Instructions.md").then(text => renderMarkdown(content, text))
      .catch(() => { content.textContent = "Couldn't load instructions. Refresh the guide to try again."; }),
    loadMarkdown("Instructions/Prompt.md").then(text => {
      promptField.value = text.replace(/\\_/g, "_").trim();
      copyButton.disabled = false;
    }).catch(() => {
      promptField.placeholder = "Couldn't load the prompt. Refresh the guide to try again.";
      copyStatus.textContent = "Prompt unavailable.";
    }),
  ]);
}

loadGuide();

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(promptField.value);
    copyStatus.textContent = "Prompt copied. Paste it into your AI chat.";
  } catch {
    promptField.focus();
    promptField.select();
    copyStatus.textContent = "Press Ctrl+C (or Cmd+C) to copy the selected prompt.";
  }
});
