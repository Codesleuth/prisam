import type {
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
} from "@prisma/driver-adapter-utils";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrismaClientBasic, PrismaPool } from ".";

vi.mock("node:timers/promises");
vi.mock("debug", () => {
  // Uncomment to have debug logs in tests
  // const log = console.debug;
  const log = vi.fn();
  const debug = vi.fn(() => log);
  return { default: debug };
});

describe("PrismaPool", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should get the pool if all checks succeed", async () => {
    const mockClient = {
      $executeRaw: vi.fn().mockResolvedValue([]),
      $disconnect: vi.fn().mockRejectedValue(new Error("Disconnect failed")),
    };
    const mockClientBuilder = vi.fn().mockReturnValue(mockClient);

    const mockSqlDriverAdapter = {
      executeRaw: vi.fn().mockResolvedValueOnce([]),
      dispose: vi.fn().mockResolvedValueOnce(undefined),
    } as Partial<SqlDriverAdapter> as SqlDriverAdapter;

    const mockSqlDriverAdapterFactory = {
      connect: vi.fn().mockResolvedValueOnce(mockSqlDriverAdapter),
    } as Partial<SqlDriverAdapterFactory> as SqlDriverAdapterFactory;
    const mockAdapterBuilder = vi
      .fn()
      .mockReturnValue(mockSqlDriverAdapterFactory);

    const prismaPool = new PrismaPool<PrismaClientBasic>(
      mockClientBuilder,
      mockAdapterBuilder
    );

    const pool = await prismaPool.getPool();

    expect(pool).toBe(mockClient);
    expect(mockClientBuilder).toHaveBeenCalledTimes(1);
    expect(mockAdapterBuilder).toHaveBeenCalledTimes(1);
  });

  it("should retry connection attempts up to 10 times when adapter connection fails", async () => {
    const mockClientBuilder = vi.fn();

    const error = new Error("Connection failed");

    const mockSqlDriverAdapterFactory = {
      connect: vi.fn().mockRejectedValueOnce(error),
    } as Partial<SqlDriverAdapterFactory> as SqlDriverAdapterFactory;
    const mockAdapterBuilder = vi
      .fn()
      .mockReturnValue(mockSqlDriverAdapterFactory);

    vi.mocked(setTimeout).mockResolvedValue(undefined);

    const prismaPool = new PrismaPool(mockClientBuilder, mockAdapterBuilder);

    await expect(prismaPool.getPool()).rejects.toThrow(
      "Failed to connect to Prisma client after multiple attempts"
    );

    expect(mockAdapterBuilder).toHaveBeenCalledTimes(10);
    expect(setTimeout).toHaveBeenCalledTimes(10);
  });

  it("should retry connection attempts up to 10 times when adapter executeRaw fails", async () => {
    const mockClientBuilder = vi.fn();

    const error = new Error("ExecuteRaw failed");

    const mockSqlDriverAdapter = {
      executeRaw: vi.fn().mockRejectedValueOnce(error),
      dispose: vi.fn().mockResolvedValueOnce(undefined),
    } as Partial<SqlDriverAdapter> as SqlDriverAdapter;

    const mockSqlDriverAdapterFactory = {
      connect: vi.fn().mockResolvedValueOnce(mockSqlDriverAdapter),
    } as Partial<SqlDriverAdapterFactory> as SqlDriverAdapterFactory;
    const mockAdapterBuilder = vi
      .fn()
      .mockReturnValue(mockSqlDriverAdapterFactory);

    vi.mocked(setTimeout).mockResolvedValue(undefined);

    const prismaPool = new PrismaPool(mockClientBuilder, mockAdapterBuilder);

    await expect(prismaPool.getPool()).rejects.toThrow(
      "Failed to connect to Prisma client after multiple attempts"
    );

    expect(mockAdapterBuilder).toHaveBeenCalledTimes(10);
    expect(setTimeout).toHaveBeenCalledTimes(10);
  });

  it("should retry connection attempts up to 10 times when adapter dispose fails", async () => {
    const mockClientBuilder = vi.fn();

    const error = new Error("ExecuteRaw failed");

    const mockSqlDriverAdapter = {
      executeRaw: vi.fn().mockResolvedValueOnce([]),
      dispose: vi.fn().mockRejectedValueOnce(error),
    } as Partial<SqlDriverAdapter> as SqlDriverAdapter;

    const mockSqlDriverAdapterFactory = {
      connect: vi.fn().mockResolvedValueOnce(mockSqlDriverAdapter),
    } as Partial<SqlDriverAdapterFactory> as SqlDriverAdapterFactory;
    const mockAdapterBuilder = vi
      .fn()
      .mockReturnValue(mockSqlDriverAdapterFactory);

    vi.mocked(setTimeout).mockResolvedValue(undefined);

    const prismaPool = new PrismaPool(mockClientBuilder, mockAdapterBuilder);

    await expect(prismaPool.getPool()).rejects.toThrow(
      "Failed to connect to Prisma client after multiple attempts"
    );

    expect(mockAdapterBuilder).toHaveBeenCalledTimes(10);
    expect(setTimeout).toHaveBeenCalledTimes(10);
  });
});
