import hashlib
import time
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

from .ising_converter import IsingConverter

class QaoaSolver:
    def __init__(self, num_qubits: int, depth_p: int = 1, shots: int = 2048):
        self.num_qubits = num_qubits
        self.p = depth_p
        self.shots = shots
        self.backend = AerSimulator()
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.last_gamma = [0.4] * depth_p
        self.last_beta = [0.6] * depth_p

    def build_qaoa_circuit(self, h: np.ndarray, J: np.ndarray, gammas: List[float], betas: List[float]) -> QuantumCircuit:
        n = self.num_qubits
        qc = QuantumCircuit(n)

        # Initial equal superposition |+>^n
        qc.h(range(n))

        for layer in range(self.p):
            gamma = gammas[layer]
            beta = betas[layer]

            # Cost Hamiltonian layer: e^{-i \gamma H_C}
            # Single qubit Z rotations: Rz(2 * gamma * h_i)
            for i in range(n):
                if abs(h[i]) > 1e-6:
                    qc.rz(2.0 * gamma * float(h[i]), i)

            # Two qubit ZZ rotations: CNOT -> Rz(2 * gamma * J_ij) -> CNOT
            for i in range(n):
                for j in range(i + 1, n):
                    if abs(J[i, j]) > 1e-6:
                        angle = 2.0 * gamma * float(J[i, j])
                        qc.cx(i, j)
                        qc.rz(angle, j)
                        qc.cx(i, j)

            # Mixer Hamiltonian layer: e^{-i \beta H_M}
            # Rx(2 * beta) on every qubit
            for i in range(n):
                qc.rx(2.0 * beta, i)

        # Measurement layer
        qc.measure_all()
        return qc

    def compute_problem_hash(self, Q: np.ndarray, c_const: float) -> str:
        data_str = f"{Q.round(4).tobytes()}_{round(c_const, 3)}"
        return hashlib.md5(data_str.encode()).hexdigest()

    def solve(
        self,
        Q: np.ndarray,
        c_const: float,
        optimum_cost: Optional[float] = None,
        optimum_bitstring: Optional[str] = None,
        max_iter: int = 12
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        prob_hash = self.compute_problem_hash(Q, c_const)
        if prob_hash in self.cache:
            res = dict(self.cache[prob_hash])
            res["cached"] = True
            return res

        h, J, offset = IsingConverter.qubo_to_ising(Q, c_const)
        n = self.num_qubits

        optimizer_trace = []
        iteration_counter = 0

        # Objective function for classical optimizer (COBYLA)
        def cost_expectation(params: np.ndarray) -> float:
            nonlocal iteration_counter
            gammas = params[:self.p]
            betas = params[self.p:]

            qc = self.build_qaoa_circuit(h, J, gammas, betas)
            t_qc = transpile(qc, self.backend, optimization_level=1)
            # Evaluate fast using smaller shots for optimization steps
            result = self.backend.run(t_qc, shots=512).result()
            counts = result.get_counts()

            # Compute expectation value <H>
            exp_val = 0.0
            total_shots = sum(counts.values())
            for bitstring_qiskit, count in counts.items():
                # Qiskit bitstring is reversed (qubit n-1 ... qubit 0)
                bits = bitstring_qiskit[::-1]
                x = np.array([int(b) for b in bits], dtype=np.float64)
                cost = float(x.T @ Q @ x + c_const)
                exp_val += cost * (count / total_shots)

            iteration_counter += 1
            optimizer_trace.append({
                "iteration": iteration_counter,
                "gamma": [round(float(g), 4) for g in gammas],
                "beta": [round(float(b), 4) for b in betas],
                "energy": round(float(exp_val), 3)
            })
            return exp_val

        # Warm start parameters
        initial_params = np.array(self.last_gamma + self.last_beta, dtype=np.float64)

        opt_res = minimize(
            cost_expectation,
            initial_params,
            method="COBYLA",
            options={"maxiter": max_iter, "rhobeg": 0.3}
        )

        best_params = opt_res.x
        self.last_gamma = list(best_params[:self.p])
        self.last_beta = list(best_params[self.p:])

        # Final sampling with full shots (2048)
        final_qc = self.build_qaoa_circuit(h, J, self.last_gamma, self.last_beta)
        transpiled_final = transpile(final_qc, self.backend, optimization_level=1)
        depth = transpiled_final.depth()
        gate_counts = dict(transpiled_final.count_ops())

        sim_job = self.backend.run(transpiled_final, shots=self.shots)
        counts = sim_job.result().get_counts()

        # Parse counts, sort bitstrings, compute energies
        histogram = []
        best_sampled_bitstring = ""
        min_sampled_cost = float("inf")
        optimum_prob = 0.0

        for bitstr_rev, count in counts.items():
            bitstr = bitstr_rev[::-1]
            x = np.array([int(b) for b in bitstr], dtype=np.float64)
            cost = float(x.T @ Q @ x + c_const)
            prob = count / self.shots

            if cost < min_sampled_cost:
                min_sampled_cost = cost
                best_sampled_bitstring = bitstr

            if optimum_bitstring and bitstr == optimum_bitstring:
                optimum_prob = prob

            histogram.append({
                "bitstring": bitstr,
                "cost": round(cost, 2),
                "count": count,
                "probability": round(prob, 4)
            })

        histogram.sort(key=lambda item: item["cost"])
        top_histogram = histogram[:16]  # top 16 candidate states for UI drawer

        wall_clock_ms = (time.perf_counter() - t0) * 1000.0
        approx_ratio = 1.0
        if optimum_cost is not None and abs(optimum_cost) > 1e-4:
            # For minimization: approx_ratio = optimum_cost / QAOA_cost or ratio of energies
            approx_ratio = round(optimum_cost / min_sampled_cost if min_sampled_cost > 0 else min_sampled_cost / optimum_cost, 3)

        result_payload = {
            "method": "QAOA (Aer Simulator)",
            "p": self.p,
            "num_qubits": n,
            "circuit_depth": depth,
            "gate_counts": gate_counts,
            "shots": self.shots,
            "best_bitstring": best_sampled_bitstring,
            "best_cost": round(min_sampled_cost, 4),
            "approximation_ratio": approx_ratio,
            "optimum_probability": round(optimum_prob, 4),
            "wall_clock_ms": round(wall_clock_ms, 2),
            "optimizer_iterations": iteration_counter,
            "optimizer_trace": optimizer_trace,
            "histogram": top_histogram,
            "cached": False
        }

        self.cache[prob_hash] = result_payload
        return result_payload
