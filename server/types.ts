import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface ExtendedFastifyInstance extends FastifyInstance {
  __routesRegistered?: boolean;
}

export type BackendRequest<
  TBody extends object = Record<string, unknown>,
  TParams extends object = Record<string, string>,
  TQuery extends object = Record<string, string | undefined>,
> = FastifyRequest<{
  Params: TParams;
  Querystring: TQuery;
  Body: TBody;
}>;
