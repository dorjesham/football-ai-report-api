import { useMutation } from '@tanstack/react-query';
import { worldCupApi } from '../../api';

export default function WorldCupIntelPage() {
  const batchPredictions = useMutation({
    mutationFn: () => worldCupApi.generatePredictions({ onlyMissing: true }),
    onSuccess: (data) => {
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  const batchAiDrafts = useMutation({
    mutationFn: () =>
      worldCupApi.generateAiDrafts({ onlyPublishable: true, forceRegenerateDraft: false }),
    onSuccess: (data) => {
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  return (
    <div>
      <p className="muted">
        批量 AF 预测仅补缺；AI 草稿默认仅对 evaluateGenerateGate 通过场次生成。发布前仍须满足发布门禁。
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn primary"
          disabled={batchPredictions.isPending}
          onClick={() => batchPredictions.mutate()}
        >
          批量 AF 预测
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={batchAiDrafts.isPending}
          onClick={() => batchAiDrafts.mutate()}
        >
          批量 AI 草稿（可生成门禁）
        </button>
      </div>
    </div>
  );
}
