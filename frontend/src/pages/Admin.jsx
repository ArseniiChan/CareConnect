import { useMemo, useState } from 'react'
import {
  appointments,
  careReceivers,
  caregivers,
  certifications,
  messages,
} from '../mockData'
import '../App.css'

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'caregivers', label: 'Caregivers' },
  { id: 'receivers', label: 'Care receivers' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'context', label: 'Care context' },
  { id: 'certs', label: 'Certifications' },
  { id: 'messages', label: 'Messages' },
]

const THEMES = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'paper', label: 'Paper' },
  { id: 'nocturne', label: 'Nocturne' },
]

function formatWhen(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Admin() {
  const [section, setSection] = useState('overview')
  const [theme, setTheme] = useState('aurora')

  const stats = useMemo(() => {
    const pending = appointments.filter((a) => a.status === 'pending').length
    const verified = caregivers.filter((c) => c.is_verified).length
    return {
      caregivers: caregivers.length,
      receivers: careReceivers.length,
      upcoming: appointments.filter((a) => a.status !== 'completed').length,
      pending,
      verified,
      msgs: messages.length,
    }
  }, [])

  return (
    <div className={`cc-app cc-theme-${theme}`}>
      <aside className="cc-sidebar">
        <div className="cc-brand">
          <span className="cc-logo" aria-hidden />
          <div>
            <strong>CareConnect</strong>
            <span className="cc-tagline">Coordination (mock UI)</span>
          </div>
        </div>
        <nav className="cc-nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? 'active' : ''}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="cc-theme-picker">
          <p>Design preset</p>
          <div className="cc-theme-buttons">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'active' : ''}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="cc-main">
        <header className="cc-header">
          <div>
            <h1>{NAV.find((n) => n.id === section)?.label ?? 'CareConnect'}</h1>
            <p className="cc-sub">
              Frontend-only preview mapped to your schema domains: profiles,
              care context, scheduling, credentials, and appointment messages.
            </p>
          </div>
        </header>

        {section === 'overview' && (
          <div className="cc-grid cc-stats">
            <article className="cc-card cc-stat">
              <span className="cc-stat-label">Caregivers</span>
              <strong>{stats.caregivers}</strong>
              <span className="cc-stat-hint">{stats.verified} verified</span>
            </article>
            <article className="cc-card cc-stat">
              <span className="cc-stat-label">Care receivers</span>
              <strong>{stats.receivers}</strong>
              <span className="cc-stat-hint">With context rows</span>
            </article>
            <article className="cc-card cc-stat">
              <span className="cc-stat-label">Active appointments</span>
              <strong>{stats.upcoming}</strong>
              <span className="cc-stat-hint">{stats.pending} pending</span>
            </article>
            <article className="cc-card cc-stat">
              <span className="cc-stat-label">Thread previews</span>
              <strong>{stats.msgs}</strong>
              <span className="cc-stat-hint">Appointment-scoped</span>
            </article>
          </div>
        )}

        {section === 'caregivers' && (
          <div className="cc-panel">
            <ul className="cc-list">
              {caregivers.map((c) => (
                <li key={c.id} className="cc-card cc-row">
                  <div className="cc-avatar" aria-hidden>
                    {c.first_name[0]}
                    {c.last_name[0]}
                  </div>
                  <div className="cc-row-body">
                    <strong>
                      {c.first_name} {c.last_name}
                    </strong>
                    <span className="cc-muted">
                      {c.email} · {c.phone}
                    </span>
                    <div className="cc-pills">
                      {c.is_verified && (
                        <span className="cc-pill cc-pill-ok">Verified</span>
                      )}
                      <span className="cc-pill">★ {c.rating.toFixed(1)}</span>
                      {c.certifications.map((x) => (
                        <span key={x} className="cc-pill ghost">
                          {x}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {section === 'receivers' && (
          <div className="cc-panel">
            <ul className="cc-list">
              {careReceivers.map((r) => (
                <li key={r.id} className="cc-card cc-row">
                  <div className="cc-avatar soft" aria-hidden>
                    {r.first_name[0]}
                    {r.last_name[0]}
                  </div>
                  <div className="cc-row-body">
                    <strong>
                      {r.first_name} {r.last_name}
                    </strong>
                    <span className="cc-muted">
                      DOB {r.birthday} · {r.sex} · {r.insurance}
                    </span>
                    <div className="cc-pills">
                      {r.diagnoses.map((d) => (
                        <span key={d} className="cc-pill">
                          {d}
                        </span>
                      ))}
                      {r.medications.map((m) => (
                        <span key={m} className="cc-pill ghost">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {section === 'appointments' && (
          <div className="cc-panel">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Caregiver</th>
                  <th>Receiver</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td>{formatWhen(a.start)}</td>
                    <td>{a.caregiver}</td>
                    <td>{a.receiver}</td>
                    <td>
                      <span className={`cc-badge cc-badge-${a.status}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="cc-muted">{a.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === 'context' && (
          <div className="cc-two">
            <section className="cc-card cc-subpanel">
              <h2>Insurance &amp; plans</h2>
              <ul>
                {careReceivers.map((r) => (
                  <li key={r.id}>
                    <strong>{r.first_name} {r.last_name}</strong>
                    <span className="cc-muted"> — {r.insurance}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="cc-card cc-subpanel">
              <h2>Diagnoses &amp; medications</h2>
              {careReceivers.map((r) => (
                <div key={r.id} className="cc-context-block">
                  <strong>
                    {r.first_name} {r.last_name}
                  </strong>
                  <p className="cc-muted">
                    {r.diagnoses.join(' · ')} — {r.medications.join(', ')}
                  </p>
                </div>
              ))}
            </section>
          </div>
        )}

        {section === 'certs' && (
          <div className="cc-panel">
            <ul className="cc-cert-grid">
              {certifications.map((c) => (
                <li key={c.code} className="cc-card cc-cert">
                  <span className="cc-cert-code">{c.code}</span>
                  <strong>{c.name}</strong>
                  <span className="cc-muted">{c.issuer}</span>
                  <span className="cc-muted small">
                    Renewal:{' '}
                    {c.renewal_months ? `${c.renewal_months} mo` : 'as licensed'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {section === 'messages' && (
          <div className="cc-panel">
            <ul className="cc-msg-list">
              {messages.map((m) => (
                <li key={m.id} className="cc-card cc-msg">
                  <div className="cc-msg-meta">
                    <span className="cc-pill ghost">{m.appointment_id}</span>
                    <time>{formatWhen(m.sent_at)}</time>
                  </div>
                  <p>{m.preview}</p>
                  <span className="cc-muted small">From: {m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
