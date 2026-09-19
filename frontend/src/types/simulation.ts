export interface JunctionData {
  id: string;
  name: string;
  x: number;
  y: number;
  current_plan_id: number;
  proposed_plan_id: number;
  active_axis: 'NS' | 'EW';
  sub_phase: 'GREEN' | 'YELLOW' | 'ALL_RED' | 'PEDESTRIAN';
  countdown: number;
  signal_change_count: number;
  queues: { N: number; S: number; E: number; W: number };
  occupancies: { N: number; S: number; E: number; W: number };
  pedestrian_requests: { N: boolean; S: boolean; E: boolean; W: boolean };
  is_pedestrian_active: boolean;
  is_preempted: boolean;
  plan_name: string;
  signals: { N: string; S: string; E: string; W: string };
}

export interface VehicleData {
  id: string;
  type: string;
  route: string[];
  route_idx: number;
  edge: string;
  position: number;
  speed: number;
  acceleration: number;
  wait_time: number;
  color: string;
  length: number;
  is_ghost?: boolean;
}

export interface ControllerMetrics {
  sim_time: number;
  active_vehicles: number;
  completed_vehicles: number;
  avg_wait_time_s: number;
  avg_travel_time_s: number;
  max_queue: number;
  throughput_veh_per_min: number;
  total_fuel_liters: number;
  total_co2_kg: number;
  total_signal_changes: number;
  solver_computation_time_ms: number;
}

export interface CorridorStatus {
  active: boolean;
  ambulance_id: string | null;
  origin: string;
  destination: string;
  route: string[];
  alternative_routes: string[][];
  etas: Record<string, number>;
  preempted_junctions: Record<string, string>;
  travel_time_s: number;
  position: number;
  current_edge: string;
}

export interface ShiftLogEntry {
  time: string;
  sim_time: number;
  category: string;
  message: string;
}

export interface OptimizerStep {
  iteration: number;
  gamma: number[];
  beta: number[];
  energy: number;
}

export interface HistogramEntry {
  bitstring: string;
  cost: number;
  count: number;
  probability: number;
}

export interface QaoaData {
  method: string;
  p: number;
  num_qubits: number;
  circuit_depth: number;
  gate_counts: Record<string, number>;
  shots: number;
  best_bitstring: string;
  best_cost: number;
  approximation_ratio: number;
  optimum_probability: number;
  wall_clock_ms: number;
  optimizer_iterations: number;
  optimizer_trace: OptimizerStep[];
  histogram: HistogramEntry[];
  cached?: boolean;
}

export interface SolvePayload {
  epoch: number;
  fallback_level: string;
  is_quantum_killed: boolean;
  used_method: string;
  qubo_matrix: number[][];
  c_const: number;
  qaoa: QaoaData;
  brute_force: {
    best_cost: number;
    best_bitstring: string;
    wall_clock_ms: number;
  };
  simulated_annealing: {
    best_cost: number;
    best_bitstring: string;
    wall_clock_ms: number;
  };
  why_terms: Record<string, {
    costs: number[];
    q_ns: number;
    q_ew: number;
    curr_plan: number;
  }>;
  safety_reports: Record<string, {
    passed: boolean;
    violations: string[];
    repaired_plan: number;
  }>;
  decisions: Record<string, number>;
  total_solve_time_ms: number;
}

export interface SimulationFrame {
  sim_time: number;
  paused: boolean;
  speed_multiplier: number;
  weather: 'clear' | 'rain' | 'heavy_rain' | 'fog';
  fallback_level: string;
  is_quantum_killed: boolean;
  corridor: CorridorStatus;
  shift_log: ShiftLogEntry[];
  closed_roads: string[][];
  accidents: string[][];
  junctions: Record<string, JunctionData>;
  vehicles: VehicleData[];
  metrics: {
    hybrid: ControllerMetrics;
    fixed: ControllerMetrics;
    rule: ControllerMetrics;
  };
  ghost_queues: Record<string, Record<string, number>>;
  latest_solve: SolvePayload | null;
}
