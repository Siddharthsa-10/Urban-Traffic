from abc import ABC, abstractmethod
from typing import Dict, Any, List
from ..junction import Junction
from ..network import CityNetwork


class BaseController(ABC):
    def __init__(self, name: str, controller_type: str):
        self.name = name
        self.controller_type = controller_type
        self.total_plan_changes: int = 0
        self.last_decision_epoch: float = 0.0

    @abstractmethod
    def update(
        self,
        sim_time: float,
        dt: float,
        junctions: Dict[str, Junction],
        network: CityNetwork,
    ):
        pass

    def reset(self):
        self.total_plan_changes = 0
        self.last_decision_epoch = 0.0
