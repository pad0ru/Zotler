# Local Gemma alpha test with LM Studio

1. Load your Gemma model in LM Studio.
2. Open LM Studio’s Developer tab and start the local API server. The default URL used by Zotler is `http://localhost:1234`.
3. Reload Zotler on your browser’s extensions page to apply the localhost permissions, then reopen the sidebar and Settings.
4. Under AI Assistant, enter the server URL without `/v1`, and your Gemma model identifier from LM Studio.
5. Click **Test connection**, then **Save Settings** after it succeeds. Send a question from the sidebar.

The connection test sends a short message without your course profile. Chat requests include your profile, completed courses, requirements context, and session history. Changing the saved model settings or profile clears that context. The client connects only to `localhost` or `127.0.0.1` using LM Studio’s `/v1/chat/completions` endpoint.

If browser requests are blocked, enable CORS in LM Studio’s server settings. This alpha client assumes server authentication is disabled. Requests time out after three minutes to allow for model loading. If you previously saved an Ollama URL, replace it with your LM Studio URL in Settings.

See the official [server setup](https://lmstudio.ai/docs/developer/core/server), [server settings](https://lmstudio.ai/docs/developer/core/server/settings), and [chat completions API](https://lmstudio.ai/docs/developer/openai-compat/chat-completions) documentation.
