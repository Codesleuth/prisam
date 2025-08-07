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

    const poolPromise1 = prismaPool.getPool();
    const poolPromise2 = prismaPool.getPool();

    const pool = await poolPromise1;
    const pool2 = await poolPromise2;

    expect(pool).toBe(pool2);

    expect(pool).toBe(mockClient);
    expect(mockClientBuilder).toHaveBeenCalledTimes(1);
    expect(mockAdapterBuilder).toHaveBeenCalledTimes(1);
    expect(mockClient.$disconnect).not.toHaveBeenCalled();

    await prismaPool.dispose();

    expect(mockClient.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("should retry connection attempts up to 10 times", async () => {
    const error = new Error("Some error");

    const mockClient = {
      $executeRaw: vi.fn().mockRejectedValue(error),
      $disconnect: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined),
    };
    const mockClientBuilder = vi.fn().mockReturnValue(mockClient);

    const mockSqlDriverAdapter = {
      executeRaw: vi.fn().mockRejectedValueOnce(error).mockResolvedValue([]),
      dispose: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined),
    } as Partial<SqlDriverAdapter> as SqlDriverAdapter;

    const mockSqlDriverAdapterFactory = {
      connect: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockSqlDriverAdapter),
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

    await expect(prismaPool.getPool()).rejects.toThrow(
      "Failed to connect to Prisma client after multiple attempts"
    );

    expect(mockAdapterBuilder).toHaveBeenCalledTimes(20);
    expect(setTimeout).toHaveBeenCalledTimes(20);
  });
});
