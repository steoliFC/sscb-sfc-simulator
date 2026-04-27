# SSCB SFC Simulator

Stock-flow consistent simulator for the Social Security Central Bank (SSCB) monetary architecture, accompanying the paper:

**Oliveira, Estêvão, and Paulo Pinto (2026).** *The Social Security Central Bank as a Monetary Architecture: Internal Consistency, Transitional Design, and Open-Economy Constraints.*

## Overview

This repository contains the computational implementation used to produce the Monte Carlo results reported in §10 of the paper. The simulator implements:

- A stock-flow consistent (SFC) macroeconomic model with seven sectors (households, firms, government, central bank, payment banks, investment banks, external sector)
- An external block with endogenous exchange rate, currency substitution, sudden stops, and sovereign spreads
- Monetary policy rules (PID controller on monthly UMI release, distributional shock absorber, sectoral quotas)
- Five comparison configurations (B0 full SSCB, B1 fiscal UBI, B2 narrow banking without UMI, B3 MMT with fiscal rule, B4 SSCB without quotas)
- Six stress scenarios (baseline, moderate, energy shock, sudden stop, confidence collapse, worst case)
- Seven explicit failure criteria (F1-F7) with quantitative thresholds

## Headline result

30,000 Monte Carlo trajectories (6 scenarios × 5 configurations × 1,000 trajectories) over a 120-month horizon. Aggregate failure probabilities reported in Tables 13-18 of the paper.

## Reproduction

### Prerequisites

- Node.js 18 or later
- No external dependencies (the simulator uses only standard library)

### Run

```bash
node simulator_sfc.js
```

This produces `simulation_results.json` containing the full output (~7 MB) used to generate the tables in §10 of the paper.

### Random seeds

The simulator uses deterministic seeds: `seed = i × 7919 + scenario_hash + benchmark_hash` where `i` ranges from 0 to 999 within each (scenario, benchmark) cell. Running the simulator from a clean state reproduces the exact trajectories reported in the paper.

### Expected runtime

Approximately 5-15 minutes on a modern laptop, depending on hardware.

## Structure

```
.
├── simulator_sfc.js        # Main simulator (670 lines)
├── simulation_results.json # Output (30,000 trajectories)
├── PARAMETERS.md           # Parameter documentation (Tables 9, 10, 12)
├── README.md               # This file
└── LICENSE                 # MIT License
```

## Calibration

Structural calibration uses Portuguese 2025 indicators (paper Table A.2):

| Indicator | Value | Source |
|---|---|---|
| Nominal GDP | €306.77B | INE National Accounts |
| M2 | €344.67B | Banco de Portugal |
| M1 | €186.3B | Banco de Portugal |
| Public debt | €275B (89.7% GDP) | IGCP |
| International reserves | €40B | Banco de Portugal |
| Adult population 18+ | 8.77M | INE projection |
| Constitutional UMI | €14,000/year/adult | Calibration: 60% median income |

See `PARAMETERS.md` for the full parameter set with sources.

## Important caveats

The empirical claims of the paper are conditional on the central calibration. Systematic parametric robustness tests (see paper §9.3) are pending and identified as the highest priority of subsequent work. Users running variants of this simulator should report any sensitivity findings as research-relevant rather than as confirmation of the paper's results.

The SSCB has never been implemented; this simulator is a proof-of-concept for internal consistency under documented assumptions, not empirical validation of an existing regime.

## Citation

If you use this simulator in your work, please cite the paper:

```bibtex
@misc{oliveirapinto2026sscb,
  author = {Oliveira, Est{\^e}v{\~a}o and Pinto, Paulo},
  title  = {The Social Security Central Bank as a Monetary Architecture:
            Internal Consistency, Transitional Design, and
            Open-Economy Constraints},
  year   = {2026},
  note   = {Working paper available on SSRN}
}
```

## Contact

For questions, replication issues, or suggestions, please contact the corresponding author Estêvão Oliveira at steoli@gmail.com.

## License

MIT License (see LICENSE file).
