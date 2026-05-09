// AdminRevenuePage — admin-only revenue dashboard.
//
// Two views in one page:
//   - Top "totals" row: paid count + dollars over the chosen window
//   - Two tables: revenue by day (recent first) and top caregivers
//   - Excel export button — fetches /admin/revenue/export.csv with the
//     bearer token attached, then triggers a browser download
//
// Design choices:
//   - Period is a select (7 / 30 / 90 / 365 days). Sensible defaults beat
//     a date picker for an admin reporting page.
//   - Numbers are formatted as USD with thousand separators — table data
//     should never be raw integer cents.
//   - Empty state is a one-line invite, not a long apology.

import { useEffect, useState } from 'react';
import { Download, RefreshCw, DollarSign } from 'lucide-react';
import { admin } from '../api/client';

const PERIOD_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
];

const usd = (cents) => (cents / 100).toLocaleString('en-US', {
  style: 'currency', currency: 'USD',
});

export default function AdminRevenuePage() {
  const [period, setPeriod] = useState(30);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    admin.revenue(period)
      .then((res) => { if (!cancelled) setReport(res.data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  async function handleExport() {
    setExporting(true);
    try {
      await admin.exportRevenueCsv(period);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-neutral-900)]">
          Revenue
        </h1>
        <p className="mt-2 text-lg text-[var(--color-neutral-600)]">
          Earnings from completed appointments.
        </p>
      </header>

      {error && <p className="alert alert-error mb-6">{error}</p>}

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="period" className="field-label">Period</label>
          <select
            id="period"
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="input"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || !report}
          className="btn btn-primary"
        >
          {exporting
            ? <><RefreshCw size={18} className="animate-spin" aria-hidden="true" /> Exporting…</>
            : <><Download size={18} aria-hidden="true" /> Download CSV</>}
        </button>
      </div>

      {/* ── Totals ────────────────────────────────────────── */}
      {/* Three numbers: gross is what flowed through us, platform fee is
          what we kept (the actual revenue line), payouts is what
          caregivers received. The fee is the headline number. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Platform revenue"
          hint="What CareConnect kept (20% fee)"
          value={loading || !report ? '—' : usd(report.totals.platform_fee_cents)}
          icon={DollarSign}
          accent
        />
        <Stat
          label="Gross billings"
          hint="Total customers paid"
          value={loading || !report ? '—' : usd(report.totals.gross_cents)}
        />
        <Stat
          label="Caregiver payouts"
          hint="What caregivers received"
          value={loading || !report ? '—' : usd(report.totals.caregiver_payout_cents)}
        />
      </div>

      <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
        {loading || !report ? ' ' :
          `${report.totals.paid_count.toLocaleString()} paid booking${report.totals.paid_count === 1 ? '' : 's'} in the last ${report.period_days} days.`}
      </p>

      {/* ── By day ───────────────────────────────────────── */}
      <Section title="Revenue by day">
        {loading && <Skeleton />}
        {!loading && report && report.by_day.length === 0 && (
          <Empty body="No paid bookings in this window yet." />
        )}
        {!loading && report && report.by_day.length > 0 && (
          <Table headers={['Date', 'Bookings', 'Gross', 'Platform fee']}>
            {report.by_day.map((row) => (
              <tr key={row.date}>
                <Td>{row.date}</Td>
                <Td>{row.count}</Td>
                <Td>{usd(row.gross_cents)}</Td>
                <Td className="font-semibold text-[var(--color-primary-700)]">{usd(row.platform_fee_cents)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ── By caregiver ─────────────────────────────────── */}
      <Section title="Top caregivers by platform fee">
        {loading && <Skeleton />}
        {!loading && report && report.by_caregiver.length === 0 && (
          <Empty body="Caregivers will appear here once they complete paid bookings." />
        )}
        {!loading && report && report.by_caregiver.length > 0 && (
          <Table headers={['Caregiver', 'Jobs', 'Payout', 'Platform fee']}>
            {report.by_caregiver.map((row, i) => (
              <tr key={i}>
                <Td>{`${row.first_name} ${row.last_name}`}</Td>
                <Td>{row.job_count}</Td>
                <Td>{usd(row.payout_cents)}</Td>
                <Td className="font-semibold text-[var(--color-primary-700)]">{usd(row.fee_cents)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, hint, value, icon: Icon, accent = false }) {
  return (
    <div className={`card flex items-center gap-4 ${accent ? 'border-[var(--color-primary-200)] bg-gradient-to-br from-[var(--color-primary-50)] to-white' : ''}`}>
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-[var(--color-primary-700)]">
          <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-base font-semibold text-[var(--color-neutral-700)]">{label}</p>
        {hint && <p className="text-sm text-[var(--color-neutral-500)]">{hint}</p>}
        <p className="mt-1 text-2xl font-bold text-[var(--color-neutral-900)]">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-bold text-[var(--color-neutral-900)]">{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-neutral-50)]">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-neutral-600)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = '' }) {
  return (
    <td className={`border-t border-[var(--color-border)] px-4 py-3 text-base text-[var(--color-neutral-900)] ${className}`}>
      {children}
    </td>
  );
}

function Skeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />;
}

function Empty({ body }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-white p-8 text-center">
      <p className="text-base text-[var(--color-neutral-600)]">{body}</p>
    </div>
  );
}
