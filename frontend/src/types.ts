export interface VehicleState {
  id: string;
  type: string;
  link: string;
  pos: number;
  speed: number;
}

export interface JunctionPedestrian {
  status: string;
  wait_time: number;
}

export interface JunctionState {
  id: string;
  name: string;
  world_x: number;
  world_y: number;
  phase: string;
  axis: string;
  is_green: boolean;
  is_yellow: boolean;
  is_all_red: boolean;
  time_remaining_s: number;
  target_duration_s: number;
  ns_green_target: number;
  ew_green_target: number;
  plan_desc: string;
  reason: string;
  is_preempted: boolean;
  preempt_axis: string | null;
  queues: { N: number; S: number; E: number; W: number };
  pedestrians: Record<string, JunctionPedestrian>;
  safety_status: string;
}

export interface LinkState {
  id: string;
  from: string;
  to: string;
  length_m: number;
  lanes: number;
  speed_limit_mps: number;
  capacity_vph: number;
  is_arterial: boolean;
  is_underpass: boolean;
  is_narrow: boolean;
  is_8_junction_only?: boolean;
  is_closed: boolean;
  closure_reason?: string;
  status?: string;
  effective_capacity?: number;
  has_accident: boolean;
  is_flooded: boolean;
  tag: string;
}

export interface ControllerMetrics {
  avg_wait_s: number;
  max_queue: number;
  throughput: number;
  total_fuel_l: number;
  total_co2_kg: number;
  avg_travel_time_s?: number;
  plan_changes?: number;
}

export interface CorridorState {
  is_active: boolean;
  origin: string | null;
  destination: string | null;
  route: string[];
  junction_etas: Record<string, number>;
  junction_axes: Record<string, string>;
  travel_time_hybrid: number | null;
  travel_time_fixed: number | null;
  travel_time_rule: number | null;
}

export interface SolverSummary {
  method: string;
  approx_ratio: number;
  wall_time_ms: number;
  qubit_count: number;
  circuit_depth: number;
  brute_force_time_ms: number;
  simulated_annealing_time_ms: number;
}

export interface ResilienceIndex {
  overall: number;
  breakdown: {
    queue_stability: number;
    emergency_readiness: number;
    network_balance: number;
    spillback_protection: number;
    signal_efficiency: number;
  };
}

export interface DecisionConfidence {
  percentage: number;
  status: string;
  reason: string;
}

export interface DecisionTimelineEvent {
  time: string;
  type: string;
  label: string;
  detail: string;
}

export interface JunctionPrediction {
  junction_id: string;
  horizon_s: number;
  current_queue?: number;
  predicted_queue?: number;
  queue_delta?: number;
  ns_current_queue: number;
  ew_current_queue: number;
  ns_projected_queue: number;
  ew_projected_queue: number;
  ns_pressure_pct: number;
  ew_pressure_pct: number;
  dominant_axis: string;
  predicted_queue_change: number;
  prediction_label: string;
  spillback_risk: string;
  spillback_s: number;
}

export interface ActiveExplanation {
  event: string;
  junction_id: string;
  junction_name: string;
  "1_what_happened": string;
  "2_where": string;
  "3_why": string;
  "4_prediction": string;
  "5_strategies_considered": string;
  "6_strategy_selected": string;
  "7_why_selected": string;
  "8_what_will_happen": string;
  "9_what_changed": string;
  "10_safety_validated": string;
  "11_expected_impact": string;
  factors: {
    vehicle_pressure_pct: number;
    queue_growth_pct: number;
    emergency_priority_pct: number;
    east_west_demand_pct: number;
    predicted_spillback: string;
  };
  decision_summary: string;
  reason_summary: string;
  timestamp: string;
}

export interface FrameData {
  simulation_id?: string;
  seq: number;
  sim_time: number;
  is_paused: boolean;
  speed: number;
  weather: string;
  fallback_level: string;
  corridor: CorridorState;
  resilience_index?: ResilienceIndex;
  decision_confidence?: DecisionConfidence;
  decision_timeline?: DecisionTimelineEvent[];
  active_explanation?: ActiveExplanation;
  metrics: {
    fixed: ControllerMetrics;
    rule: ControllerMetrics;
    hybrid: ControllerMetrics;
  };
  junctions: Record<string, JunctionState>;
  junctions_fixed: Record<string, JunctionState>;
  predictions?: Record<string, JunctionPrediction>;
  vehicles_hybrid: VehicleState[];
  vehicles_fixed: VehicleState[];
  ghost_vehicles?: Array<{ id: string; original_id: string; link: string; world_x: number; world_y: number; projected_pos: number; is_congested: boolean }>;
  links: LinkState[];
  shift_log: Array<{ time: string; text: string }>;
  solver_summary: SolverSummary | null;
}


