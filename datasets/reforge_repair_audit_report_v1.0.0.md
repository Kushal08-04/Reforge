# REFORGE Healed Dataset Audit Report — Version v1.0.0

**Exported At**: 2026-10-25T08:20:41.000Z
**Base Baseline**: v1.0.0
**Total Records**: 1016
**Total Observations Repaired**: 28

## Executive Summary
All repaired observations were processed through REFORGE's isolated sandbox cascade validation loop until their newly evaluated semantic & ML risk scores dropped below **0.30**.

## Healed Observations Audit Log

| Timestamp | Sensor Entity | Original Value | Healed Value | Repair Strategy | Applied By |
|---|---|---|---|---|---|
| 2026-10-25T08:20:23.309Z | `zone-b-pressure` | 1020 | **1010.745** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.356Z | `outside-device-29-temperature` | 22.63 | **23.195** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.389Z | `room-a-device-14-temperature` | 23.28 | **23.017** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.430Z | `room-a-device-44-temperature` | 24.05 | **22.715** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.497Z | `room-b-device-39-temperature` | 24.01 | **22.38** | `rolling_statistical_estimation` | lead-data-engineer |
| 2026-10-25T08:20:23.533Z | `room-b-device-48-temperature` | 24.84 | **22.286** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.600Z | `outside-device-5-temperature` | 24.58 | **22.82** | `rolling_statistical_estimation` | lead-data-engineer |
| 2026-10-25T08:20:23.665Z | `room-c-device-31-temperature` | 24.32 | **23.25** | `rolling_statistical_estimation` | lead-data-engineer |
| 2026-10-25T08:20:23.705Z | `room-b-device-41-temperature` | 24.7 | **22.427** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.742Z | `room-a-device-20-temperature` | 25.09 | **22.49** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.781Z | `room-a-device-6-temperature` | 25.15 | **24.554** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.819Z | `room-c-device-37-temperature` | 25.18 | **23.99** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.855Z | `room-a-device-4-temperature` | 24.87 | **21.64** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.892Z | `room-b-device-47-temperature` | 24.49 | **24.043** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.923Z | `room-a-device-14-temperature` | 24.3 | **24.322** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.955Z | `outside-device-47-temperature` | 24.16 | **24.87** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:23.987Z | `room-c-device-10-temperature` | 26.38 | **24.35** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.025Z | `outside-device-4-temperature` | 26.93 | **23.94** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.060Z | `room-a-device-2-temperature` | 27.08 | **23.56** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.090Z | `room-c-device-40-temperature` | 27.45 | **24.62** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.126Z | `room-c-device-8-temperature` | 27.51 | **24.49** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.164Z | `outside-device-8-temperature` | 27.36 | **24.4** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.212Z | `room-a-device-16-temperature` | 28.02 | **24.9** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.252Z | `outside-device-44-temperature` | 27.8 | **24.12** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.302Z | `room-a-device-3-temperature` | 28.17 | **25.07** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.336Z | `room-c-device-15-temperature` | 28.67 | **23.77** | `historical_interpolation` | lead-data-engineer |
| 2026-10-25T08:20:24.369Z | `room-b-device-42-temperature` | 28.57 | **23.89** | `historical_interpolation` | lead-data-engineer |
| 2025-04-26T16:45:29.000Z | `room-a-device-11-temperature` | 28.3 | **24.72** | `historical_interpolation` | lead-data-engineer |
