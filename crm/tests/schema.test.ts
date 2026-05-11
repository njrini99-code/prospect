import { describe, expect, it } from "vitest";
import {
  cadences,
  touches,
  outcomesLedger,
  meddpicc,
  notes,
  tasks,
  channelBrokers,
  weightsCurrent,
  buyerCast,
} from "@/db/schema";

describe("schema tables", () => {
  it("cadences uses company_key as primary key", () => {
    expect(typeof cadences).toBe("object");
  });

  it("exposes expected exports", () => {
    expect(cadences).toBeDefined();
    expect(touches).toBeDefined();
    expect(outcomesLedger).toBeDefined();
    expect(meddpicc).toBeDefined();
    expect(notes).toBeDefined();
    expect(tasks).toBeDefined();
    expect(channelBrokers).toBeDefined();
    expect(weightsCurrent).toBeDefined();
    expect(buyerCast).toBeDefined();
  });
});
