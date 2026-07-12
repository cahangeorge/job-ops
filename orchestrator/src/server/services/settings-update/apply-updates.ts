import type { SettingKey } from "@server/repositories/settings";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type {
  DeferredSideEffect,
  SettingsUpdateAction,
  SettingsUpdateContext,
  SettingsUpdatePlan,
  SettingUpdateHandler,
} from "./registry";
import { settingsUpdateRegistry } from "./registry";

async function runAction(action: SettingsUpdateAction): Promise<void> {
  await action.persist();
  if (action.sideEffect) {
    await action.sideEffect();
  }
}

export type PreparedSettingsUpdates = {
  actions: SettingsUpdateAction[];
  plan: SettingsUpdatePlan;
};

export async function prepareSettingsUpdates(
  input: UpdateSettingsInput,
): Promise<PreparedSettingsUpdates> {
  const context: SettingsUpdateContext = { input };
  const actions: SettingsUpdateAction[] = [];
  const deferredSideEffects = new Set<DeferredSideEffect>();
  const updatedSettingKeys = new Set<SettingKey>();

  const keys = Object.keys(input) as Array<keyof UpdateSettingsInput>;
  for (const key of keys) {
    const handler = settingsUpdateRegistry[key] as
      | SettingUpdateHandler<typeof key>
      | undefined;
    if (!handler) continue;

    const result = await handler({ key, value: input[key], context });
    actions.push(...result.actions);
    for (const deferred of result.deferredSideEffects) {
      deferredSideEffects.add(deferred);
    }
  }

  for (const action of actions) {
    updatedSettingKeys.add(action.settingKey);
  }

  return {
    actions,
    plan: {
      shouldRefreshBackupScheduler: deferredSideEffects.has(
        "refreshBackupScheduler",
      ),
      shouldClearRxResumeCaches: deferredSideEffects.has("clearRxResumeCaches"),
      updatedSettingKeys: Array.from(updatedSettingKeys).sort(),
    },
  };
}

/** Legacy/test-injection path: retain asynchronous repository writes. */
export async function applySettingsUpdates(
  input: UpdateSettingsInput,
): Promise<SettingsUpdatePlan> {
  const prepared = await prepareSettingsUpdates(input);
  await Promise.all(prepared.actions.map(runAction));
  return prepared.plan;
}
