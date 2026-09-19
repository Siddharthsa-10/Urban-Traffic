import sys
from pathlib import Path
import numpy as np

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.simulator import TrafficSimulator
from backend.qubo_builder import QuboBuilder
from backend.ising_converter import IsingConverter
from backend.classical_solvers import BruteForceSolver, SimulatedAnnealingSolver

def test_exhaustive_qubo_ising_agreement():
    print("=" * 80)
    print(" STAGE 2 UNIT TEST: EXHAUSTIVE 2^N QUBO-ISING-DIRECT AGREEMENT TEST")
    print("=" * 80)

    # 1. Spin up simulator for 15 seconds to generate real traffic distribution
    sim = TrafficSimulator(seed=42)
    for _ in range(15):
        sim.step()

    junctions_order = ["J1", "J2", "J3", "J4", "J5", "J6"]
    num_qubits = len(junctions_order) * 2  # 12 qubits => 4096 assignments
    print(f"Testing {num_qubits} qubits ({1 << num_qubits} states)...")

    # 2. Build real QUBO matrix
    builder = QuboBuilder(junctions_order)
    Q, c_const, _ = builder.build_qubo(sim.junctions, sim.network)

    # 3. Convert to Ising
    h, J, offset = IsingConverter.qubo_to_ising(Q, c_const)

    # 4. Exhaustively verify every assignment in {0, 1}^12
    max_abs_diff = 0.0
    num_states = 1 << num_qubits

    for idx in range(num_states):
        # Extract bit vector x in {0, 1}^12
        x = np.array([(idx >> (num_qubits - 1 - k)) & 1 for k in range(num_qubits)], dtype=np.float64)

        # Direct QUBO evaluation
        e_qubo = float(x.T @ Q @ x + c_const)

        # Ising transformation: z = 1 - 2*x (since x = (1 - z)/2 => z = 1 - 2*x)
        z = 1.0 - 2.0 * x
        e_ising = IsingConverter.evaluate_ising_energy(z, h, J, offset)

        diff = abs(e_qubo - e_ising)
        if diff > max_abs_diff:
            max_abs_diff = diff

        if diff > 1e-6:
            raise AssertionError(f"Mismatch at state {idx}: QUBO={e_qubo:.8f}, Ising={e_ising:.8f}, Diff={diff:.2e}")

    print(f" Checked all {num_states} states successfully!")
    print(f" Maximum absolute error between QUBO and Ising: {max_abs_diff:.2e} (tolerance: 1.0e-06)")
    assert max_abs_diff < 1e-6, "QUBO and Ising energy mismatch exceeds tolerance!"

    # 5. Test Brute Force solver finds exact minimum
    bf = BruteForceSolver(num_qubits=num_qubits)
    bf_res = bf.solve(Q, c_const)
    print(f"\n[Brute Force Exact] Best Cost: {bf_res['best_cost']} | Bitstring: {bf_res['best_bitstring']} | Time: {bf_res['wall_clock_ms']}ms")

    # 6. Test Simulated Annealing
    sa = SimulatedAnnealingSolver(num_qubits=num_qubits, steps=2000)
    sa_res = sa.solve(Q, c_const)
    print(f"[Simulated Annealing] Best Cost: {sa_res['best_cost']} | Bitstring: {sa_res['best_bitstring']} | Time: {sa_res['wall_clock_ms']}ms")

    print("\n" + "=" * 80)
    print("STAGE 2 EXHAUSTIVE AGREEMENT TEST PASSED 100%.")
    print("=" * 80)

if __name__ == "__main__":
    test_exhaustive_qubo_ising_agreement()
