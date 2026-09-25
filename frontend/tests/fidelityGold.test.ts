import {runFidelityGoldCases} from "../src/components/DocUtil/pptEval";

describe("fidelity gold cases", () => {
  test("runFidelityGoldCases all pass", () => {
    const {ok, results} = runFidelityGoldCases();
    const failed = results.filter((r) => !r.ok).map((r) => r.detail);
    expect(failed).toEqual([]);
    expect(ok).toBe(true);
  });
});
