import { describe, expect, it } from 'vitest';
import { MockFaxService, demoOrganizations } from './mock';
import { isInternationalNumber, validatePdf, type FaxQuery } from '../domain';

const query: FaxQuery = { search: '', status: '', from: '', to: '', page: 1, pageSize: 100 };
const pdf = () => new File(['%PDF-1.4\nDemo document'], 'demo.pdf', { type: 'application/pdf' });
const immediate = async () => {};
describe('simulated fax workflow', () => {
  it('submits metadata, transitions queued → sending → delivered, and exposes a timeline in history', async () => {
    let now = Date.now();
    const service = new MockFaxService(demoOrganizations[0], () => now, immediate);
    const job = await service.submitFax({
      sendingNumber: demoOrganizations[0].numbers[0],
      destination: '+12025550187',
      document: pdf(),
    });
    expect(job.status).toBe('queued');
    expect(job.providerFaxId).toBeNull();
    expect((await service.listJobs({ ...query, search: job.id })).items[0].filename).toBe(
      'demo.pdf',
    );
    now += 2001;
    expect((await service.getJob(job.id)).status).toBe('sending');
    now += 4000;
    const delivered = await service.getJob(job.id);
    expect(delivered.status).toBe('delivered');
    expect(delivered.notificationState).toBe('simulated-sent');
    expect(delivered.events).toHaveLength(3);
    expect(delivered).not.toHaveProperty('document');
  });
  it('isolates organizations and rejects invalid assigned numbers', async () => {
    const north = new MockFaxService(demoOrganizations[0], Date.now, immediate);
    const cedar = new MockFaxService(demoOrganizations[1], Date.now, immediate);
    const job = await north.submitFax({
      sendingNumber: demoOrganizations[0].numbers[0],
      destination: '+12025550187',
      document: pdf(),
    });
    await expect(cedar.getJob(job.id)).rejects.toThrow('not found');
    expect(
      (await cedar.listJobs(query)).items.every((j) => j.tenantId === demoOrganizations[1].id),
    ).toBe(true);
    await expect(
      cedar.submitFax({
        sendingNumber: demoOrganizations[0].numbers[0],
        destination: '+12025550187',
        document: pdf(),
      }),
    ).rejects.toThrow();
  });
  it('supports filters, pagination, empty results, and recoverable errors', async () => {
    const service = new MockFaxService(demoOrganizations[0], Date.now, immediate);
    const page1 = await service.listJobs({ ...query, pageSize: 3 });
    const page2 = await service.listJobs({ ...query, pageSize: 3, page: 2 });
    expect(page1.items).toHaveLength(3);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
    expect(
      (await service.listJobs({ ...query, status: 'failed' })).items.every((j) => j.failureReason),
    ).toBe(true);
    expect(
      (await service.listJobs({ ...query, direction: 'inbound' })).items.every(
        (j) => j.direction === 'inbound',
      ),
    ).toBe(true);
    expect((await service.listJobs({ ...query, search: 'does-not-exist' })).total).toBe(0);
    expect((await service.listJobs({ ...query, from: '2099-01-01' })).total).toBe(0);
    service.failNext = true;
    await expect(service.listJobs(query)).rejects.toThrow('Simulated connection error');
    expect((await service.listJobs(query)).total).toBeGreaterThan(0);
  });
  it('validates E.164-like numbers and rejects invalid PDF inputs', async () => {
    expect(isInternationalNumber('+12025550187')).toBe(true);
    for (const value of ['2025550187', '+012345678', '+1 2025550187', '+123', '+1234567890123456'])
      expect(isInternationalNumber(value)).toBe(false);
    expect(await validatePdf(pdf())).toBeNull();
    expect(await validatePdf(new File(['hello'], 'fake.pdf'))).toContain('does not appear');
    expect(await validatePdf(new File(['%PDF-1.4'], 'document.docx'))).toContain('not supported');
    expect(await validatePdf(new File([], 'empty.pdf'))).toContain('nonempty');
    expect(
      await validatePdf(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.pdf')),
    ).toContain('20 MB');
  });
});
