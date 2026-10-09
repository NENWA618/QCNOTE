import type { UGCService } from './ugc-service';

// Set once at startup (see startServer in index.ts), after Redis/Postgres are connected.
let ugcService: UGCService | undefined;

export function setUgcService(service: UGCService): void {
  ugcService = service;
}

export function getUgcService(): UGCService {
  if (!ugcService) {
    throw new Error('UGCService has not been initialized');
  }
  return ugcService;
}
