export function formatFactsEnvelopeForPrompt(
  envelope: unknown,
  taskLine: string,
): string {
  return [
    taskLine,
    '',
    '【factsEnvelope】',
    JSON.stringify(envelope, null, 2).slice(0, 14_000),
    '',
    '请严格按 system 要求输出 JSON：{"markdown":"...","sections":{...}}',
  ].join('\n');
}
