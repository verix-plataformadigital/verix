import { describe, expect, it } from "vitest";
import { ImtSequence } from "../../src/modules/imt/imt-sequence";

describe("IMT request sequencing", () => {
  it("atribui sequências crescentes", () => {
    const sequence = new ImtSequence();
    expect(sequence.next()).toBe(1);
    expect(sequence.next()).toBe(2);
    expect(sequence.value).toBe(2);
  });

  it("marca apenas a consulta mais recente como atual", () => {
    const sequence = new ImtSequence();
    const first = sequence.next();
    const second = sequence.next();

    expect(sequence.isCurrent(first)).toBe(false);
    expect(sequence.isCurrent(second)).toBe(true);
  });

  it("não aceita sequência inválida", () => {
    const sequence = new ImtSequence();
    sequence.next();
    expect(sequence.isCurrent(0)).toBe(false);
  });
});
