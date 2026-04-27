# SSCB Simulator Parameters

This document specifies all parameters used in the SSCB SFC simulator. Cross-references are to tables in the paper.

## Structural calibration (Portugal 2025)

See paper Table A.2.

| Parameter | Value | Description |
|---|---|---|
| `N_ADULTS` | 8.77 | Adult population 18+ (millions) |
| `RMG_YEAR` | 14000 | Universal Monetary Income (€/year/adult) |
| `GDP_0` | 306.77 | Nominal GDP (€B) |
| `M2_0` | 344.67 | Broad money (€B) |
| `M1_0` | 186.3 | Demand deposits + cash, converted to SSCB money on day 0 (€B) |
| `DEBT_PUB_0` | 275.0 | Legacy public debt (€B, 89.7% GDP) |
| `DEBT_HH_0` | 165.0 | Legacy household debt (€B, 56.5% GDP) |
| `DEBT_FIRMS_0` | 95.0 | Legacy firm debt (€B) |
| `RESERVES_0` | 40.0 | International reserves (€B) |
| `SAVINGS_IB_0` | 140.0 | Initial savings in Investment Banks (€B) |

Derived: `T_YEAR = 122.78` €B/year, `T_MONTH = 10.23` €B/month.

## Sectoral elasticities (κ) — Phillips curve sector-by-sector

See paper Table 6, parameter source documentation in Table 9.

| Sector | κ (central) | Range (low-high) | Source |
|---|---|---|---|
| Housing | 5.0 | 3.5-7.0 | Dias and Duarte (2019) |
| Local services | 2.0 | 1.5-2.8 | INE HICP sub-indices |
| Energy | 1.5 | 1.0-2.5 | ERSE (2024); IEA |
| Food | 1.0 | 0.7-1.5 | FAO; INE HICP |
| Tradables | 0.5 | 0.3-0.8 | Osbat et al. (2019) |

## Sectoral weights and pass-through

| Sector | Weight (HICP) | FX pass-through γ | Supply lag |
|---|---|---|---|
| Housing | 0.20 | 0.15 | 3-5 years |
| Local services | 0.30 | 0.10 | 6-12 months |
| Energy | 0.10 | 0.85 | immediate |
| Food | 0.15 | 0.45 | 3-6 months |
| Tradables | 0.25 | 0.75 | 1-3 months |

## Consumption propensities (α) by income decile

See paper Table 9, source: Banco de Portugal (2024).

| Decile | α (central) | Range |
|---|---|---|
| 1-4 (bottom 40%) | 0.82 | 0.75-0.88 |
| 5-7 (middle 30%) | 0.71 | 0.65-0.78 |
| 8-10 (top 30%) | 0.58 | 0.50-0.65 |

## PID controller (monetary rule)

See paper §7.1 and Table 9.

| Parameter | Value | Range |
|---|---|---|
| K_p (proportional) | 5.0 | 3.0-7.0 |
| K_i (integral) | 0.5 | 0.3-0.8 |
| K_d (derivative) | 2.0 | 1.5-3.0 |
| Inflation target | 0.0% | corridor [-3%, +5%] |
| α envelope | [0.05, 0.95] | clipping bounds |

Source: grid search optimisation following Aström and Hägglund (1995).

## External block

See paper §5 and Table 9.

| Parameter | Value | Range | Source |
|---|---|---|---|
| θ (fx flow sensitivity) | 0.15 | 0.08-0.30 | Bahaj and Reis (2022) |
| σ_1 (currency substitution to inflation) | 0.8 | 0.5-1.2 | Levy-Yeyati (2006) |
| π_1 (sovereign spread to debt/GDP) | 0.04 | 0.02-0.08 | Ardagna et al. (2007) |
| σ_leak (capital controls leakage) | 0.08 | 0.05-0.15 | Benediktsdóttir et al. (2017) |
| Sudden stop probability (baseline) | 2%/year | 1-5%/year | Calvo et al. (2008) |
| x_0 (initial currency substitution) | 0.06 | — | Banco de Portugal (2025) |

## Distributional shock absorber

See paper Table 7 and §7.2.

| Decile | Cut applied | Justification |
|---|---|---|
| 1-4 | 20% | High MPC; severe cut affects essentials |
| 5-7 | 50% | Intermediate margin |
| 8-10 | 70% | Low MPC; savings absorb |

Trigger: π > target + 2% for 3+ consecutive months. Duration: 3 months.

## Sectoral quotas (year-by-year)

See paper Table 8 and §7.3.

| Year | Housing | Local services |
|---|---|---|
| 1 | 30% | 30% |
| 2 | 50% | 50% |
| 3 | 75% | 75% |
| 4+ | 100% | 100% |

Operationalised via MCC (Merchant Category Code) at the payment-rail level.

## Stress scenarios

See paper Table 12.

| Scenario | Code | Characterisation |
|---|---|---|
| S1 | Baseline | Normal volatility, no extreme events |
| S2 | Moderate | Moderate fiscal stress, high correlation |
| S3 | Energy | Permanent +80% energy shock |
| S4 | Sudden stop | SS prob 15%/year, +400bp spreads |
| S5 | Confidence | Initial confidence 0.55 (vs 1.0) |
| S6 | Worst case | S3+S4+S5 combined, correlation 0.8 |

## Failure criteria

See paper Table 11.

| # | Criterion | Threshold |
|---|---|---|
| F1 | Persistent inflation | π > 10% for ≥ 12 months |
| F2 | Currency depreciation | Δe > 40% over 12 months |
| F3 | Reserves depletion | R^FX < 0.3 × R^target for ≥ 6 months |
| F4 | Currency substitution | x > 35% for ≥ 6 months |
| F5 | Shadow banking | Shadow > 15% of SSCB M2 |
| F6 | Sovereign spread | Spread > 600bp for ≥ 12 months |
| F7 | Employment degradation | Δ(unemp) > counterfactual + 5pp for ≥ 24 months |

## Configurations tested

| Code | Name | Description |
|---|---|---|
| B0 | Full SSCB | All four pillars (debt-free creation, narrow banking, shock absorber, sectoral quotas) |
| B1 | Fiscal UBI | Conventional regime + UBI €6,000/year financed by 15pp income tax + 5pp VAT |
| B2 | Narrow banking, no UMI | Chicago Plan implemented but no direct distribution |
| B3 | MMT with fiscal rule | Sovereign creation + reverse-Taylor fiscal rule |
| B4 | SSCB without quotas | Full SSCB minus sectoral quotas (internal ablation) |

Detailed specifications in paper Appendix C.7.

## Random seed convention

```
seed = i * 7919 + scenario_hash + benchmark_hash
```

where:
- `i` ∈ [0, 999] indexes the trajectory within a (scenario, benchmark) cell
- `scenario_hash` is a fixed integer per scenario (S1=0, S2=1, ..., S6=5)
- `benchmark_hash` is a fixed integer per benchmark (B0=0, B1=1, ..., B4=4)

Running the simulator from clean state reproduces exactly the trajectories reported in §10 of the paper.
