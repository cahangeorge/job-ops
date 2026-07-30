import type { LlmProvider, ProviderStrategy } from "../types";
import { codexStrategy } from "./codex";
import { geminiStrategy } from "./gemini";
import { geminiCliStrategy } from "./gemini_cli";
import { glmStrategy } from "./glm";
import { lmStudioStrategy } from "./lmstudio";
import { ollamaStrategy } from "./ollama";
import { ollamaCloudStrategy } from "./ollama-cloud";
import { openAiStrategy } from "./openai";
import { openAiCompatibleStrategy } from "./openai-compatible";
import { opencodeGoStrategy } from "./opencode-go";
import { openRouterStrategy } from "./openrouter";

export const strategies: Record<LlmProvider, ProviderStrategy> = {
  openrouter: openRouterStrategy,
  lmstudio: lmStudioStrategy,
  ollama: ollamaStrategy,
  ollama_cloud: ollamaCloudStrategy,
  openai: openAiStrategy,
  openai_compatible: openAiCompatibleStrategy,
  opencode_go: opencodeGoStrategy,
  glm: glmStrategy,
  gemini: geminiStrategy,
  gemini_cli: geminiCliStrategy,
  codex: codexStrategy,
};
