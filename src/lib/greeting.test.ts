import { expect, it } from "vitest";
import { greetingFor } from "./greeting";

it("saudação segue o horário local", () => {
  expect(greetingFor(8)).toBe("morning");
  expect(greetingFor(12)).toBe("afternoon");
  expect(greetingFor(18)).toBe("evening");
  expect(greetingFor(2)).toBe("evening");
});
