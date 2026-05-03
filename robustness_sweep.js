// ═══════════════════════════════════════════════════════════════
// A9 — ROBUSTNESS SWEEP (v2-consistent via parameterized child runs)
// Strategy: write parameterized variants of simulator_v2.js to disk,
// run each as child process. Guarantees identical simulation engine
// for headline numbers and sweep numbers.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const { execSync } = require('child_process');

const baseCode = fs.readFileSync('simulator_v2.js', 'utf8');

const variations = [0.6, 0.8, 1.0, 1.2, 1.4];
const scenarios = ['S1', 'S3', 'S4', 'S6'];

console.log("═══════════════════════════════════════════════════════════════");
console.log("A9 ROBUSTNESS SWEEP (v2-consistent)");
console.log("═══════════════════════════════════════════════════════════════\n");

function runVariant(kappaScale, sigmaScale) {
  let code = baseCode;
  
  const newKappaHousing = (5.0 * kappaScale).toFixed(4);
  code = code.replace(
    /const KAPPA = \{[\s\S]*?housing:\s*5\.0/,
    `const KAPPA = {\n  housing: ${newKappaHousing}`
  );
  
  const newSigma = (0.18 * sigmaScale).toFixed(4);
  code = code.replace(
    /const SIGMA_LEAK_0 = 0\.18;/,
    `const SIGMA_LEAK_0 = ${newSigma};`
  );
  
  // Replace main execution block to only output what we need
  const summaryCode = `
const sweep_results = {};
for (const scenario of ${JSON.stringify(scenarios)}) {
  const r = runMonteCarlo(scenario, 'B0_sscb', 1000);
  sweep_results[scenario] = r.any_failure;
}
process.stdout.write('SWEEP_RESULT:' + JSON.stringify(sweep_results) + '\\n');
`;
  
  // Replace from "const scenarios" line to end of file (the main execution block)
  code = code.replace(/\/\/ ───+\n\/\/ EXECUÇÃO PRINCIPAL[\s\S]*$/, summaryCode);
  
  fs.writeFileSync('/tmp/sweep_variant.js', code);
  const output = execSync('node /tmp/sweep_variant.js 2>/dev/null', { encoding: 'utf8' });
  const match = output.match(/SWEEP_RESULT:(.+)/);
  if (!match) throw new Error('No SWEEP_RESULT');
  return JSON.parse(match[1]);
}

const results = {};

console.log("\n>>> Varying κ_housing (σ_leak_0 at central 0.18) <<<\n");
console.log("κ_h scale | S1     | S3     | S4     | S6");
console.log("──────────┼────────┼────────┼────────┼────────");
for (const k_scale of variations) {
  const r = runVariant(k_scale, 1.0);
  results[`kappa_${k_scale}`] = r;
  let row = `× ${k_scale.toFixed(1)}     |`;
  for (const s of scenarios) {
    row += ` ${r[s].toFixed(1).padStart(5)}% |`;
  }
  console.log(row);
}

console.log("\n>>> Varying σ_leak,0 (κ_housing at central 5.0) <<<\n");
console.log("σ_leak,0   | S1     | S3     | S4     | S6");
console.log("───────────┼────────┼────────┼────────┼────────");
for (const s_scale of variations) {
  const r = runVariant(1.0, s_scale);
  results[`sigma_${s_scale}`] = r;
  const sigma_val = (0.18 * s_scale).toFixed(2);
  let row = `× ${s_scale.toFixed(1)}=${sigma_val} |`;
  for (const s of scenarios) {
    row += ` ${r[s].toFixed(1).padStart(5)}% |`;
  }
  console.log(row);
}

fs.writeFileSync('robustness_sweep_results.json', JSON.stringify(results, null, 2));
console.log("\nResults saved to robustness_sweep_results.json");

console.log("\n═══ Consistency check ═══");
console.log(`κ_housing × 1.0, S4: ${results['kappa_1'].S4}% (should match Table 16 ~14.3%)`);
console.log(`κ_housing × 1.0, S6: ${results['kappa_1'].S6}% (should match Table 16 ~18.2%)`);
