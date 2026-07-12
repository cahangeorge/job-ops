export const duplicateGmailExternalEvents = [
  { id: " message-42 ", threadId: " thread-9 " },
  { id: "message-42", threadId: "thread-9" },
] as const;

export const expectedNormalizedGmailEvent = {
  externalId: "message-42",
  externalThreadId: "thread-9",
  normalizedKey: "gmail:primary:message-42",
};
