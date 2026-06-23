import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const opencodeGoStrategy = createProviderStrategy({
  provider: "opencode_go",
  defaultBaseUrl: "http://localhost:8080",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    return {
      url: joinUrl(baseUrl, "/v1/chat/completions"),
      headers: buildHeaders({ apiKey, provider: "opencode_go" }),
      body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
    };
  },
  extractText: extractChatCompletionsText,
});
