// Shared local LM Studio client for alpha chat and the settings connection test.
globalThis.ZotlerLocalAI = (() => {
  function validate(config = {}) {
    let url;
    try { url = new URL(config.url); }
    catch { throw new Error("Enter a local server URL, such as http://localhost:1234."); }
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Use an HTTP server on localhost or 127.0.0.1, with no path or credentials.");
    }
    const model = (config.model || "").trim();
    if (!model) throw new Error("Enter your Gemma model identifier from LM Studio.");
    return { url: url.origin, model };
  }

  async function chat(config, messages) {
    const { url, model } = validate(config);
    let response;
    try {
      response = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false, temperature: 0.2, max_tokens: 4096 }),
        signal: AbortSignal.timeout(180000),
      });
    } catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("The local model timed out. Try a smaller model or retry after it loads.");
      throw new Error(`Cannot reach LM Studio at ${url}. In LM Studio’s Developer tab, start the server and confirm its port. Open ${url}/v1/models in your browser: if it fails, check the server; if it shows model data, reload Zotler and check LM Studio’s CORS setting.`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((typeof data.error === "string" ? data.error : data.error?.message) || `Local model returned HTTP ${response.status}.`);
    if (typeof data.choices?.[0]?.message?.content !== "string" || !data.choices[0].message.content.trim()) throw new Error("The local model returned an empty response.");
    return data.choices[0].message.content;
  }

  return { validate, chat };
})();
