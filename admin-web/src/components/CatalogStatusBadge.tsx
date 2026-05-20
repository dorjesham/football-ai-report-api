import type { CatalogStatus } from '../catalog-api';

export default function CatalogStatusBadge({ status }: { status: CatalogStatus }) {
  const cls =
    status === 'present' ? 'ok'
    : status === 'empty' ? 'warn'
    : 'miss';
  return <span className={`badge ${cls}`}>{status}</span>;
}
