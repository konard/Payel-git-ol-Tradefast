import 'reflect-metadata';

import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';

import { TRADEFAST_FACADE, TradefastRepository, TradefastResolver, type TradefastApiFacade } from './graphql/index.js';

@Module({})
class TradefastBackendModule {
  static register(facade: TradefastApiFacade): DynamicModule {
    return {
      module: TradefastBackendModule,
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          sortSchema: true,
          path: '/graphql',
        }),
      ],
      providers: [
        { provide: TRADEFAST_FACADE, useValue: facade },
        TradefastRepository,
        TradefastResolver,
      ],
    };
  }
}

export interface TradefastBackendOptions {
  host?: string;
  port?: number;
}

export interface TradefastBackendHandle {
  url: string;
  close(): Promise<void>;
}

export async function startTradefastBackend(
  facade: TradefastApiFacade,
  options: TradefastBackendOptions = {},
): Promise<TradefastBackendHandle> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const app = await NestFactory.create(TradefastBackendModule.register(facade), { logger: false });

  await app.listen(port, host);
  const baseUrl = (await app.getUrl()).replace(/\/$/u, '');
  return {
    url: `${baseUrl}/graphql`,
    close: () => app.close(),
  };
}
