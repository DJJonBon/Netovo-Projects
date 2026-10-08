import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Inbox,
  LoaderCircle,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  type FaxJob,
  type FaxQuery,
  type FaxService,
  type FaxStatus,
  type Organization,
  isInternationalNumber,
  validatePdf,
} from './domain';
import { demoOrganizations } from './services/mock';
import { getDemoService, simulateListError } from './services';

type Screen = 'send' | 'history' | 'inbox' | 'settings';
const nav = [
  { id: 'send', label: 'Send Fax', icon: Send },
  { id: 'history', label: 'Fax History', icon: History },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'settings', label: 'Organization', icon: Settings },
] as const;
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
const size = (bytes: number) =>
  bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
function Badge({ status }: { status: FaxStatus }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <ShieldCheck size={18} />
      <div>{children}</div>
    </div>
  );
}
function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export default function App() {
  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1';
  const [orgId, setOrgId] = useState(demoOrganizations[0].id);
  const [screen, setScreen] = useState<Screen>('send');
  const [org, setOrg] = useState<Organization | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const service = getDemoService(orgId);
  useEffect(() => {
    let active = true;
    setOrg(null);
    service.getContext().then((value) => {
      if (active) setOrg(value);
    });
    return () => {
      active = false;
    };
  }, [service]);
  const navigation = (
    <nav aria-label="Main navigation">
      {nav.map((item) => (
        <button
          key={item.id}
          className={screen === item.id ? 'nav-item active' : 'nav-item'}
          aria-current={screen === item.id ? 'page' : undefined}
          onClick={() => {
            setScreen(item.id);
            setSelected(null);
          }}
        >
          <item.icon size={18} />
          <span>{item.label}</span>
          {item.id === 'send' && <Plus size={15} className="nav-plus" />}
        </button>
      ))}
    </nav>
  );
  return (
    <div className={`app ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <aside className="sidebar">
          <a className="logo" href="./">
            <span className="logo-mark">n</span>netovo<span className="logo-product">FAX</span>
          </a>
          <div className="workspace-label">WORKSPACE</div>
          {navigation}
          <div className="sidebar-bottom">
            <span className="avatar">{org?.initials || '…'}</span>
            <div>
              <strong>{org?.name || 'Loading…'}</strong>
              <small>Demo workspace</small>
            </div>
          </div>
        </aside>
      )}
      <div className="main-shell">
        {!embedded && (
          <header className="topbar">
            <div>
              Workspace <span>/</span>{' '}
              <strong>{nav.find((item) => item.id === screen)?.label}</strong>
            </div>
            <span className="user-avatar">
              {org?.users[0].name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
          </header>
        )}
        <div className="demo-bar">
          <div>
            <span className="demo-pill">DEMO MODE</span>
            <span>Synthetic data. No real faxes are sent.</span>
          </div>
          <label>
            Demo-only organization{' '}
            <select
              aria-label="Demo-only organization"
              value={orgId}
              onChange={(e) => {
                setOrgId(e.target.value);
                setSelected(null);
              }}
            >
              {demoOrganizations.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {embedded && <div className="embedded-nav">{navigation}</div>}
        <main key={orgId}>
          {!org ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              Loading demo workspace…
            </div>
          ) : (
            <>
              {screen === 'send' && (
                <SendFax
                  service={service}
                  org={org}
                  onHistory={(id) => {
                    setSelected(id);
                    setScreen('history');
                  }}
                />
              )}
              {(screen === 'history' || screen === 'inbox') && (
                <FaxList
                  key={screen}
                  service={service}
                  org={org}
                  inbox={screen === 'inbox'}
                  initialSelected={selected}
                  onSend={() => setScreen('send')}
                />
              )}
              {screen === 'settings' && <OrganizationSettings org={org} />}
            </>
          )}
        </main>
        <footer>
          Netovo Fax <span>Demo environment · Files stay in your browser</span>
        </footer>
      </div>
    </div>
  );
}

function SendFax({
  service,
  org,
  onHistory,
}: {
  service: FaxService;
  org: Organization;
  onHistory: (id: string) => void;
}) {
  const [sender, setSender] = useState(org.numbers[0]);
  const [recipient, setRecipient] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'compose' | 'review' | 'done'>('compose');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [drag, setDrag] = useState(false);
  const [job, setJob] = useState<FaxJob | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const validation = useRef(0);
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  useEffect(
    () => () => {
      validation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!job || job.status === 'delivered') return;
    let active = true;
    const timer = window.setInterval(
      () =>
        service
          .getJob(job.id)
          .then((value) => {
            if (active) setJob(value);
          })
          .catch(() => {
            if (active)
              setError('Unable to refresh the simulated status. Open Fax History to retry.');
          }),
      1000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.status, service]);
  async function choose(files: FileList | null) {
    const attempt = ++validation.current;
    setChecking(false);
    setError('');
    setFile(null);
    if (!files?.length) return;
    if (files.length !== 1) {
      setError('Choose exactly one PDF.');
      return;
    }
    const selectedFile = files[0];
    setChecking(true);
    try {
      const message = await validatePdf(selectedFile);
      if (attempt !== validation.current) return;
      if (message) setError(message);
      else setFile(selectedFile);
    } catch {
      if (attempt === validation.current)
        setError('Unable to read this file. Please choose it again.');
    } finally {
      if (attempt === validation.current) setChecking(false);
    }
  }
  function review() {
    if (!sender || !isInternationalNumber(recipient)) {
      setError(
        'Enter a destination in international format, such as +12025550187 (8–15 digits, no spaces).',
      );
      return;
    }
    if (!file) {
      setError('Attach one PDF before continuing.');
      return;
    }
    setError('');
    setStep('review');
  }
  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      setJob(
        await service.submitFax({ sendingNumber: sender, destination: recipient, document: file }),
      );
      setStep('done');
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">YOUR FAX WORKSPACE</div>
        <h1>Send a fax</h1>
        <p>A simple, secure workflow for your next document.</p>
      </div>
      <div className="send-layout">
        <section className="card compose">
          <div className="card-heading">
            <div className="section-icon">
              <Send size={20} />
            </div>
            <div>
              <h2>
                {step === 'done'
                  ? 'Simulation submitted'
                  : step === 'review'
                    ? 'Review your fax'
                    : 'New fax'}
              </h2>
              <p>
                {step === 'review'
                  ? 'Confirm the details before simulating delivery.'
                  : step === 'done'
                    ? 'No real fax has been transmitted.'
                    : 'Add a recipient and attach your document.'}
              </p>
            </div>
          </div>
          <ol className="steps">
            <li className={step === 'compose' ? 'current' : 'complete'}>
              <span>{step !== 'compose' ? <Check size={13} /> : '1'}</span>Compose
            </li>
            <li className={step === 'review' ? 'current' : step === 'done' ? 'complete' : ''}>
              <span>2</span>Review
            </li>
            <li className={step === 'done' ? 'current' : ''}>
              <span>3</span>Simulate
            </li>
          </ol>
          {step === 'compose' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
              noValidate
            >
              <div className="form-body">
                <label className="field">
                  Sending number <span className="required">*</span>
                  <select value={sender} onChange={(e) => setSender(e.target.value)}>
                    {org.numbers.map((number) => (
                      <option key={number}>{number}</option>
                    ))}
                  </select>
                  <small>Assigned to {org.name}</small>
                </label>
                <label className="field">
                  Destination fax number <span className="required">*</span>
                  <input
                    type="tel"
                    autoComplete="off"
                    placeholder="+12025550187"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    aria-describedby="number-help"
                  />
                  <small id="number-help">Include the country code. Example: +12025550187</small>
                </label>
                <div className="field">
                  Document <span className="required">*</span>
                </div>
                <div
                  className={`dropzone ${drag ? 'dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    void choose(e.dataTransfer.files);
                  }}
                >
                  <div className="upload-icon">
                    <UploadCloud size={27} />
                  </div>
                  <strong>Drag and drop your PDF here</strong>
                  <p>
                    or{' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => input.current?.click()}
                    >
                      browse files
                    </button>
                  </p>
                  <small>One PDF · Up to 20 MB</small>
                  <input
                    ref={input}
                    aria-label="Upload PDF"
                    className="file-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      void choose(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                {checking && <p role="status">Checking PDF…</p>}
                {file && (
                  <div className="file-row">
                    <FileText size={23} />
                    <div>
                      <strong>{file.name}</strong>
                      <small>{size(file.size)} · Local PDF</small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove document"
                      onClick={() => setFile(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                <p className="format-note">
                  PDF documents only for now. Word and image support is planned; conversion is not
                  implemented.
                </p>
                {file && url && (
                  <details className="preview">
                    <summary>Preview attached PDF</summary>
                    <p>
                      <a href={url} target="_blank" rel="noreferrer">
                        Open local PDF in a new tab
                      </a>
                    </p>
                    <object data={url} type="application/pdf" aria-label="Local PDF preview">
                      <p>Your browser cannot display this PDF inline. Use the link above.</p>
                    </object>
                  </details>
                )}
                {error && <ErrorMessage>{error}</ErrorMessage>}
              </div>
              <div className="card-actions">
                <span>
                  <ShieldCheck size={15} />
                  Local-only demo upload
                </span>
                <button className="primary" disabled={checking}>
                  Review fax <ArrowUpRight size={16} />
                </button>
              </div>
            </form>
          ) : step === 'review' ? (
            <div className="form-body">
              <dl className="review-list">
                <dt>From</dt>
                <dd>{sender}</dd>
                <dt>To</dt>
                <dd>{recipient}</dd>
                <dt>Document</dt>
                <dd>
                  {file?.name} <small>{file && size(file.size)}</small>
                </dd>
                <dt>Organization</dt>
                <dd>{org.name}</dd>
              </dl>
              <Notice>
                This will simulate delivery using local metadata. Your PDF is not uploaded and no
                notification email is sent.
              </Notice>
              {error && <ErrorMessage>{error}</ErrorMessage>}
              <div className="button-row">
                <button className="secondary" disabled={busy} onClick={() => setStep('compose')}>
                  Back to edit
                </button>
                <button className="primary" disabled={busy} onClick={() => void submit()}>
                  {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}{' '}
                  {busy ? 'Simulating…' : 'Simulate send'}
                </button>
              </div>
            </div>
          ) : (
            <div className="form-body success">
              <div className="success-icon">
                <Check size={30} />
              </div>
              <h2>Your demo fax is {job?.status}.</h2>
              <p>Follow its simulated progress below or in Fax History.</p>
              <div aria-live="polite">{job && <Badge status={job.status} />}</div>
              <p className="muted">
                {job?.filename} → {job?.destination}
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => {
                    setStep('compose');
                    setJob(null);
                    setRecipient('');
                  }}
                >
                  Send another
                </button>
                <button className="primary" onClick={() => job && onHistory(job.id)}>
                  View in history <ArrowUpRight size={16} />
                </button>
              </div>
              {error && <ErrorMessage>{error}</ErrorMessage>}
            </div>
          )}
        </section>
        <aside className="send-aside">
          <section className="card info-card">
            <div className="section-icon">
              <FileText size={21} />
            </div>
            <h3>Ready for a smooth send</h3>
            <p>A quick check before you begin.</p>
            <ul className="checklist">
              <li>
                <Check size={16} />
                <div>
                  <strong>Use the full fax number</strong>
                  <p>Start with + and the country code.</p>
                </div>
              </li>
              <li>
                <Check size={16} />
                <div>
                  <strong>Attach a readable PDF</strong>
                  <p>Check the pages and orientation in the local preview.</p>
                </div>
              </li>
              <li>
                <Check size={16} />
                <div>
                  <strong>Review, then simulate</strong>
                  <p>See how delivery status will appear in your workspace.</p>
                </div>
              </li>
            </ul>
          </section>
          <div className="demo-note">
            <ShieldCheck size={20} />
            <h3>A safe place to explore</h3>
            <p>
              This workspace uses fictional organizations and sample fax records. Your connected
              Azure fax services are not used.
            </p>
            <span className="small-label">DEMO ENVIRONMENT</span>
          </div>
        </aside>
      </div>
    </>
  );
}

const defaultQuery: FaxQuery = { search: '', status: '', from: '', to: '', page: 1, pageSize: 6 };
function FaxList({
  service,
  org,
  inbox,
  initialSelected,
  onSend,
}: {
  service: FaxService;
  org: Organization;
  inbox: boolean;
  initialSelected: string | null;
  onSend: () => void;
}) {
  const [query, setQuery] = useState<FaxQuery>({
    ...defaultQuery,
    direction: inbox ? 'inbound' : undefined,
  });
  const [items, setItems] = useState<FaxJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(initialSelected);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    service
      .listJobs(query)
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [service, query, refresh]);
  useEffect(() => {
    if (!items.some((j) => j.status === 'queued' || j.status === 'sending') || error) return;
    const timer = setTimeout(() => setRefresh((n) => n + 1), 2000);
    return () => clearTimeout(timer);
  }, [items, error]);
  const filter = (value: Partial<FaxQuery>) => setQuery((q) => ({ ...q, ...value, page: 1 }));
  return (
    <>
      <div className="page-heading heading-row">
        <div>
          <div className="eyebrow">{inbox ? 'RECEIVED DOCUMENTS' : 'ACTIVITY & DELIVERY'}</div>
          <h1>{inbox ? 'Inbox' : 'Fax history'}</h1>
          <p>
            {inbox
              ? 'Preview your future inbound fax workspace.'
              : 'Every document, with a clear delivery trail.'}
          </p>
        </div>
        {!inbox && (
          <button className="primary" onClick={onSend}>
            <Plus size={17} />
            Send a fax
          </button>
        )}
      </div>
      {inbox && (
        <Notice>
          <strong>Inbound portal integration is not connected.</strong> These are synthetic records.
          Existing inbound email delivery does not populate this portal.
        </Notice>
      )}
      <section className="card history-card">
        <div className="list-title">
          <h2>
            {inbox ? 'Received faxes' : 'All faxes'} <span className="count">{total}</span>
          </h2>
          <button
            className="text-button"
            onClick={() => {
              simulateListError(org.id);
              setRefresh((n) => n + 1);
            }}
          >
            Demo: simulate load error
          </button>
        </div>
        <div className="filters">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search faxes"
              value={query.search}
              placeholder="Search name, number, or submitter…"
              onChange={(e) => filter({ search: e.target.value })}
            />
          </label>
          <label className="filter-field">
            Status
            <select
              value={query.status}
              onChange={(e) => filter({ status: e.target.value as FaxStatus | '' })}
            >
              <option value="">All statuses</option>
              {(inbox
                ? ['received']
                : ['queued', 'sending', 'delivered', 'failed', 'received']
              ).map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            From (UTC)
            <input
              type="date"
              value={query.from}
              onChange={(e) => filter({ from: e.target.value })}
            />
          </label>
          <label className="filter-field">
            To (UTC)
            <input
              type="date"
              min={query.from}
              value={query.to}
              onChange={(e) => filter({ to: e.target.value })}
            />
          </label>
          <button
            className="text-button"
            onClick={() => setQuery({ ...defaultQuery, direction: inbox ? 'inbound' : undefined })}
          >
            Reset
          </button>
        </div>
        {loading ? (
          <div className="empty" role="status">
            <LoaderCircle className="spin" />
            Loading demo faxes…
          </div>
        ) : error ? (
          <div className="empty">
            <ErrorMessage>{error}</ErrorMessage>
            <button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <Inbox size={30} />
            <h3>No faxes found</h3>
            <p>Try another search or reset your filters.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Document / date</th>
                  <th>Direction</th>
                  <th>Sending number</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Submitted by</th>
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <button className="document-link" onClick={() => setSelected(job.id)}>
                        <FileText size={18} />
                        {job.filename}
                      </button>
                      <small>{date(job.createdAt)}</small>
                    </td>
                    <td>
                      <span className="direction">
                        {job.direction === 'inbound' ? (
                          <ArrowDownLeft size={15} />
                        ) : (
                          <ArrowUpRight size={15} />
                        )}{' '}
                        {job.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                      </span>
                    </td>
                    <td className="number">{job.sendingNumber}</td>
                    <td className="number">{job.destination}</td>
                    <td>
                      <Badge status={job.status} />
                    </td>
                    <td>{job.submittedBy}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`View details for ${job.filename}`}
                        onClick={() => setSelected(job.id)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {total
              ? `${(query.page - 1) * query.pageSize + 1}–${Math.min(query.page * query.pageSize, total)} of ${total} faxes`
              : '0 faxes'}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={loading || query.page === 1}
              onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {query.page} of {Math.max(1, Math.ceil(total / query.pageSize))}
            </span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={loading || query.page * query.pageSize >= total}
              onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <p className="below-note">
        All records and notification states are simulated. Times are shown in your local timezone;
        date filters use UTC.
      </p>
      {selected && (
        <Detail
          service={service}
          id={selected}
          onClose={() => {
            setSelected(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </>
  );
}

function Detail({
  service,
  id,
  onClose,
}: {
  service: FaxService;
  id: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<FaxJob | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setError('');
    async function load() {
      try {
        const result = await service.getJob(id);
        if (active) setJob(result);
      } catch {
        if (active) setError('Unable to load the demo fax.');
      }
    }
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, service, retry]);
  return (
    <dialog
      className="detail-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="detail-title"
    >
      <div className="detail-heading">
        <div>
          <div className="eyebrow">FAX DETAILS · DEMO</div>
          <h2 id="detail-title">Delivery details</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close details">
          <X size={20} />
        </button>
      </div>
      {error ? (
        <>
          <ErrorMessage>{error}</ErrorMessage>
          <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </>
      ) : !job ? (
        <p role="status">Loading fax…</p>
      ) : (
        <>
          <div className="detail-file">
            <FileText size={26} />
            <div>
              <h3>{job.filename}</h3>
              <small>
                {size(job.size)} · {job.direction}
              </small>
            </div>
            <Badge status={job.status} />
          </div>
          <dl className="review-list">
            <dt>Sending number</dt>
            <dd>{job.sendingNumber}</dd>
            <dt>Destination</dt>
            <dd>{job.destination}</dd>
            <dt>Submitted by</dt>
            <dd>{job.submittedBy}</dd>
            <dt>Created</dt>
            <dd>{date(job.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{date(job.updatedAt)}</dd>
            <dt>Job ID</dt>
            <dd className="identifier">{job.id}</dd>
            <dt>Provider fax ID</dt>
            <dd>{job.providerFaxId || 'Not assigned (demo)'}</dd>
            <dt>Tenant context</dt>
            <dd>{job.tenantId}</dd>
            <dt>Notification</dt>
            <dd>
              {job.notificationState === 'simulated-sent'
                ? 'Sent (simulated; no email sent)'
                : job.notificationState}
            </dd>
          </dl>
          {job.failureReason && <ErrorMessage>{job.failureReason}</ErrorMessage>}
          <h3>Event timeline</h3>
          <ol className="timeline">
            {job.events.map((event, index) => (
              <li key={index}>
                <strong>{event.title}</strong>
                <small>{date(event.at)}</small>
                <p>{event.detail}</p>
              </li>
            ))}
          </ol>
          <div className="retention">
            <h3>Document availability</h3>
            <p>
              No document is stored in demo history. Sample PDFs are not downloadable; uploaded
              previews are released after submission or leaving Send Fax.
            </p>
            <p>
              <strong>
                {Date.parse(job.documentExpiresAt) < Date.now()
                  ? 'Simulated retention expired'
                  : 'Simulated retention ends'}
                :
              </strong>{' '}
              {date(job.documentExpiresAt)}. This date is illustrative; a backend must enforce
              actual retention.
            </p>
          </div>
        </>
      )}
    </dialog>
  );
}

function OrganizationSettings({ org }: { org: Organization }) {
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">WORKSPACE PREFERENCES</div>
        <h1>Organization settings</h1>
        <p>Organization details, people, and document retention.</p>
      </div>
      <Notice>
        Read-only demo settings. Nothing on this screen saves changes to a real backend.
      </Notice>
      <div className="settings-grid">
        <section className="card settings-card">
          <h2>Organization</h2>
          <dl className="review-list">
            <dt>Name</dt>
            <dd>{org.name}</dd>
            <dt>Tenant context</dt>
            <dd>{org.id}</dd>
          </dl>
          <h3>Assigned fax numbers</h3>
          {org.numbers.map((number) => (
            <div className="assigned-number" key={number}>
              <span>{number}</span>
              <span className="small-label">DEMO ASSIGNMENT</span>
            </div>
          ))}
        </section>
        <section className="card settings-card">
          <h2>Document retention</h2>
          <div className="retention-number">
            {org.retentionDays}
            <span>days</span>
          </div>
          <p>Illustrative retention policy for this fictional organization.</p>
          <p className="muted">
            Demo documents are never persisted. Actual expiry, deletion, and download access will be
            enforced by the future backend.
          </p>
        </section>
        <section className="card settings-card users-card">
          <h2>
            Users & roles <span className="small-label">READ ONLY</span>
          </h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {org.users.map((user) => (
                  <tr key={user.email}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Roles are illustrative. Server-side authorization is required for the live application.
          </p>
        </section>
      </div>
    </>
  );
}
