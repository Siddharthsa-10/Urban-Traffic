import time
from typing import Dict, List, Any, Optional
import pymongo
from pymongo.errors import PyMongoError


class DatabaseService:
    def __init__(self, uri: str = "mongodb://localhost:27017/", db_name: str = "traffic_digital_twin"):
        self.uri = uri
        self.db_name = db_name
        self.client: Optional[pymongo.MongoClient] = None
        self.db: Optional[Any] = None
        self.is_connected = False
        
        # Local fallback in-memory store
        self.memory_store: Dict[str, List[Dict[str, Any]]] = {
            "traffic_events": [],
            "optimization_runs": [],
            "decision_logs": [],
            "analytics_snapshots": [],
            "simulation_sessions": [],
        }
        
        self.connect()

    def connect(self):
        try:
            self.client = pymongo.MongoClient(self.uri, serverSelectionTimeoutMS=1500)
            # Force server check
            self.client.server_info()
            self.db = self.client[self.db_name]
            self.is_connected = True
            print(f"[DB] Successfully connected to MongoDB at {self.uri} ({self.db_name})")
            self._ensure_indexes()
        except Exception as e:
            self.is_connected = False
            print(f"[DB] MongoDB not reachable ({e}). Operating in resilient local memory cache mode.")

    def _ensure_indexes(self):
        if not self.is_connected or self.db is None:
            return
        try:
            self.db.traffic_events.create_index([("created_at", pymongo.DESCENDING)])
            self.db.optimization_runs.create_index([("created_at", pymongo.DESCENDING)])
            self.db.decision_logs.create_index([("created_at", pymongo.DESCENDING)])
            self.db.analytics_snapshots.create_index([("created_at", pymongo.ASCENDING)])
            self.db.analytics_snapshots.create_index([("simulation_id", pymongo.ASCENDING)])
            self.db.simulation_sessions.create_index([("simulation_id", pymongo.ASCENDING)], unique=True)
        except Exception as e:
            print(f"[DB] Index creation notice: {e}")

    def log_event(self, event_data: Dict[str, Any]) -> str:
        record = {
            **event_data,
            "timestamp": event_data.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S")),
            "created_at": time.time()
        }
        if self.is_connected and self.db is not None:
            try:
                res = self.db.traffic_events.insert_one(record)
                return str(res.inserted_id)
            except Exception as e:
                print(f"[DB] Insert event error: {e}")
        
        record["_id"] = f"evt_{int(time.time()*1000)}"
        self.memory_store["traffic_events"].append(record)
        return record["_id"]

    def log_optimization_run(self, opt_data: Dict[str, Any]) -> str:
        record = {
            **opt_data,
            "timestamp": opt_data.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S")),
            "created_at": time.time()
        }
        if self.is_connected and self.db is not None:
            try:
                res = self.db.optimization_runs.insert_one(record)
                return str(res.inserted_id)
            except Exception as e:
                print(f"[DB] Insert optimization error: {e}")
        
        record["_id"] = f"opt_{int(time.time()*1000)}"
        self.memory_store["optimization_runs"].append(record)
        return record["_id"]

    def log_decision(self, decision_data: Dict[str, Any]) -> str:
        record = {
            **decision_data,
            "timestamp": decision_data.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S")),
            "created_at": time.time()
        }
        if self.is_connected and self.db is not None:
            try:
                res = self.db.decision_logs.insert_one(record)
                return str(res.inserted_id)
            except Exception as e:
                print(f"[DB] Insert decision error: {e}")
        
        record["_id"] = f"dec_{int(time.time()*1000)}"
        self.memory_store["decision_logs"].append(record)
        return record["_id"]

    def log_analytics_snapshot(self, snapshot: Dict[str, Any]) -> str:
        record = {
            **snapshot,
            "timestamp": snapshot.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S")),
            "created_at": time.time()
        }
        if self.is_connected and self.db is not None:
            try:
                res = self.db.analytics_snapshots.insert_one(record)
                return str(res.inserted_id)
            except Exception as e:
                print(f"[DB] Insert snapshot error: {e}")
        
        record["_id"] = f"snap_{int(time.time()*1000)}"
        self.memory_store["analytics_snapshots"].append(record)
        if len(self.memory_store["analytics_snapshots"]) > 500:
            self.memory_store["analytics_snapshots"].pop(0)
        return record["_id"]

    def save_simulation_session(self, session_data: Dict[str, Any]):
        sid = session_data.get("simulation_id")
        if not sid:
            return
        record = {
            **session_data,
            "updated_at": time.time()
        }
        if self.is_connected and self.db is not None:
            try:
                self.db.simulation_sessions.update_one(
                    {"simulation_id": sid},
                    {"$set": record},
                    upsert=True
                )
                return
            except Exception as e:
                print(f"[DB] Save session error: {e}")

        # Memory store fallback
        for idx, s in enumerate(self.memory_store["simulation_sessions"]):
            if s.get("simulation_id") == sid:
                self.memory_store["simulation_sessions"][idx] = record
                return
        self.memory_store["simulation_sessions"].append(record)

    def get_simulation_sessions(self, limit: int = 20) -> List[Dict[str, Any]]:
        if self.is_connected and self.db is not None:
            try:
                cursor = self.db.simulation_sessions.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
                return list(cursor)
            except Exception as e:
                print(f"[DB] Fetch sessions error: {e}")

        items = sorted(self.memory_store["simulation_sessions"], key=lambda x: x.get("created_at", 0), reverse=True)
        return [{k: v for k, v in item.items() if k != "_id"} for item in items[:limit]]

    def get_decisions_count(self, simulation_id: Optional[str] = None) -> int:
        if self.is_connected and self.db is not None:
            try:
                q = {"simulation_id": simulation_id} if simulation_id else {}
                return self.db.decision_logs.count_documents(q)
            except Exception as e:
                print(f"[DB] Count decisions error: {e}")
        if simulation_id:
            return sum(1 for d in self.memory_store["decision_logs"] if d.get("simulation_id") == simulation_id)
        return len(self.memory_store["decision_logs"])

    def get_events_count(self, simulation_id: Optional[str] = None) -> int:
        if self.is_connected and self.db is not None:
            try:
                q = {"simulation_id": simulation_id} if simulation_id else {}
                return self.db.traffic_events.count_documents(q)
            except Exception as e:
                print(f"[DB] Count events error: {e}")
        if simulation_id:
            return sum(1 for e in self.memory_store["traffic_events"] if e.get("simulation_id") == simulation_id)
        return len(self.memory_store["traffic_events"])

    def get_recent_decisions(self, limit: int = 50) -> List[Dict[str, Any]]:
        if self.is_connected and self.db is not None:
            try:
                cursor = self.db.decision_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
                return list(cursor)
            except Exception as e:
                print(f"[DB] Fetch decisions error: {e}")
        
        items = sorted(self.memory_store["decision_logs"], key=lambda x: x.get("created_at", 0), reverse=True)
        return [{k: v for k, v in item.items() if k != "_id"} for item in items[:limit]]

    def get_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        if self.is_connected and self.db is not None:
            try:
                cursor = self.db.traffic_events.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
                return list(cursor)
            except Exception as e:
                print(f"[DB] Fetch events error: {e}")
        
        items = sorted(self.memory_store["traffic_events"], key=lambda x: x.get("created_at", 0), reverse=True)
        return [{k: v for k, v in item.items() if k != "_id"} for item in items[:limit]]

    def save_simulation_run(self, run_record: Dict[str, Any]):
        sid = run_record.get("simulationId") or run_record.get("simulation_id")
        record = {
            **run_record,
            "created_at": time.time()
        }
        if self.is_connected and self.db is not None:
            try:
                self.db.simulation_runs.update_one(
                    {"simulationId": sid},
                    {"$set": record},
                    upsert=True
                )
                return
            except Exception as e:
                print(f"[DB] Save simulation run error: {e}")
        self.memory_store.setdefault("simulation_runs", []).append(record)

    def get_analytics_history(self, simulation_id: Optional[str] = None, limit: int = 120) -> List[Dict[str, Any]]:
        """Queries time series snapshots filtered by simulation_id or latest session (Part A14)."""
        query = {"simulation_id": simulation_id} if simulation_id else {}
        if self.is_connected and self.db is not None:
            try:
                cursor = self.db.analytics_snapshots.find(query, {"_id": 0}).sort("created_at", 1).limit(limit)
                results = list(cursor)
                if results:
                    return results
                # If filtered query returned empty, return latest overall
                if simulation_id:
                    cursor = self.db.analytics_snapshots.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
                    return list(reversed(list(cursor)))
            except Exception as e:
                print(f"[DB] Fetch analytics error: {e}")
        
        if simulation_id:
            items = [s for s in self.memory_store["analytics_snapshots"] if s.get("simulation_id") == simulation_id]
            if items:
                return [{k: v for k, v in item.items() if k != "_id"} for item in items[-limit:]]

        items = sorted(self.memory_store["analytics_snapshots"], key=lambda x: x.get("created_at", 0))
        return [{k: v for k, v in item.items() if k != "_id"} for item in items[-limit:]]


db_service = DatabaseService()
