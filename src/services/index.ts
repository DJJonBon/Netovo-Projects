import { demoOrganizations, MockFaxService } from './mock';
import type { FaxService } from '../domain';
const services = new Map(demoOrganizations.map((org) => [org.id, new MockFaxService(org)]));
// INTEGRATION POINT: replace this factory with an authenticated Azure API adapter.
// The future adapter must derive organization scope from server-validated identity.
export function getDemoService(id: string): FaxService {
  const service = services.get(id);
  if (!service) throw new Error('Unknown demo organization');
  return service;
}
export function simulateListError(id: string) {
  const service = services.get(id);
  if (service) service.failNext = true;
}
