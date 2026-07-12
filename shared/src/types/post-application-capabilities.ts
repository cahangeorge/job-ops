import { z } from "zod";
import {
  POST_APPLICATION_PROVIDER_ACTIONS,
  POST_APPLICATION_PROVIDER_CAPABILITY_CONNECTION_MODES,
  POST_APPLICATION_PROVIDERS,
} from "./post-application";

export const postApplicationProviderCapabilitiesSchema = z.object({
  provider: z.enum(POST_APPLICATION_PROVIDERS),
  connectionMode: z.enum(POST_APPLICATION_PROVIDER_CAPABILITY_CONNECTION_MODES),
  sync: z.object({ supported: z.boolean() }),
  cursor: z.object({ supported: z.boolean(), storage: z.literal("none") }),
  checkpoint: z.object({ supported: z.boolean(), storage: z.literal("none") }),
  pagination: z.object({ supported: z.boolean() }),
  actions: z.object({
    connect: z.boolean(),
    status: z.boolean(),
    sync: z.boolean(),
    disconnect: z.boolean(),
  }),
});

export const postApplicationProviderActionSchema = z.enum(
  POST_APPLICATION_PROVIDER_ACTIONS,
);
