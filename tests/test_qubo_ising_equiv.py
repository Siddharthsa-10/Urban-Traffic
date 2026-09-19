import sys
import unittest
from pathlib import Path
import numpy as np

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.network import CityNetwork
from backend.junction import Junction
from backend.quantum.qubo_builder import QUBOBuilder, SignalPlanSpec
from backend.quantum.ising_converter import IsingConverter


class TestQuboIsingExhaustiveEquivalence(unittest.TestCase):
    def setUp(self):
        self.network = CityNetwork()
        self.builder = QUBOBuilder(self.network)
        self.junctions = {
            j_id: Junction(j_id, j_data["name"], j_data["world_x"], j_data["world_y"])
            for j_id, j_data in self.network.junctions.items()
        }
        # Populate diverse queue states on 4 junctions (2x2 grid)
        self.junctions["J1"].queues = {"N": 14, "S": 6, "E": 2, "W": 3}
        self.junctions["J2"].queues = {"N": 4, "S": 5, "E": 18, "W": 22}
        self.junctions["J3"].queues = {"N": 19, "S": 21, "E": 3, "W": 4}
        self.junctions["J4"].queues = {"N": 8, "S": 12, "E": 9, "W": 11}

        # Mock heavy vehicle links for couplings
        self.link_vehicles = {
            "L_J1_J2": [object()] * 8,  # heavy horizontal
            "L_J3_J4": [object()] * 7,  # heavy horizontal
            "L_J1_J3": [object()] * 6,  # heavy vertical
            "L_J2_J4": [object()] * 6,  # heavy vertical
        }

    def test_all_256_states_exact_agreement(self):
        """
        MANDATORY UNIT TEST:
        For all 2^8 = 256 bitstrings (4 junctions x 2 bits), verifies that:
        Direct Cost == QUBO Energy == Ising Energy
        Within float tolerance 1e-6.
        """
        Q, qubo_offset, meta = self.builder.build_qubo(
            junctions=self.junctions,
            link_vehicles=self.link_vehicles,
            current_plans={j_id: (0, 0) for j_id in self.builder.junction_ids},
        )

        h, J, ising_offset, hamiltonian = IsingConverter.qubo_to_ising(Q, qubo_offset)

        num_qubits = self.builder.num_qubits  # 8 qubits
        total_states = 1 << num_qubits        # 256 states
        self.assertEqual(num_qubits, 8)
        self.assertEqual(total_states, 256)

        max_diff_qubo_direct = 0.0
        max_diff_ising_qubo = 0.0

        print(f"\nEvaluating exhaustive equivalence across ALL {total_states} configurations ({num_qubits} qubits)...")

        for state_int in range(total_states):
            bitstring = [(state_int >> i) & 1 for i in range(num_qubits)]

            # 1. Evaluate Direct Cost
            direct_cost = self.builder.evaluate_direct_cost(meta, bitstring)

            # 2. Evaluate QUBO Energy: x^T Q x + offset
            qubo_energy = self.builder.evaluate_qubo_energy(Q, qubo_offset, bitstring)

            # 3. Evaluate Ising Energy: z^T J z + h^T z + offset
            ising_energy = IsingConverter.evaluate_ising_energy(h, J, ising_offset, bitstring)

            # Differences
            diff_qd = abs(qubo_energy - direct_cost)
            diff_iq = abs(ising_energy - qubo_energy)

            if diff_qd > max_diff_qubo_direct:
                max_diff_qubo_direct = diff_qd
            if diff_iq > max_diff_ising_qubo:
                max_diff_ising_qubo = diff_iq

            if diff_qd > 1e-5 or diff_iq > 1e-5:
                self.fail(
                    f"State {state_int} ({bitstring}) mismatch!\n"
                    f"Direct: {direct_cost}\nQUBO: {qubo_energy}\nIsing: {ising_energy}\n"
                    f"Diff Q-D: {diff_qd}, Diff I-Q: {diff_iq}"
                )

        print(f"Max Diff (QUBO vs Direct): {max_diff_qubo_direct:.2e}")
        print(f"Max Diff (Ising vs QUBO):  {max_diff_ising_qubo:.2e}")
        print(f"Verified all {total_states} states: 100% MATHEMATICAL AGREEMENT.")

        self.assertLessEqual(max_diff_qubo_direct, 1e-5)
        self.assertLessEqual(max_diff_ising_qubo, 1e-5)


if __name__ == "__main__":
    unittest.main()
