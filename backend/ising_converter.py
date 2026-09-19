from typing import Dict, Tuple, List
import numpy as np
from qiskit.quantum_info import SparsePauliOp

class IsingConverter:
    """
    Converts upper-triangular QUBO matrix Q to Ising Hamiltonian:
    H = sum_i h_i Z_i + sum_{i < j} J_{ij} Z_i Z_j + offset
    via transformation x_i = (1 - z_i) / 2 where z_i in {-1, +1}.
    """
    @staticmethod
    def qubo_to_ising(Q: np.ndarray, c_const: float = 0.0) -> Tuple[np.ndarray, np.ndarray, float]:
        n = Q.shape[0]
        h = np.zeros(n, dtype=np.float64)
        J = np.zeros((n, n), dtype=np.float64)
        offset = float(c_const)

        # Diagonal / Linear terms
        for i in range(n):
            q_ii = Q[i, i]
            offset += 0.5 * q_ii
            h[i] -= 0.5 * q_ii

        # Off-diagonal / Quadratic terms (upper triangular)
        for i in range(n):
            for j in range(i + 1, n):
                q_ij = Q[i, j]
                if abs(q_ij) > 1e-12:
                    offset += 0.25 * q_ij
                    h[i] -= 0.25 * q_ij
                    h[j] -= 0.25 * q_ij
                    J[i, j] = 0.25 * q_ij

        return h, J, offset

    @staticmethod
    def build_pauli_op(h: np.ndarray, J: np.ndarray, offset: float) -> SparsePauliOp:
        """Constructs Qiskit SparsePauliOp from Ising parameters."""
        n = len(h)
        pauli_list = []

        # Constant offset term (Identity)
        if abs(offset) > 1e-12:
            pauli_list.append(("I" * n, offset))

        # Single-qubit Z fields: Qiskit little-endian qubit ordering: qubit k is index (n - 1 - k)
        for i in range(n):
            if abs(h[i]) > 1e-12:
                label = list("I" * n)
                label[n - 1 - i] = "Z"
                pauli_list.append(("".join(label), h[i]))

        # Two-qubit ZZ couplings
        for i in range(n):
            for j in range(i + 1, n):
                if abs(J[i, j]) > 1e-12:
                    label = list("I" * n)
                    label[n - 1 - i] = "Z"
                    label[n - 1 - j] = "Z"
                    pauli_list.append(("".join(label), J[i, j]))

        if not pauli_list:
            pauli_list.append(("I" * n, 0.0))

        return SparsePauliOp.from_list(pauli_list)

    @staticmethod
    def evaluate_ising_energy(z_spins: np.ndarray, h: np.ndarray, J: np.ndarray, offset: float) -> float:
        """Direct energy evaluation: sum_i h_i z_i + sum_{i<j} J_ij z_i z_j + offset."""
        energy = offset + np.dot(h, z_spins)
        n = len(z_spins)
        for i in range(n):
            for j in range(i + 1, n):
                if J[i, j] != 0.0:
                    energy += J[i, j] * z_spins[i] * z_spins[j]
        return float(energy)
