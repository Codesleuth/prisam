import type {
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
} from "@prisma/driver-adapter-utils";
import { setTimeout as sleep } from "node:timers/promises";

type Logger = {
  log: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
};

const NoOpLogger: Logger = Object.freeze({
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
});

type PrismaClientBasic = {
  $executeRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<any>;
  $disconnect: () => Promise<void>;
};

type PrismaClientBuilder<T extends PrismaClientBasic> = (
  adapter: SqlDriverAdapterFactory,
  log: Logger
) => T;
type SqlDriverAdapterBuilder = (log: Logger) => SqlDriverAdapterFactory;

export class PrismaPool<T extends PrismaClientBasic> {
  #clientBuilder: PrismaClientBuilder<T>;
  #adapterBuilder: SqlDriverAdapterBuilder;

  #adapter: SqlDriverAdapterFactory | undefined;
  #client: T | undefined;

  #poolGetterPromise: Promise<T> | undefined;

  constructor(
    clientBuilder: PrismaClientBuilder<T>,
    adapterBuilder: SqlDriverAdapterBuilder
  ) {
    this.#clientBuilder = clientBuilder;
    this.#adapterBuilder = adapterBuilder;
  }

  async #getPoolInternal(log?: Logger): Promise<T> {
    let attempts = 0;
    let driverAdapter: SqlDriverAdapter | undefined;

    while (attempts < 10) {
      try {
        log?.debug("PRISAM: Creating adapter");
        this.#adapter = this.#adapterBuilder(log ?? NoOpLogger);

        driverAdapter = await this.#adapter.connect();

        log?.debug("PRISAM: Executing test query");
        await driverAdapter.executeRaw({
          sql: "SELECT 1",
          args: [],
          argTypes: [],
        });
        await driverAdapter.dispose();
        driverAdapter = undefined;

        log?.debug("PRISAM: Creating Prisma client with adapter");
        this.#client = this.#clientBuilder(this.#adapter, log ?? NoOpLogger);

        log?.debug("PRISAM: Executing test query on Prisma client");
        await this.#client.$executeRaw`SELECT 1`;

        log?.debug("PRISAM: Test query executed successfully");
        return this.#client;
      } catch (error) {
        try {
          await driverAdapter?.dispose();
          await this.#client?.$disconnect();
        } catch (disconnectError) {
          log?.error(
            "PRISAM: Failed to disconnect Prisma client",
            disconnectError
          );
        }
        this.#client = undefined;
        attempts++;
        log?.error(
          `PRISAM: Failed to connect to Prisma client (attempt ${attempts}), retrying...`,
          error
        );
        await sleep(1000 * attempts ** 2); // Exponential backoff
      }
    }

    throw new Error(
      "PRISAM: Failed to connect to Prisma client after multiple attempts"
    );
  }

  public async getPool(log?: Logger): Promise<T> {
    if (!this.#poolGetterPromise) {
      this.#poolGetterPromise = this.#getPoolInternal(log);
      return this.#poolGetterPromise;
    } else {
      return this.#poolGetterPromise.then((pool) => {
        log?.debug("PRISAM: Returning existing Prisma pool");
        return pool;
      });
    }
  }

  public async dispose(log?: Logger): Promise<void> {
    if (this.#client) {
      await this.#client?.$disconnect().catch((error) => {
        log?.error("Failed to disconnect client:", error);
      });
    }

    this.#adapter = undefined;
    this.#client = undefined;
  }
}
