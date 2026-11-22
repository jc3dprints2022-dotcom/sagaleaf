import type { SpecStatus } from '@/data/specs'

const CLS: Record<SpecStatus, string> = {
  Confirmed: 'tag--confirmed',
  Datasheet: 'tag--datasheet',
  Estimated: 'tag--estimated',
  Planned: 'tag--planned',
  'In development': 'tag--dev',
}
export function StatusTag({ status }: { status: SpecStatus }) {
  return <span className={`tag ${CLS[status]}`}>{status}</span>
}
