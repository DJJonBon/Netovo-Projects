export type FaxStatus = 'queued' | 'sending' | 'delivered' | 'failed' | 'received';
export type NotificationState = 'pending' | 'simulated-sent' | 'not-applicable';
export interface FaxEvent {
  at: string;
  title: string;
  detail: string;
}
export interface FaxJob {
  id: string;
  providerFaxId: string | null;
  tenantId: string;
  direction: 'outbound' | 'inbound';
  sendingNumber: string;
  destination: string;
  filename: string;
  size: number;
  status: FaxStatus;
  createdAt: string;
  updatedAt: string;
  submittedBy: string;
  notificationState: NotificationState;
  events: FaxEvent[];
  failureReason?: string;
  documentExpiresAt: string;
}
export interface Organization {
  id: string;
  name: string;
  initials: string;
  numbers: string[];
  retentionDays: number;
  users: { name: string; email: string; role: string }[];
}
export interface FaxQuery {
  search: string;
  status: FaxStatus | '';
  from: string;
  to: string;
  page: number;
  pageSize: number;
  direction?: 'inbound';
}
export interface FaxPage {
  items: FaxJob[];
  total: number;
}
export interface SendFaxInput {
  sendingNumber: string;
  destination: string;
  document: File;
}
/** Backend tenant context is informational; authorization MUST be enforced by the server. */
export interface FaxService {
  getContext(): Promise<Organization>;
  listJobs(query: FaxQuery): Promise<FaxPage>;
  getJob(id: string): Promise<FaxJob>;
  submitFax(input: SendFaxInput): Promise<FaxJob>;
}
export const isInternationalNumber = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export async function validatePdf(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.pdf'))
    return 'Choose a PDF file. Other formats are not supported yet.';
  if (file.size === 0 || file.size > MAX_PDF_BYTES) return 'Choose a nonempty PDF of up to 20 MB.';
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  return header === '%PDF-' ? null : 'This file does not appear to be a PDF.';
}
