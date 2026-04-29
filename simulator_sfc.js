// ═══════════════════════════════════════════════════════════════════════════
// SSCB SFC SIMULATOR — Secção 10
// Calibração Portugal 2025, bloco externo, 5 benchmarks, 6 cenários
// Output: probabilidades de critério de falha F1-F7 por cenário × benchmark
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');

// ───────────────────────────────────────────────────────────────
// CONSTANTES ESTRUTURAIS (Portugal 2025, calibração Secção 8.2)
// ───────────────────────────────────────────────────────────────

const N_ADULTS = 8.77;          // milhões adultos 18+
const RMG_YEAR = 14000;         // euros/ano
const GDP_0 = 306.77;           // €B
const M2_0 = 344.67;            // €B
const M1_0 = 186.3;             // €B (depósitos à ordem convertidos SSCB dia 0)
const DEBT_PUB_0 = 275.0;       // €B (89.7% PIB)
const DEBT_HH_0 = 165.0;        // €B (56.5% PIB)
const DEBT_FIRMS_0 = 95.0;      // €B
const RESERVES_0 = 40.0;        // €B (reservas internacionais SSCB)
const SAVINGS_IB_0 = 140.0;     // €B (poupança em IB)

const T_YEAR = N_ADULTS * RMG_YEAR / 1000;  // 122.78 €B/ano
const T_MONTH = T_YEAR / 12;                 // 10.23 €B/mês

// ───────────────────────────────────────────────────────────────
// PARÂMETROS COMPORTAMENTAIS (Tabela 11, valores centrais)
// ───────────────────────────────────────────────────────────────

const KAPPA = {                  // elasticidades sectoriais
  housing: 5.0,
  services: 2.0,
  energy: 1.5,
  food: 1.0,
  tradables: 0.5
};

const WEIGHT = {                 // pesos sectoriais no IHPC
  housing: 0.20,
  services: 0.30,
  energy: 0.10,
  food: 0.15,
  tradables: 0.25
};

const GAMMA_PASS = {             // pass-through cambial por sector
  housing: 0.15,
  services: 0.10,
  energy: 0.85,
  food: 0.45,
  tradables: 0.75
};

const ALPHA_CONS = {             // propensão a consumir por decil
  low: 0.82,   // decis 1-4
  mid: 0.71,   // decis 5-7
  high: 0.58   // decis 8-10
};

// PID controller gains
const K_P = 5.0;
const K_I = 0.5;
const K_D = 2.0;

// Leakage das quotas sectoriais
const SIGMA_LEAK = 0.08;

// Bloco externo
const THETA_FX = 0.15;           // sensibilidade câmbio a fluxos
const SIGMA_SUB = [0.06, 0.8, 0.5, 0.3, 0.2];  // x₀, σ₁, σ₂, σ₃, σ₄
const PI_SPREAD = 0.04;          // spread por ponto debt/GDP
const TAU_REV = 0.34;            // taxa fiscal efectiva (receita/PIB)

// Quotas sectoriais por ano (rigid sectors: housing, services)
const QUOTAS_RIGID = [0.30, 0.50, 0.75, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00];

// ───────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function nrand() {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededNormal(rng) {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ───────────────────────────────────────────────────────────────
// SIMULATOR — um trajectória, 120 meses
// ───────────────────────────────────────────────────────────────

function runTrajectory(scenario, benchmark, seed) {
  const rng = mulberry32(seed);
  
  // Inicialização
  let M = M1_0;                          // stock monetário em circulação
  let pi = 0.02;                          // inflação anualizada corrente
  let pi_expected = 0.02;                 // expectativa inflação
  let alpha = 0.5;                        // regra PID: fracção RMG libertado
  let sum_error = 0;
  let prev_error = 0;
  
  // Bloco externo
  let e_rate = 1.0;                       // taxa de câmbio (1 = paridade inicial)
  let reserves = RESERVES_0;              // reservas internacionais
  let x_sub = 0.06;                       // substituição de carteira
  let confidence = 1.0;                   // confiança institucional
  let shadow_M = 0;                       // moeda em shadow banking
  let spread_bps = 100;                   // spread soberano em bps
  
  // Agentes
  let debt_pub = DEBT_PUB_0;
  let debt_hh = DEBT_HH_0;
  let debt_firms = DEBT_FIRMS_0;
  let savings = SAVINGS_IB_0;
  let unemployment = 0.056;               // 5.6% Portugal 2025
  
  // Shock absorber state
  let absorber_active = 0;                // meses restantes de corte
  let breach_counter = 0;                 // meses consecutivos acima corredor
  
  // Preços sectoriais
  let p_housing_cum = 0;                  // inflação cumulativa sector
  let p_services_cum = 0;
  let p_energy_cum = 0;
  let p_food_cum = 0;
  let p_tradables_cum = 0;
  
  // Tracking variables
  let inflation_trajectory = [];
  let fx_trajectory = [];
  let reserves_trajectory = [];
  let sub_trajectory = [];
  let shadow_trajectory = [];
  let spread_trajectory = [];
  let unemployment_trajectory = [];
  let debt_to_gdp_trajectory = [];
  
  // Cenário parâmetros
  const SCN = {
    'S1': { sigE: 0.04, sigC: 0.01, sigP: 0.01, shockE_perm: 0, conf_init: 1.0, corr: 0.3, ss_base: 0.02 },
    'S2': { sigE: 0.06, sigC: 0.02, sigP: 0.015, shockE_perm: 0, conf_init: 0.9, corr: 0.5, ss_base: 0.04 },
    'S3': { sigE: 0.12, sigC: 0.02, sigP: 0.015, shockE_perm: 0.8, conf_init: 0.85, corr: 0.4, ss_base: 0.05 },
    'S4': { sigE: 0.06, sigC: 0.04, sigP: 0.02, shockE_perm: 0, conf_init: 0.7, corr: 0.5, ss_base: 0.15, fx_shock: 0.25 },
    'S5': { sigE: 0.05, sigC: 0.06, sigP: 0.02, shockE_perm: 0, conf_init: 0.55, corr: 0.5, ss_base: 0.10 },
    'S6': { sigE: 0.14, sigC: 0.07, sigP: 0.03, shockE_perm: 0.8, conf_init: 0.5, corr: 0.8, ss_base: 0.20, fx_shock: 0.20 }
  }[scenario];
  
  // Benchmark configurations
  const B = {
    'B0_sscb': { dualbook: true, quotas: true, absorber: true, external_block: true, rmg: true, narrow: true, mmt: false, fiscal_ubi: false },
    'B1_ubi_fiscal': { dualbook: false, quotas: false, absorber: false, external_block: true, rmg: false, narrow: false, mmt: false, fiscal_ubi: true },
    'B2_narrow_no_rmg': { dualbook: true, quotas: false, absorber: false, external_block: true, rmg: false, narrow: true, mmt: false, fiscal_ubi: false },
    'B3_mmt': { dualbook: false, quotas: false, absorber: true, external_block: true, rmg: false, narrow: false, mmt: true, fiscal_ubi: false },
    'B4_sscb_no_quotas': { dualbook: true, quotas: false, absorber: true, external_block: true, rmg: true, narrow: true, mmt: false, fiscal_ubi: false }
  }[benchmark];
  
  confidence = SCN.conf_init;
  
  // Cenário S4 / S6: FX shock inicial (pre-t=1)
  if (SCN.fx_shock) {
    e_rate = 1.0 + SCN.fx_shock;
  }
  
  let capital_controls_active = B.external_block;  // primeiros 24 meses
  
  // ═══════════════════════════════════════════════════════════════
  // LOOP MENSAL
  // ═══════════════════════════════════════════════════════════════
  
  for (let t = 1; t <= 120; t++) {
    const year = Math.ceil(t / 12);
    
    // Choques estocásticos correlacionados
    const z_common = seededNormal(rng);
    const z_idio = seededNormal(rng);
    const rho = SCN.corr;
    const z_energy = rho * z_common + Math.sqrt(1 - rho * rho) * z_idio;
    const z_conf = seededNormal(rng);
    const z_prod = seededNormal(rng);
    const z_fx = seededNormal(rng);
    
    const ss = Math.sqrt(1/12);
    const e_shock = SCN.sigE * z_energy * ss + (SCN.shockE_perm / 120);
    const c_shock = SCN.sigC * (2 - confidence) * z_conf * ss;
    const p_shock = SCN.sigP * z_prod * ss;
    
    // Controlos de capitais desactivam após mês 24
    if (t > 24) capital_controls_active = false;
    
    // ──────────────────────────────────────────
    // BLOCO EXTERNO
    // ──────────────────────────────────────────
    
    // Taxa de câmbio (UIP modificada + fluxos + prémio risco)
    // Prémio de risco endógeno
    const rho_risk = 0.005 +  // base normal
                    0.3 * Math.max(0, 1 - reserves / RESERVES_0) * 0.5 +
                    0.2 * Math.max(0, pi_expected - 0.02) -
                    0.15 * Math.max(0, confidence - 0.7);
    
    const i_star = 0.03;  // taxa externa
    const i_IB = 0.035 + spread_bps / 10000;
    
    const NKAF_net = (B.external_block && !capital_controls_active) ?
                     5 * (i_IB - i_star - rho_risk) - 15 * Math.abs(e_rate - 1) :
                     0;
    
    // Taxa de câmbio — direção depende do diferencial UIP e fluxos
    // Em baseline (confiança alta, inflação controlada) não deve depreciar
    const uip_term = (i_IB - i_star - rho_risk) / 12;  // se positivo → aprecia
    const fx_change = uip_term +
                     THETA_FX * NKAF_net / 500 +
                     0.015 * z_fx * ss;
    e_rate = Math.max(0.5, Math.min(3.0, e_rate * (1 + fx_change)));
    
    // Probabilidade de sudden stop
    const ss_prob = SCN.ss_base * (1 + Math.max(0, (pi - 0.05)) * 5) *
                    (1 + Math.max(0, 0.5 - confidence)) *
                    (reserves < 0.5 * RESERVES_0 ? 2 : 1);
    const sudden_stop = (rng() < ss_prob / 12);
    
    if (sudden_stop) {
      e_rate *= 1.08;  // depreciação adicional 8%
      confidence *= 0.7;
      reserves *= 0.85;
    }
    
    // Intervenção cambial
    let fx_intervention = 0;
    if (B.external_block && e_rate > 1.10 && reserves > 0.3 * RESERVES_0) {
      fx_intervention = Math.min(reserves * 0.05, 2.0);
      reserves -= fx_intervention;
      e_rate *= (1 - 0.02);  // efeito de intervenção
    }
    
    // Substituição de carteira
    const conf_adj = B.mmt ? confidence * 0.9 : confidence;  // MMT tem menos credibilidade
    const x_target = 0.06 + 0.8 * Math.max(0, pi_expected - 0.02) +
                    0.5 * Math.max(0, i_star - i_IB) -
                    0.3 * conf_adj;
    x_sub = clamp(x_sub + 0.1 * (x_target - x_sub), 0.03, 0.60);
    // Controlos reduzem mas não eliminam substituição
    if (capital_controls_active) x_sub = Math.min(x_sub, 0.15 + 0.1 * Math.max(0, pi_expected - 0.05));
    
    // Inflação de importados (pass-through cambial diferenciado)
    const pi_import = (e_rate - 1) * 0.5;  // cumulativo depreciação * média
    
    // ──────────────────────────────────────────
    // POLÍTICA MONETÁRIA (α PID)
    // ──────────────────────────────────────────
    
    const target = 0.0;  // corredor preferencial ligeira deflação
    const error = pi - target;
    sum_error = clamp(sum_error + error, -0.5, 0.5);
    const delta_error = error - prev_error;
    
    const d_alpha = -K_P * error - K_I * sum_error - K_D * delta_error;
    alpha = clamp(alpha + clamp(d_alpha * 0.03, -0.05, 0.05), 0.05, 0.95);
    prev_error = error;
    
    // Shock absorber distribucional
    if (B.absorber && pi > target + 0.02) breach_counter++;
    else breach_counter = 0;
    
    let absorber_cut = 1.0;
    if (B.absorber) {
      if (absorber_active > 0) {
        absorber_cut = 0.55;  // corte médio 45%
        absorber_active--;
      } else if (breach_counter >= 3) {
        absorber_active = 3;
        absorber_cut = 0.55;
        breach_counter = 0;
      }
    }
    
    // Quotas sectoriais
    const quota_rigid = B.quotas ? QUOTAS_RIGID[year - 1] : 1.0;
    const quota_effect = B.quotas ? quota_rigid + SIGMA_LEAK * (1 - quota_rigid) : 1.0;
    
    // ──────────────────────────────────────────
    // DINÂMICA MONETÁRIA
    // ──────────────────────────────────────────
    
    let dM_gross = 0;
    let dM_burn = 0;
    
    if (B.rmg) {
      // SSCB: RMG com α e absorber
      dM_gross = alpha * absorber_cut * T_MONTH;
    } else if (B.mmt) {
      // MMT: emissão via despesa pública (regra Taylor inversa)
      const fiscal_impulse = Math.max(0, 0.03 - pi);
      dM_gross = fiscal_impulse * GDP_0 / 12;
    } else if (B.fiscal_ubi) {
      // UBI fiscal: sem emissão nova; apenas redistribuição via impostos
      dM_gross = 0;
    } else {
      // Narrow banking sem RMG: sem emissão nova
      dM_gross = 0;
    }
    
    // Burn fiscal
    const current_gdp_nom = GDP_0 * Math.pow(1 + pi, (t - 1) / 12);
    dM_burn = TAU_REV * current_gdp_nom / 12 * 0.3;  // 30% dos impostos vai para burn
    
    M = Math.max(50, M + dM_gross - dM_burn);
    
    // Shadow banking (emerge em stress mesmo com controlos, só mais lento)
    const shadow_growth_rate = confidence < 0.7 ?
      (capital_controls_active ? 0.001 : 0.003) * (1 + Math.max(0, pi_expected - 0.03) * 5) :
      0;
    shadow_M += shadow_growth_rate * M;
    shadow_M = Math.max(0, shadow_M - 0.005 * M);  // natural decay quando tranquilo
    
    // ──────────────────────────────────────────
    // PREÇOS SECTORIAIS (Phillips sectorial)
    // ──────────────────────────────────────────
    
    // demanda base (não contar emissão sem dívida se não SSCB)
    const base_demand = B.rmg ? alpha * quota_effect * 0.08 : 0.02;
    const mmt_pressure = B.mmt ? 0.05 : 0;
    const fiscal_ubi_demand = B.fiscal_ubi ? 0.03 : 0;
    const demand_pressure = base_demand + mmt_pressure + fiscal_ubi_demand - unemployment * 0.3;
    
    // Pressão diferenciada por sector — gaps mais moderados e realistas
    const tech_deflation = -0.01 / 12;  // 1%/ano deflação tecnológica embutida
    const gap_housing = Math.max(-0.01, demand_pressure - 0.005 * year);
    const gap_services = Math.max(-0.01, demand_pressure - 0.01 * year);
    const gap_energy = 0.003;
    const gap_food = 0.004;
    const gap_tradables = -0.003;
    
    // Phillips sectorial mensal (não multiplicar demasiado)
    const pi_h_m = 0.92 * p_housing_cum / 12 + 0.08 *
                   (KAPPA.housing * gap_housing * 0.3 + GAMMA_PASS.housing * pi_import * 0.1 + e_shock * 0.15);
    const pi_s_m = 0.92 * p_services_cum / 12 + 0.08 *
                   (KAPPA.services * gap_services * 0.4 + GAMMA_PASS.services * pi_import * 0.1 + c_shock * 0.2);
    const pi_e_m = 0.85 * p_energy_cum / 12 + 0.15 *
                   (KAPPA.energy * gap_energy + GAMMA_PASS.energy * pi_import * 0.2 + e_shock * 0.8);
    const pi_f_m = 0.88 * p_food_cum / 12 + 0.12 *
                   (KAPPA.food * gap_food + GAMMA_PASS.food * pi_import * 0.15 + e_shock * 0.3);
    const pi_t_m = 0.92 * p_tradables_cum / 12 + 0.08 *
                   (KAPPA.tradables * gap_tradables + GAMMA_PASS.tradables * pi_import * 0.2 - p_shock + tech_deflation);
    
    // Annualize and smooth (bounds mais realistas)
    p_housing_cum = clamp(pi_h_m * 12, -0.05, 0.30);
    p_services_cum = clamp(pi_s_m * 12, -0.05, 0.25);
    p_energy_cum = clamp(pi_e_m * 12, -0.15, 0.60);
    p_food_cum = clamp(pi_f_m * 12, -0.05, 0.25);
    p_tradables_cum = clamp(pi_t_m * 12, -0.08, 0.25);
    
    // Inflação agregada (média ponderada)
    pi = WEIGHT.housing * p_housing_cum +
         WEIGHT.services * p_services_cum +
         WEIGHT.energy * p_energy_cum +
         WEIGHT.food * p_food_cum +
         WEIGHT.tradables * p_tradables_cum;
    
    // Tech deflation agregada
    pi += tech_deflation * 12 * 0.5;
    
    pi = clamp(pi, -0.06, 0.40);
    pi_expected = 0.85 * pi_expected + 0.15 * pi;
    
    // ──────────────────────────────────────────
    // CONFIANÇA E DINÂMICA INSTITUCIONAL
    // ──────────────────────────────────────────
    
    if (pi > 0.08) confidence = clamp(confidence - 0.02, 0.2, 1.0);
    else if (pi < -0.04) confidence = clamp(confidence - 0.015, 0.2, 1.0);
    else if (Math.abs(pi) < 0.03) confidence = clamp(confidence + 0.005, 0.2, 1.0);
    
    // Unemployment dynamics (Okun-like)
    const output_gap = (pi - 0.02) * 0.3;
    unemployment = clamp(unemployment + 0.2 * (output_gap - (pi > 0.05 ? 0.02 : 0)) * 0.05 +
                         (B.absorber && absorber_active > 0 ? 0.003 : 0) -
                         (B.rmg ? 0.001 : 0), 0.03, 0.25);
    
    // Spread soberano
    const debt_gdp_ratio = (debt_pub + Math.max(0, -40)) / current_gdp_nom * 100;
    spread_bps = 50 + PI_SPREAD * 100 * (debt_gdp_ratio - 60) + 50 * rho_risk +
                 200 * Math.max(0, 1 - confidence);
    spread_bps = clamp(spread_bps, 20, 2000);
    
    // Amortização dívida legacy
    debt_pub = Math.max(0, debt_pub * (1 - 1/(9.2 * 12)) + spread_bps / 10000 * debt_pub / 12);
    
    // ──────────────────────────────────────────
    // TRACKING
    // ──────────────────────────────────────────
    
    inflation_trajectory.push(pi);
    fx_trajectory.push(e_rate);
    reserves_trajectory.push(reserves);
    sub_trajectory.push(x_sub);
    shadow_trajectory.push(shadow_M / M);
    spread_trajectory.push(spread_bps);
    unemployment_trajectory.push(unemployment);
    debt_to_gdp_trajectory.push(debt_gdp_ratio);
  }
  
  return {
    inflation: inflation_trajectory,
    fx: fx_trajectory,
    reserves: reserves_trajectory,
    sub: sub_trajectory,
    shadow: shadow_trajectory,
    spread: spread_trajectory,
    unemployment: unemployment_trajectory,
    debt_to_gdp: debt_to_gdp_trajectory,
    final_confidence: confidence,
    final_M: M
  };
}

// ───────────────────────────────────────────────────────────────
// CRITÉRIOS DE FALHA F1-F7 (Tabela 13)
// ───────────────────────────────────────────────────────────────

function evaluateFailures(traj, unemployment_baseline) {
  const failures = {
    F1: false,  // π > 10% durante ≥12 meses
    F2: false,  // Δe > 40% cumulativo em 12 meses
    F3: false,  // R^FX < 0.3 × R^target durante ≥6 meses
    F4: false,  // x_sub > 35% durante ≥6 meses
    F5: false,  // shadow > 15% do M2
    F6: false,  // spread > 600bp durante ≥12 meses
    F7: false   // desemprego > contrafactual + 5pp durante ≥24 meses
  };
  
  // F1: inflação persistente
  let infl_high = 0;
  for (const pi of traj.inflation) {
    if (pi > 0.10) {
      infl_high++;
      if (infl_high >= 12) failures.F1 = true;
    } else infl_high = 0;
  }
  
  // F2: depreciação primeiros 12 meses
  const fx_12 = traj.fx[11] || 1.0;
  const fx_0 = traj.fx[0] || 1.0;
  if ((fx_12 - fx_0) / fx_0 > 0.40) failures.F2 = true;
  
  // F3: reservas baixas
  let low_res = 0;
  for (const r of traj.reserves) {
    if (r < 0.3 * RESERVES_0) {
      low_res++;
      if (low_res >= 6) failures.F3 = true;
    } else low_res = 0;
  }
  
  // F4: substituição crítica
  let high_sub = 0;
  for (const s of traj.sub) {
    if (s > 0.35) {
      high_sub++;
      if (high_sub >= 6) failures.F4 = true;
    } else high_sub = 0;
  }
  
  // F5: shadow banking
  for (const sh of traj.shadow) {
    if (sh > 0.15) { failures.F5 = true; break; }
  }
  
  // F6: spreads insustentáveis
  let high_spread = 0;
  for (const sp of traj.spread) {
    if (sp > 600) {
      high_spread++;
      if (high_spread >= 12) failures.F6 = true;
    } else high_spread = 0;
  }
  
  // F7: desemprego degradado
  let high_unemp = 0;
  for (const u of traj.unemployment) {
    if (u > unemployment_baseline + 0.05) {
      high_unemp++;
      if (high_unemp >= 24) failures.F7 = true;
    } else high_unemp = 0;
  }
  
  return failures;
}

// ───────────────────────────────────────────────────────────────
// MONTE CARLO
// ───────────────────────────────────────────────────────────────

function runMonteCarlo(scenario, benchmark, nTrajs = 1000) {
  const results = {
    inflation_final: [],
    inflation_p95_path: [],
    fx_year1: [],
    fx_year3: [],
    reserves_final: [],
    sub_max: [],
    spread_max: [],
    unemployment_year2: [],
    debt_gdp_year5: [],
    failures: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0 },
    any_failure: 0
  };
  
  // Baseline do desemprego do cenário B1 para comparação com F7
  const unemp_baseline = 0.056;
  
  for (let i = 0; i < nTrajs; i++) {
    const seed = i * 7919 + scenario.charCodeAt(1) * 1009 + benchmark.charCodeAt(1) * 997;
    const traj = runTrajectory(scenario, benchmark, seed);
    
    results.inflation_final.push(traj.inflation[119]);
    results.inflation_p95_path.push(percentile(traj.inflation, 0.95));
    results.fx_year1.push((traj.fx[11] - 1) / 1);
    results.fx_year3.push((traj.fx[35] - 1) / 1);
    results.reserves_final.push(traj.reserves[119]);
    results.sub_max.push(Math.max(...traj.sub));
    results.spread_max.push(percentile(traj.spread, 0.90));
    results.unemployment_year2.push(traj.unemployment[23]);
    results.debt_gdp_year5.push(traj.debt_to_gdp[59]);
    
    const f = evaluateFailures(traj, unemp_baseline);
    for (const k of Object.keys(f)) {
      if (f[k]) results.failures[k]++;
    }
    if (Object.values(f).some(v => v)) results.any_failure++;
  }
  
  // Converter para percentagens
  for (const k of Object.keys(results.failures)) {
    results.failures[k] = (results.failures[k] / nTrajs) * 100;
  }
  results.any_failure = (results.any_failure / nTrajs) * 100;
  
  return results;
}

// ───────────────────────────────────────────────────────────────
// EXECUÇÃO PRINCIPAL
// ───────────────────────────────────────────────────────────────

const scenarios = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const benchmarks = ['B0_sscb', 'B1_ubi_fiscal', 'B2_narrow_no_rmg', 'B3_mmt', 'B4_sscb_no_quotas'];
const N_TRAJS = 1000;

console.log('═══════════════════════════════════════════════════════════════');
console.log('SSCB SFC SIMULATOR — Run for Section 10');
console.log(`Scenarios: ${scenarios.length} × Benchmarks: ${benchmarks.length} × Trajectories: ${N_TRAJS}`);
console.log(`Total: ${scenarios.length * benchmarks.length * N_TRAJS} trajectories`);
console.log('═══════════════════════════════════════════════════════════════');

const allResults = {};
const t0 = Date.now();

for (const sc of scenarios) {
  allResults[sc] = {};
  for (const bm of benchmarks) {
    const key = `${sc}_${bm}`;
    process.stdout.write(`Running ${key}... `);
    const tStart = Date.now();
    const r = runMonteCarlo(sc, bm, N_TRAJS);
    const dt = ((Date.now() - tStart) / 1000).toFixed(1);
    allResults[sc][bm] = r;
    const p50 = percentile(r.inflation_final, 0.5);
    const anyFail = r.any_failure.toFixed(1);
    console.log(`done in ${dt}s [π_p50=${(p50*100).toFixed(1)}%, failure=${anyFail}%]`);
  }
}

const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nTotal time: ${totalTime}s`);

// Salvar resultados
fs.writeFileSync('simulation_results.json', JSON.stringify(allResults, null, 2));
console.log('\nResults saved to simulation_results.json (same folder as simulator_sfc.js)');

// ───────────────────────────────────────────────────────────────
// RELATÓRIO — Tabelas para Secção 10
// ───────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('TABELA 15 — Inflação aos 10 anos (P50) por cenário × benchmark');
console.log('═══════════════════════════════════════════════════════════════');
console.log('Cenário  | B0 SSCB    | B1 UBI-F   | B2 Narrow  | B3 MMT     | B4 no-Q');
console.log('─────────┼────────────┼────────────┼────────────┼────────────┼──────────');
for (const sc of scenarios) {
  let row = sc.padEnd(9) + '|';
  for (const bm of benchmarks) {
    const p50 = percentile(allResults[sc][bm].inflation_final, 0.5);
    row += `  ${(p50*100).toFixed(1).padStart(7)}% |`.padEnd(13);
  }
  console.log(row);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('TABELA 16 — Probabilidade de falha (F1-F7 agregada) por cenário × bench');
console.log('═══════════════════════════════════════════════════════════════');
console.log('Cenário  | B0 SSCB    | B1 UBI-F   | B2 Narrow  | B3 MMT     | B4 no-Q');
console.log('─────────┼────────────┼────────────┼────────────┼────────────┼──────────');
for (const sc of scenarios) {
  let row = sc.padEnd(9) + '|';
  for (const bm of benchmarks) {
    const fail = allResults[sc][bm].any_failure;
    row += `  ${fail.toFixed(1).padStart(7)}% |`.padEnd(13);
  }
  console.log(row);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('TABELA 17 — Depreciação cambial ano 1 (P50) por cenário × benchmark');
console.log('═══════════════════════════════════════════════════════════════');
console.log('Cenário  | B0 SSCB    | B1 UBI-F   | B2 Narrow  | B3 MMT     | B4 no-Q');
console.log('─────────┼────────────┼────────────┼────────────┼────────────┼──────────');
for (const sc of scenarios) {
  let row = sc.padEnd(9) + '|';
  for (const bm of benchmarks) {
    const p50 = percentile(allResults[sc][bm].fx_year1, 0.5);
    row += `  ${(p50*100).toFixed(1).padStart(7)}% |`.padEnd(13);
  }
  console.log(row);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('TABELA 18 — Detalhe F1-F7 para SSCB completo (B0)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('Cenário  | F1 π>10% | F2 Δe>40%| F3 R<0.3 | F4 x>35% | F5 shad  | F6 sprd  | F7 unemp | Qualquer');
console.log('─────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────');
for (const sc of scenarios) {
  const f = allResults[sc]['B0_sscb'].failures;
  const any = allResults[sc]['B0_sscb'].any_failure;
  console.log(`${sc.padEnd(9)}|  ${f.F1.toFixed(1).padStart(5)}% |  ${f.F2.toFixed(1).padStart(5)}% |  ${f.F3.toFixed(1).padStart(5)}% |  ${f.F4.toFixed(1).padStart(5)}% |  ${f.F5.toFixed(1).padStart(5)}% |  ${f.F6.toFixed(1).padStart(5)}% |  ${f.F7.toFixed(1).padStart(5)}% |  ${any.toFixed(1).padStart(5)}%`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('ABLAÇÃO — B0 SSCB vs B4 SSCB sem quotas (diferença em inflação P95)');
console.log('═══════════════════════════════════════════════════════════════');
for (const sc of scenarios) {
  const p95_b0 = percentile(allResults[sc]['B0_sscb'].inflation_p95_path, 0.5);
  const p95_b4 = percentile(allResults[sc]['B4_sscb_no_quotas'].inflation_p95_path, 0.5);
  const diff = (p95_b4 - p95_b0) * 100;
  console.log(`${sc}: B0 P95 = ${(p95_b0*100).toFixed(1)}%, B4 no-quotas P95 = ${(p95_b4*100).toFixed(1)}%, Δ = +${diff.toFixed(1)}pp`);
}
