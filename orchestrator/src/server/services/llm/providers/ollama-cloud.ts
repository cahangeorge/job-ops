import { buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";
import { createProviderStrategy } from "./factory";

/**
 * Native Ollama API strategy.
 * See https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * Chat:        POST /api/chat   body: {model, messages, stream: false}
 * Models:      GET  /api/tags   returns {models: [{name: "..."}]}
 * Auth:        Bearer token in Authorization header
 *
 * Base URL should be https://ollama.com (without /api suffix).
 */
export const ollamaCloudStrategy = createProviderStrategy({
  provider: "ollama_cloud",
  defaultBaseUrl: "https://ollama.com",
  requiresApiKey: true,
  modes: ["text", "none"],
  validationPaths: ["/api/tags"],
  getValidationUrls: ({ baseUrl }) => {
    // Strip trailing /api to avoid double-paths if user entered https://ollama.com/api
    const cleaned = baseUrl.replace(/\/api\/?$/i, "");
    return ["/api/tags"].map((path) => joinUrl(cleaned, path));
  },
  buildRequest: ({ baseUrl, apiKey, model, messages }) => {
    return {
      url: joinUrl(baseUrl.replace(/\/api\/?$/i, ""), "/api/chat"),
      headers: buildHeaders({ apiKey, provider: "ollama_cloud" }),
      body: {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : m.content
                  .map((part) => (part.type === "text" ? part.text : "[image]"))
                  .join("\n"),
        })),
        stream: false,
      },
    };
  },
  extractText: (response: unknown): string | null => {
    // Ollama /api/chat returns { message: { role: "assistant", content: "..." } }
    const content = getNestedValue(response, ["message", "content"]);
    return typeof content === "string" ? content : null;
  },
});
