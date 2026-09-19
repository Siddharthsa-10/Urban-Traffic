from typing import Dict, List, Any, Optional
import time


class SolverTelemetry:
    def __init__(self):
        self.reset()

    def reset(self):
        self.timestamp = time.time()
        self.matrix_phase: Dict[str, Any] = {}
        self.circuit_phase: Dict[str, Any] = {}
        self.optimizer_trace: List[Dict[str, float]] = []
        self.measurement_histogram: Dict[str, int] = {}
        self.chosen_bitstring: str = ""
        self.chosen_cost: float = 0.0
        self.handoff_checks: List[Dict[str, Any]] = []
        self.benchmark_comparison: Dict[str, Any] = {}

    def record_matrix_phase(self, Q_matrix: List[List[float]], labels: List[str], offset: float):
        self.matrix_phase = {
            "matrix": [[round(val, 3) for val in row] for row in Q_matrix],
            "labels": labels,
            "offset": round(offset, 3),
        }

    def record_circuit_phase(self, num_qubits: int, depth_p: int, gate_counts: Dict[str, int]):
        self.circuit_phase = {
            "num_qubits": num_qubits,
            "depth_p": depth_p,
            "gate_counts": gate_counts,
        }

    def record_optimizer_step(self, iteration: int, energy: float):
        self.optimizer_trace.append({"iter": iteration, "energy": round(energy, 4)})

    def record_measurement(self, counts: Dict[str, int], chosen: str, cost: float):
        # Keep top 12 bitstrings for histogram visualization
        sorted_counts = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:12]
        self.measurement_histogram = dict(sorted_counts)
        self.chosen_bitstring = chosen
        self.chosen_cost = round(cost, 4)

    def record_handoff(self, checks: List[Dict[str, Any]]):
        self.handoff_checks = checks

    def record_benchmark(self, comp: Dict[str, Any]):
        self.benchmark_comparison = comp

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "matrix_phase": self.matrix_phase,
            "circuit_phase": self.circuit_phase,
            "optimizer_trace": self.optimizer_trace,
            "measurement_histogram": self.measurement_histogram,
            "chosen_bitstring": self.chosen_bitstring,
            "chosen_cost": self.chosen_cost,
            "handoff_checks": self.handoff_checks,
            "benchmark_comparison": self.benchmark_comparison,
        }
