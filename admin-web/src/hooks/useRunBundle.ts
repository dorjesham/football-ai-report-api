import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { api } from '../api';
import { formatApiError } from '../lib/api-errors';

type RunResult = { jobId: string; status: string; deduplicated?: boolean };

export function useRunBundle() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<{
    bundleId: string;
    body: Record<string, unknown>;
    title: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ bundleId, body }: { bundleId: string; body: Record<string, unknown> }) =>
      api<RunResult>(`/admin/api/ingest/bundles/${bundleId}/run`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setConfirm(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      if (data.jobId) navigate(`/jobs/${data.jobId}`);
    },
    onError: (err) => setError(formatApiError(err)),
  });

  const requestRun = useCallback(
    (
      bundleId: string,
      body: Record<string, unknown>,
      opts?: { title?: string; message?: string },
    ) => {
      setError(null);
      setConfirm({
        bundleId,
        body,
        title: opts?.title ?? '确认运行任务',
        message:
          opts?.message ??
          '将创建后台任务并消耗 API 配额。可在任务中心查看进度与失败明细。',
      });
    },
    [],
  );

  const confirmRun = useCallback(() => {
    if (!confirm) return;
    mutation.mutate({ bundleId: confirm.bundleId, body: confirm.body });
  }, [confirm, mutation]);

  const cancelRun = useCallback(() => {
    setConfirm(null);
    setError(null);
  }, []);

  return {
    requestRun,
    confirmRun,
    cancelRun,
    confirm,
    error,
    isPending: mutation.isPending,
  };
}
