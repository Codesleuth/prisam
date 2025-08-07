import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";
import debug from "debug";
import { setTimeout as sleep } from "node:timers/promises";

const log = debug("prisam");

export type PrismaClientBasic = {
  $executeRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<any>;
  $disconnect: () => Promise<void>;
};

/**
 * A builder function type for creating a Prisma client.
 */
export type PrismaClientBuilder<T extends PrismaClientBasic> = (
  adapter: SqlDriverAdapterFactory
) => T;

/**
 * A builder function type for creating an SqlDriverAdapterFactory.
 */
export type SqlDriverAdapterBuilder = () => SqlDriverAdapterFactory;

/**
 * A pool for managing Prisma clients with automatic reconnection and error handling.
 * It creates a new Prisma client when needed and ensures that the connection is healthy.
 */
export class PrismaPool<T extends PrismaClientBasic = PrismaClientBasic> {
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

  async #getPoolInternal(): Promise<T> {
    let attempts = 0;

    while (attempts < 10) {
      try {
        log("Creating adapter");
        this.#adapter = this.#adapterBuilder();

        const driverAdapter = await this.#adapter.connect();

        log("Executing test query on driver adapter");
        try {
          await driverAdapter.executeRaw({
            sql: "SELECT 1",
            args: [],
            argTypes: [],
          });
        } finally {
          log("Disposing of driver adapter after test query");
          await driverAdapter.dispose();
        }

        log("Creating Prisma client with adapter");
        this.#client = this.#clientBuilder(this.#adapter);

        log("Executing test query on Prisma client");
        await this.#client.$executeRaw`SELECT 1`;

        log("Test query executed successfully");
        return this.#client;
      } catch (error) {
        try {
          log("Disposing of Prisma client due to error");
          await this.#client?.$disconnect();
        } catch (disconnectError) {
          log("Failed to disconnect Prisma client", disconnectError);
        }
        this.#client = undefined;
        attempts++;
        log(
          `Failed to connect to Prisma client (attempt ${attempts}), retrying...`,
          error
        );
        await sleep(1000 * attempts ** 2); // Exponential backoff
      }
    }

    throw new Error(
      "Failed to connect to Prisma client after multiple attempts"
    );
  }

  /**
   * Gets the Prisma client pool.
   * @returns A promise that resolves to the Prisma client pool.
   * If the pool is already created, it returns the existing pool.
   * If the pool is not created yet, it creates a new one and returns it.
   * This method ensures that the pool is created only once and reused for subsequent calls.
   */
  public async getPool(): Promise<T> {
    if (!this.#poolGetterPromise) {
      this.#poolGetterPromise = this.#getPoolInternal();
      return this.#poolGetterPromise;
    } else {
      return this.#poolGetterPromise.then((pool) => {
        log("Returning existing Prisma pool");
        return pool;
      });
    }
  }

  /**
   * Disposes of the Prisma client and adapter.
   */
  public async dispose(): Promise<void> {
    if (this.#client) {
      await this.#client?.$disconnect().catch((error) => {
        log("Failed to disconnect client:", error);
      });
    }

    this.#adapter = undefined;
    this.#client = undefined;
  }
}
