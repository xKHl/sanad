import { HOLDOUT_CASES } from '@/data/cases/holdout';
import { runSafetyChecks } from '@/lib/safety';
for (const [name, ids] of [['set1', /^H(0\d|1\d|20)$/], ['set2', /^H(2[1-9]|3\d|40)$/]] as const) {
  let exp = 0, hit = 0, fp = 0, n2 = 0, n = 0, benign = 0, benignOk = 0;
  for (const c of HOLDOUT_CASES.filter((c) => ids.test(c.id))) {
    n++;
    const f = runSafetyChecks(c.scenario);
    const fired = new Set(f.ruleFlags.map((r) => r.ruleId));
    exp += c.expectedFlags.length;
    hit += c.expectedFlags.filter((x) => fired.has(x)).length;
    fp += [...fired].filter((x) => !c.expectedFlags.includes(x)).length;
    if (c.expectedFlags.length === 0) { benign++; if (fired.size === 0) benignOk++; }
    const e = c.expectedNews2; const g = f.news2;
    const ok = e === null || (e.status === g.status && (e.total ?? null) === (g.total ?? null) && (e.band ?? null) === (g.band ?? null));
    if (ok) n2++;
  }
  console.log(name, { cases: n, sens: `${hit}/${exp}`, fp, noFlagCases: `${benignOk}/${benign}`, news2: `${n2}/${n}` });
}
