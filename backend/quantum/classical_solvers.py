import time
import random
import math
from typing import Dict, List, Tuple, Any
import numpy as np


class ClassicalSolvers:
    @staticmethod
    def brute_force_solve(Q: np.ndarray, offset: float) -> Dict[str, Any]:
        """
        Exhaustively evaluates all 2^n possible bitstrings.
        Guarantees finding the TRUE global minimum.
        """
        start_time = time.perf_counter()
        n = Q.shape[0]
        num_states = 1 << n

        # Vectorized or itertools generation
        best_cost = float("inf")
        best_bitstring = None
        all_costs = []

        # Convert to matrix form for fast batch computation
        # Generate binary matrix of shape (num_states, n)
        # Using uint8 bit unpack for extreme speed
        integers = np.arange(num_states, dtype=np.uint32)
        # Unpack bits: column i is bit (n - 1 - i)
        X = ((integers[:, None] >> np.arange(n)[None, :]) & 1).astype(np.float64)

        # Vectorized QUBO cost: diag(X @ Q @ X.T) + offset
        # X @ Q shape: (num_states, n)
        # row-wise dot product: np.sum((X @ Q) * X, axis=1)
        energies = np.sum((X @ Q) * X, axis=1) + offset

        best_idx = int(np.argmin(energies))
        best_cost = float(energies[best_idx])
        best_bitstring = [int(b) for b in X[best_idx]]
        wall_time_ms = (time.perf_counter() - start_time) * 1000.0

        return {
            "method": "Brute Force (Exact 2^n)",
            "best_bitstring": best_bitstring,
            "best_cost": round(best_cost, 4),
            "wall_time_ms": round(wall_time_ms, 2),
            "num_states_evaluated": num_states,
            "min_cost": float(np.min(energies)),
            "max_cost": float(np.max(energies)),
            "mean_cost": float(np.mean(energies)),
        }

    @staticmethod
    def simulated_annealing_solve(
        Q: np.ndarray,
        offset: float,
        initial_temp: float = 10.0,
        cooling_rate: float = 0.95,
        steps: int = 1500,
        seed: int = 42,
    ) -> Dict[str, Any]:
        """Runs simulated annealing local search on the QUBO."""
        start_time = time.perf_counter()
        rng = random.Random(seed)
        n = Q.shape[0]

        # Initial random state
        state = [rng.randint(0, 1) for _ in range(n)]
        x = np.array(state, dtype=np.float64)
        current_energy = float(x.T @ Q @ x + offset)

        best_state = list(state)
        best_energy = current_energy

        temp = initial_temp
        for _ in range(steps):
            # Pick random bit to flip
            flip_idx = rng.randint(0, n - 1)
            candidate = list(state)
            candidate[flip_idx] = 1 - candidate[flip_idx]
            x_cand = np.array(candidate, dtype=np.float64)
            cand_energy = float(x_cand.T @ Q @ x_cand + offset)

            delta_e = cand_energy - current_energy
            if delta_e < 0.0 or rng.random() < math.exp(-delta_e / max(1e-4, temp)):
                state = candidate
                current_energy = cand_energy
                if current_energy < best_energy:
                    best_energy = current_energy
                    best_state = list(state)

            temp = max(1e-4, temp * cooling_rate)

        wall_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "method": "Simulated Annealing",
            "best_bitstring": best_state,
            "best_cost": round(best_energy, 4),
            "wall_time_ms": round(wall_time_ms, 2),
            "steps": steps,
        }
