import time
import math
import random
from typing import Tuple, Dict, Any, List
import numpy as np

class BruteForceSolver:
    """Exact classical ground state search over all 2^n configurations."""
    def __init__(self, num_qubits: int):
        self.num_qubits = num_qubits
        # Precompute all 2^n bitstrings as (2^n, n) uint8 array for ultra-fast vectorized evaluation
        n = num_qubits
        num_states = 1 << n
        indices = np.arange(num_states, dtype=np.uint32)[:, None]
        shifts = np.arange(n - 1, -1, -1, dtype=np.uint32)
        self.all_states = ((indices >> shifts) & 1).astype(np.float64)

    def solve(self, Q: np.ndarray, c_const: float) -> Dict[str, Any]:
        t0 = time.perf_counter()
        # Cost vector = sum_i Q_ii x_i + sum_{i<j} Q_ij x_i x_j + c_const
        # For symmetric/triangular: diag term + pair terms
        diag = np.diag(Q)
        linear_costs = self.all_states @ diag

        # Off-diagonal upper triangular terms
        Q_upper = np.triu(Q, k=1)
        # Vectorized pair product: (all_states @ Q_upper) * all_states summed along rows
        quad_costs = np.sum((self.all_states @ Q_upper) * self.all_states, axis=1)

        total_energies = linear_costs + quad_costs + c_const
        best_idx = int(np.argmin(total_energies))
        min_energy = float(total_energies[best_idx])
        best_bits = "".join(str(int(b)) for b in self.all_states[best_idx])
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "method": "Brute Force (Exact)",
            "best_bitstring": best_bits,
            "best_cost": round(min_energy, 4),
            "wall_clock_ms": round(elapsed_ms, 2),
            "total_states_evaluated": len(total_energies),
            "all_energies": total_energies
        }

class SimulatedAnnealingSolver:
    """Classical simulated annealing baseline on QUBO matrix."""
    def __init__(self, num_qubits: int, steps: int = 2500, t_start: float = 50.0, t_end: float = 0.05):
        self.num_qubits = num_qubits
        self.steps = steps
        self.t_start = t_start
        self.t_end = t_end

    def solve(self, Q: np.ndarray, c_const: float, seed: int = 42) -> Dict[str, Any]:
        t0 = time.perf_counter()
        rng = random.Random(seed)
        n = self.num_qubits

        # Start from random bitstring
        current_x = np.array([rng.randint(0, 1) for _ in range(n)], dtype=np.float64)
        current_cost = float(current_x.T @ Q @ current_x + c_const)

        best_x = current_x.copy()
        best_cost = current_cost

        decay = (self.t_end / self.t_start) ** (1.0 / max(1, self.steps))
        t = self.t_start

        for step in range(self.steps):
            # Single bit flip proposal
            flip_idx = rng.randint(0, n - 1)
            candidate_x = current_x.copy()
            candidate_x[flip_idx] = 1.0 - candidate_x[flip_idx]

            candidate_cost = float(candidate_x.T @ Q @ candidate_x + c_const)
            delta = candidate_cost - current_cost

            if delta < 0.0 or rng.random() < math.exp(-delta / max(1e-8, t)):
                current_x = candidate_x
                current_cost = candidate_cost
                if current_cost < best_cost:
                    best_cost = current_cost
                    best_x = current_x.copy()

            t *= decay

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        best_bits = "".join(str(int(b)) for b in best_x)

        return {
            "method": "Simulated Annealing",
            "best_bitstring": best_bits,
            "best_cost": round(best_cost, 4),
            "wall_clock_ms": round(elapsed_ms, 2),
            "steps": self.steps
        }
