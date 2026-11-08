import { describe, expect, it } from "vitest";
import { DatasetRuntime } from "../src/core/data/datasetRuntime";
import type { DatasetDefinition, DatasetSnapshot } from "../src/core/model/types";
import type { HttpRequest } from "../src/core/live/apiSettings";

const staticDataset = (data: unknown, pipeline?: DatasetDefinition["pipeline"]): DatasetDefinition => ({
  id: "static-sales",
  name: "Static sales",
  source: { kind: "static", data },
  ...(pipeline ? { pipeline } : {}),
});

const httpDataset: DatasetDefinition = {
  id: "http-sales",
  name: "HTTP sales",
  source: {
    kind: "http",
    live: {
      url: "",
      path: "/sales",
      intervalSec: 30,
      query: { tenant: "source", keep: "yes" },
      dataPath: "records",
    },
  },
  parameters: { tenant: "dataset", region: "west" },
};

function runtimeOptions(fetchImpl: (request: HttpRequest) => Promise<unknown>) {
  const requests: HttpRequest[] = [];
  return {
    requests,
    options: {
      resolveApi: () => ({ baseUrl: "https://api.example.test", query: { tenant: "global", global: "1" } }),
      fetchImpl: (request: HttpRequest) => {
        requests.push(request);
        return fetchImpl(request);
      },
      setIntervalImpl: () => 1,
      clearIntervalImpl: () => {},
      isHidden: () => false,
      now: () => 1234,
    },
  };
}

describe("DatasetRuntime", () => {
  it("shares one HTTP request between consumers and merges dataset parameters last", async () => {
    const harness = runtimeOptions(async () => ({ records: [{ city: "Berlin", sales: 7 }] }));
    const runtime = new DatasetRuntime([httpDataset], harness.options);
    const first: DatasetSnapshot[] = [];
    const second: DatasetSnapshot[] = [];
    const stopFirst = runtime.subscribe("http-sales", "table", (snapshot) => first.push(snapshot));
    const stopSecond = runtime.subscribe("http-sales", "kpi", (snapshot) => second.push(snapshot));

    await runtime.refresh("http-sales");

    expect(harness.requests).toHaveLength(1);
    const requestUrl = new URL(harness.requests[0].url);
    expect(requestUrl.searchParams.get("tenant")).toBe("dataset");
    expect(requestUrl.searchParams.get("global")).toBe("1");
    expect(requestUrl.searchParams.get("keep")).toBe("yes");
    expect(requestUrl.searchParams.get("region")).toBe("west");
    expect(first.at(-1)).toMatchObject({ status: "success", rows: [{ city: "Berlin", sales: 7 }] });
    expect(second.at(-1)).toEqual(first.at(-1));

    stopFirst();
    stopSecond();
    runtime.dispose();
  });

  it("retains the last successful rows and reports stale after an HTTP failure", async () => {
    let attempts = 0;
    const harness = runtimeOptions(async () => {
      attempts += 1;
      if (attempts === 1) return { records: [{ city: "Frankfurt", sales: 11 }] };
      throw new Error("offline");
    });
    const runtime = new DatasetRuntime([httpDataset], harness.options);
    const received: DatasetSnapshot[] = [];
    const stop = runtime.subscribe("http-sales", "table", (snapshot) => received.push(snapshot));

    await runtime.refresh("http-sales");
    expect(received.at(-1)).toMatchObject({ status: "success", rows: [{ city: "Frankfurt", sales: 11 }] });
    await runtime.refresh("http-sales");

    expect(received.at(-1)).toMatchObject({
      status: "stale",
      error: "offline",
      rows: [{ city: "Frankfurt", sales: 11 }],
    });
    stop();
    runtime.dispose();
  });

  it("emits static rows immediately without making a request", () => {
    const harness = runtimeOptions(async () => {
      throw new Error("static data must not fetch");
    });
    const runtime = new DatasetRuntime([staticDataset([{ city: "Tokyo", sales: 3 }])], harness.options);
    const received: DatasetSnapshot[] = [];
    const stop = runtime.subscribe("static-sales", "table", (snapshot) => received.push(snapshot));

    expect(harness.requests).toHaveLength(0);
    expect(received.at(-1)).toMatchObject({ status: "success", rows: [{ city: "Tokyo", sales: 3 }] });
    stop();
    runtime.dispose();
  });

  it("applies the dataset pipeline before fanning rows out", () => {
    const pipeline: DatasetDefinition["pipeline"] = {
      filter: [{ field: "sales", op: "gte", value: "2" }],
      select: ["city", "sales"],
      sort: { field: "sales" },
      limit: 2,
    };
    const runtime = new DatasetRuntime(
      [staticDataset([
        { city: "Oslo", sales: 1, private: "x" },
        { city: "Paris", sales: 4, private: "y" },
        { city: "Rome", sales: 2, private: "z" },
      ], pipeline)],
      runtimeOptions(async () => []).options
    );
    const first: DatasetSnapshot[] = [];
    const second: DatasetSnapshot[] = [];
    const stopFirst = runtime.subscribe("static-sales", "table", (snapshot) => first.push(snapshot));
    const stopSecond = runtime.subscribe("static-sales", "kpi", (snapshot) => second.push(snapshot));

    expect(first.at(-1)).toMatchObject({
      status: "success",
      rows: [{ city: "Rome", sales: 2 }, { city: "Paris", sales: 4 }],
    });
    expect(second.at(-1)).toEqual(first.at(-1));
    stopFirst();
    stopSecond();
    runtime.dispose();
  });
});
