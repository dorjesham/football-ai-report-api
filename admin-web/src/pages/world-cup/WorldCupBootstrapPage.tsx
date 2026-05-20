import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { worldCupApi } from '../../api';
import ConfirmModal from '../../components/ConfirmModal';

export default function WorldCupBootstrapPage() {
  const [open, setOpen] = useState(false);
  const [generateAiDrafts, setGenerateAiDrafts] = useState(false);

  const bootstrap = useMutation({
    mutationFn: () =>
      worldCupApi.bootstrap({ season: 2026, maxParallel: 3, generateAiDrafts }),
    onSuccess: (data) => {
      setOpen(false);
      if (data.jobId) window.location.href = `/jobs/${data.jobId}`;
    },
  });

  return (
    <div>
      <p className="muted">13 步全量入库：赛程、球队、名单、积分榜、单场 AF、快照、预测、天气（T24）、覆盖度报告。</p>
      <label style={{ display: 'block', margin: '0.75rem 0' }}>
        <input
          type="checkbox"
          checked={generateAiDrafts}
          onChange={(e) => setGenerateAiDrafts(e.target.checked)}
        />{' '}
        同时生成 AI 草稿（仅门禁通过场次）
      </label>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        一键 Bootstrap
      </button>
      <ConfirmModal
        open={open}
        title="运行世界杯 AF 全量 Bootstrap？"
        confirmLabel="开始"
        pending={bootstrap.isPending}
        onConfirm={() => bootstrap.mutate()}
        onCancel={() => setOpen(false)}
      >
        <p className="muted" style={{ margin: 0 }}>
          任务较长，请在任务中心查看进度。默认不批量生成 AI 草稿。
        </p>
      </ConfirmModal>
    </div>
  );
}
