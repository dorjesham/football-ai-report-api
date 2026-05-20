import { IngestJobTrackerService } from './ingest-job-tracker.service';

describe('IngestJobTrackerService.resolveJobOk', () => {
  const tracker = new IngestJobTrackerService({} as never);
  const resolve = (summary: Record<string, unknown>, hardFail: boolean) =>
    tracker.resolveJobOk(summary, hardFail);

  it('returns PARTIAL_SUCCESS when some matches fail and some succeed', () => {
    const r = resolve(
      { processed: 10, factsOk: 8, factsFailed: 2, errors: ['x', 'y'] },
      false,
    );
    expect(r.status).toBe('PARTIAL_SUCCESS');
    expect(r.ok).toBe(true);
  });

  it('returns FAILED when all processed matches failed', () => {
    const r = resolve(
      { processed: 5, factsFailed: 5, factsOk: 0, errors: ['a', 'b'] },
      false,
    );
    expect(r.status).toBe('FAILED');
    expect(r.ok).toBe(false);
  });
});
