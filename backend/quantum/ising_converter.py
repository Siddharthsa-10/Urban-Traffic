from typing import Tuple, List, Dict, Any
import numpy as np
from qiskit.quantum_info import SparsePauliOp


class IsingConverter:
    @staticmethod
    def qubo_to_ising(Q: np.ndarray, qubo_offset: float) -> Tuple[np.ndarray, np.ndarray, float, SparsePauliOp]:
        """
        Converts upper-triangular QUBO (Q, qubo_offset) where x in {0, 1}
        to Ising model (h, J, ising_offset) where z in {+1, -1} via x = (1 - z)/2.
        
        Returns:
            h: 1D array of single-qubit Z fields (length n)
            J: 2D upper-triangular array of two-qubit ZZ couplings (size n x n)
            ising_offset: scalar energy offset
            hamiltonian: Qiskit SparsePauliOp
        """
        n = Q.shape[0]
        h = np.zeros(n, dtype=np.float64)
        J = np.zeros((n, n), dtype=np.float64)
        ising_offset = float(qubo_offset)

        # 1. Linear terms Q_ii * x_i = Q_ii * (1 - z_i) / 2
        for i in range(n):
            q_ii = Q[i, i]
            ising_offset += 0.5 * q_ii
            h[i] -= 0.5 * q_ii

        # 2. Quadratic terms Q_ij * x_i * x_j (i < j)
        # x_i * x_j = (1 - z_i)(1 - z_j) / 4 = 1/4 - 1/4 z_i - 1/4 z_j + 1/4 z_i z_j
        for i in range(n):
            for j in range(i + 1, n):
                q_ij = Q[i, j]
                if abs(q_ij) > 1e-9:
                    ising_offset += 0.25 * q_ij
                    h[i] -= 0.25 * q_ij
                    h[j] -= 0.25 * q_ij
                    J[i, j] += 0.25 * q_ij

        # Build Qiskit SparsePauliOp
        pauli_list = []
        # Identity offset
        if abs(ising_offset) > 1e-9:
            pauli_list.append(("I" * n, ising_offset))

        # Z terms
        for i in range(n):
            if abs(h[i]) > 1e-9:
                # Qiskit qubit 0 is rightmost in standard string convention
                pauli_str = ["I"] * n
                pauli_str[n - 1 - i] = "Z"
                pauli_list.append(("".join(pauli_str), h[i]))

        # ZZ terms
        for i in range(n):
            for j in range(i + 1, n):
                if abs(J[i, j]) > 1e-9:
                    pauli_str = ["I"] * n
                    pauli_str[n - 1 - i] = "Z"
                    pauli_str[n - 1 - j] = "Z"
                    pauli_list.append(("".join(pauli_str), J[i, j]))

        if not pauli_list:
            hamiltonian = SparsePauliOp(["I" * n], [0.0])
        else:
            hamiltonian = SparsePauliOp.from_list(pauli_list)

        return h, J, ising_offset, hamiltonian

    @staticmethod
    def evaluate_ising_energy(h: np.ndarray, J: np.ndarray, ising_offset: float, bitstring: List[int]) -> float:
        """
        Evaluates Ising energy for a bitstring x in {0, 1}^n
        where z_i = 1 - 2 * x_i in {+1, -1}.
        """
        n = len(bitstring)
        z = np.array([1.0 - 2.0 * x for x in bitstring], dtype=np.float64)
        energy = ising_offset + np.dot(h, z)
        for i in range(n):
            for j in range(i + 1, n):
                energy += J[i, j] * z[i] * z[j]
        return float(energy)
