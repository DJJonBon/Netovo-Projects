import {
  type FaxJob,
  type FaxService,
  type FaxQuery,
  type Organization,
  type SendFaxInput,
  isInternationalNumber,
  validatePdf,
} from '../domain';
export const demoOrganizations: Organization[] = [
  {
    id: 'demo-northstar',
    name: 'Northstar Design Co.',
    initials: 'ND',
    numbers: ['+12025550141', '+12025550142'],
    retentionDays: 7,
    users: [
      { name: 'Alex Morgan', email: 'alex@northstar.example', role: 'Administrator' },
      { name: 'Jordan Lee', email: 'jordan@northstar.example', role: 'Member' },
    ],
  },
  {
    id: 'demo-cedar',
    name: 'Cedar & Pine Studio',
    initials: 'CP',
    numbers: ['+13125550168'],
    retentionDays: 3,
    users: [{ name: 'Sam Rivera', email: 'sam@cedarpine.example', role: 'Administrator' }],
  },
];
const clone = <T>(value: T): T => structuredClone(value);
const pause = () => new Promise((resolve) => setTimeout(resolve, 280));
function seed(org: Organization): FaxJob[] {
  return Array.from({ length: org.id === 'demo-northstar' ? 18 : 5 }, (_, i) => {
    const createdAt = new Date(Date.now() - (i * 19 + 2) * 3600000).toISOString();
    const status = i % 4 === 1 ? 'received' : i % 5 === 2 ? 'failed' : 'delivered';
    const sendingNumber =
      status === 'received' ? '+12025550196' : org.numbers[i % org.numbers.length];
    return {
      id: `${org.id}-job-${i + 1}`,
      providerFaxId: `synthetic-provider-${i + 1}`,
      tenantId: org.id,
      direction: status === 'received' ? 'inbound' : 'outbound',
      sendingNumber,
      destination: status === 'received' ? org.numbers[0] : '+12025550187',
      filename: [
        'Service agreement.pdf',
        'Project brief.pdf',
        'Signed proposal.pdf',
        'Purchase order.pdf',
      ][i % 4],
      size: 184320 + i * 1024,
      status,
      createdAt,
      updatedAt: createdAt,
      submittedBy: status === 'received' ? 'External sender (synthetic)' : org.users[0].name,
      notificationState: status === 'received' ? 'not-applicable' : 'simulated-sent',
      failureReason:
        status === 'failed'
          ? 'Recipient line busy. This is a synthetic failure; no fax was transmitted.'
          : undefined,
      documentExpiresAt: new Date(
        Date.parse(createdAt) + org.retentionDays * 86400000,
      ).toISOString(),
      events: [
        {
          at: createdAt,
          title: status === 'received' ? 'Synthetic inbound record' : 'Demo submission',
          detail: 'Fictional record for previewing the portal.',
        },
        {
          at: createdAt,
          title:
            status === 'failed'
              ? 'Delivery failed (simulated)'
              : status === 'received'
                ? 'Received (synthetic)'
                : 'Delivered (simulated)',
          detail: 'No provider or backend was contacted.',
        },
      ],
    };
  });
}
/** In-memory partitioning is a demo convenience, never a security boundary. */
export class MockFaxService implements FaxService {
  private jobs: FaxJob[];
  private simulated = new Map<string, number>();
  failNext = false;
  constructor(
    private org: Organization,
    private now = () => Date.now(),
    private latency = pause,
  ) {
    this.jobs = seed(org);
  }
  async getContext() {
    await this.latency();
    return clone(this.org);
  }
  private advance() {
    for (const job of this.jobs) {
      const start = this.simulated.get(job.id);
      if (start === undefined) continue;
      const elapsed = this.now() - start;
      for (const [threshold, status, title] of [
        [2000, 'sending', 'Sending (simulated)'],
        [6000, 'delivered', 'Delivered (simulated)'],
      ] as const) {
        if (elapsed >= threshold && !job.events.some((event) => event.title === title)) {
          job.status = status;
          job.updatedAt = new Date(start + threshold).toISOString();
          job.events.push({
            at: job.updatedAt,
            title,
            detail: 'Demo status change only. No fax was sent.',
          });
          if (status === 'delivered') job.notificationState = 'simulated-sent';
        }
      }
    }
  }
  async listJobs(query: FaxQuery) {
    const shouldFail = this.failNext;
    this.failNext = false;
    await this.latency();
    if (shouldFail)
      throw new Error('Simulated connection error. Try again to reload demo records.');
    this.advance();
    const filtered = this.jobs.filter(
      (job) =>
        (!query.direction || job.direction === query.direction) &&
        (!query.status || job.status === query.status) &&
        (!query.from || job.createdAt.slice(0, 10) >= query.from) &&
        (!query.to || job.createdAt.slice(0, 10) <= query.to) &&
        [job.filename, job.sendingNumber, job.destination, job.submittedBy, job.id]
          .join(' ')
          .toLowerCase()
          .includes(query.search.toLowerCase()),
    );
    return clone({
      items: filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total: filtered.length,
    });
  }
  async getJob(id: string) {
    await this.latency();
    this.advance();
    const job = this.jobs.find((j) => j.id === id);
    if (!job) throw new Error('Fax not found in this demo organization.');
    return clone(job);
  }
  async submitFax(input: SendFaxInput) {
    await this.latency();
    if (
      !this.org.numbers.includes(input.sendingNumber) ||
      !isInternationalNumber(input.destination)
    )
      throw new Error('Check the sending and destination numbers.');
    const error = await validatePdf(input.document);
    if (error) throw new Error(error);
    const start = this.now();
    const at = new Date(start).toISOString();
    const job: FaxJob = {
      id: `demo-${crypto.randomUUID()}`,
      providerFaxId: null,
      tenantId: this.org.id,
      direction: 'outbound',
      sendingNumber: input.sendingNumber,
      destination: input.destination,
      filename: input.document.name,
      size: input.document.size,
      status: 'queued',
      createdAt: at,
      updatedAt: at,
      submittedBy: this.org.users[0].name,
      notificationState: 'pending',
      events: [
        {
          at,
          title: 'Queued (simulated)',
          detail: 'Only document metadata was added to in-memory demo history.',
        },
      ],
      documentExpiresAt: new Date(start + this.org.retentionDays * 86400000).toISOString(),
    };
    this.jobs.unshift(job);
    this.simulated.set(job.id, start);
    return clone(job);
  }
}
