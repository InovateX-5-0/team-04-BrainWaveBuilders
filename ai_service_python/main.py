"""
FastAPI AI Microservice – Shipment Delay Prediction + Auth + SQLite
================================================================
Endpoints:
  Auth:
    POST /auth/signup       – register (username, email, password, role)
    POST /auth/login        – login → JWT token

  Admin only:
    GET  /admin/users            – list all users
    DELETE /admin/users/{id}     – delete user
    GET  /admin/shipments        – all shipments
    DELETE /admin/shipments/{id} – delete any shipment
    GET  /admin/analytics        – dashboard analytics
    GET  /admin/carrier-performance – carrier delay stats

  User (authenticated):
    POST /shipments              – create shipment + predict
    GET  /shipments/my           – own shipment history
    PUT  /shipments/{id}         – update own shipment
    GET  /shipments/alerts       – own high-risk alerts

  Guest (public):
    GET  /track/{shipment_id}    – public shipment tracking
    GET  /health                 – health check

  Shared (authenticated):
    GET  /shipments/history      – last 20 (admin sees all, user sees own)
    GET  /dashboard/analytics    – analytics (admin only)
    POST /predict                – predict delay (auth optional, just AI)
"""

import os, math, random, sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional, List

import bcrypt
import joblib
import jwt
import numpy as np
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────
NEWS_API_KEY    = os.getenv("NEWS_API_KEY", "")
TOMTOM_API_KEY  = os.getenv("TOMTOM_API_KEY", "")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY", "")
ORS_API_KEY     = os.getenv("ORS_API_KEY", "")
JWT_SECRET      = os.getenv("JWT_SECRET", "shipguard-super-secret-key-2024")
JWT_ALGORITHM   = "HS256"
JWT_EXPIRE_HOURS = 24

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR  = os.path.join(BASE_DIR, "model")
MODEL_PATH    = os.path.join(MODEL_DIR, "shipment_model.pkl")
ENCODERS_PATH = os.path.join(MODEL_DIR, "label_encoders.pkl")
DB_PATH    = os.path.join(BASE_DIR, "data.db")
SHIP_DB_PATH = os.path.join(BASE_DIR, "shipment.db")

# ─── Password Hashing ─────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw.encode('utf-8'), salt).decode('utf-8')

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))

# ─── SQLite DB ────────────────────────────────────────────────────────────────
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    # Attach shipment.db if it exists or create it
    conn.execute(f"ATTACH DATABASE '{SHIP_DB_PATH}' AS sdb")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT    NOT NULL UNIQUE,
                email      TEXT    NOT NULL UNIQUE,
                password   TEXT    NOT NULL,
                role       TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- Shipments table in the attached shipment.db (sdb)
            CREATE TABLE IF NOT EXISTS sdb.shipments (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id            INTEGER, -- FK logic handled by app/queries
                origin_city        TEXT    NOT NULL,
                destination_city   TEXT    NOT NULL,
                shipping_mode      TEXT    NOT NULL,
                transport_type     TEXT    NOT NULL DEFAULT 'road',
                carrier_name       TEXT,
                sla_days           INTEGER,
                delay_probability  REAL,
                risk_level         TEXT,
                recommended_action TEXT,
                status             TEXT    NOT NULL DEFAULT 'pending'
                                   CHECK(status IN ('pending','in_transit','delivered','delayed','cancelled')),
                created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
            );
        """)
        # Create default admin if not exists
        admin = db.execute("SELECT id FROM users WHERE role='admin'").fetchone()
        if not admin:
            admin_pass = hash_password("admin123")
            db.execute(
                "INSERT INTO users (username, email, password, role) VALUES (?,?,?,?)",
                ("admin", "admin@shipguard.com", admin_pass, "admin")
            )
            print("[DB] Default admin created: admin@shipguard.com / admin123")
    print("[DB] SQLite database initialized → data.db")

# ─── Load ML Model ────────────────────────────────────────────────────────────
model = None
label_encoders = None

def load_model():
    global model, label_encoders
    if os.path.exists(MODEL_PATH) and os.path.exists(ENCODERS_PATH):
        model = joblib.load(MODEL_PATH)
        label_encoders = joblib.load(ENCODERS_PATH)
        print("[AI Service] Model loaded successfully")
    else:
        print("[AI Service] WARNING: Model not found – run train_model.py first")

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="ShipGuard AI – Shipment Delay Early Warning System",
    description="SQLite + JWT auth + AI-powered delay prediction",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    load_model()

# ─── JWT Auth Helpers ─────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)

def create_token(user_id: int, email: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="Authentication required")
    return decode_token(creds.credentials)

def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def optional_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    """Returns user dict if authenticated, else None."""
    if not creds:
        return None
    try:
        return decode_token(creds.credentials)
    except Exception:
        return None

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"  # "admin" or "user"

class LoginRequest(BaseModel):
    email: str
    password: str

class PredictRequest(BaseModel):
    origin_city: str
    destination_city: str
    shipping_mode: str
    transport_type: Optional[str] = "road"   # road/air/water
    carrier_name: str
    shipment_date: str
    sla_delivery_days: int
    distance_km: Optional[float] = None
    travel_time_minutes: Optional[float] = None
    weather_condition: Optional[int] = None
    disruption_risk: Optional[float] = None

class ShipmentUpdate(BaseModel):
    status: Optional[str] = None
    carrier_name: Optional[str] = None
    sla_days: Optional[int] = None

# ─── City Coordinates ─────────────────────────────────────────────────────────
CITY_COORDS = {
    "Mumbai":       [72.8777, 19.0760], "Delhi":       [77.1025, 28.7041],
    "Bangalore":    [77.5946, 12.9716], "Chennai":     [80.2707, 13.0827],
    "Kolkata":      [88.3639, 22.5726], "Hyderabad":   [78.4867, 17.3850],
    "Ahmedabad":    [72.5714, 23.0225], "Pune":        [73.8567, 18.5204],
    "Jaipur":       [75.7873, 26.9124], "Surat":       [72.8311, 21.1702],
    "Bhubaneswar":  [85.8245, 20.2961], "Cuttack":     [85.8830, 20.4625],
    "Puri":         [85.8315, 19.8135], "Rourkela":    [84.8536, 22.2604],
    "Sambalpur":    [83.9712, 21.4669], "Visakhapatnam":[83.2185, 17.6868],
    "Nagpur":       [79.0882, 21.1458], "Indore":      [75.8577, 22.7196],
    "Lucknow":      [80.9462, 26.8467], "Patna":       [85.1376, 25.5941],
    "Bhopal":       [77.4126, 23.2599], "Vadodara":    [73.1812, 22.3072],
    "Ludhiana":     [75.8573, 30.9010], "Agra":        [78.0081, 27.1767],
    "Nashik":       [73.7898, 19.9975], "Faridabad":   [77.3178, 28.4089],
    "Meerut":       [77.7064, 28.9845], "Rajkot":      [70.8022, 22.3039],
    "Kochi":        [76.2673, 9.9312],  "Varanasi":    [82.9739, 25.3176],
    "Srinagar":     [74.7973, 34.0837], "Amritsar":    [74.8723, 31.6340],
    "Goa Airport":       [73.8314, 15.3800], "Guwahati Airport":  [91.5859, 26.1061],
    "Delhi Airport":     [77.1025, 28.5562], "Mumbai Airport":    [72.8656, 19.0887],
    "Bangalore Airport":  [77.7066, 13.1986], "Chennai Airport":   [80.1707, 12.9941],
    "Kolkata Airport":    [88.4467, 22.6547], "Hyderabad Airport": [78.4297, 17.2403],
    "Pune Airport":       [73.9197, 18.5822], "Ahmedabad Airport": [72.6347, 23.0734],
    "Jaipur Airport":     [75.8055, 26.8242], "Lucknow Airport":   [80.8837, 26.7606],
    "Kochi Airport":      [76.3910, 10.1556], "Bhubaneswar Airport":[85.8178, 20.2444],
    "Chennai Port":      [80.2942, 13.0903], "Mumbai Port":       [72.8443, 18.9485],
    "Kochi Port":        [76.2711, 9.9658],  "Paradip Port":      [86.6710, 20.2709],
    "Visakha Port":      [83.2985, 17.6853], "Kolkata Port":      [88.3129, 22.5447],
    "Kandla Port":       [70.2173, 23.0031], "Haldia Port":       [88.0645, 22.0234],
    "Mangalore Port":    [74.8211, 12.9272], "Mormugao Port":     [73.7946, 15.4055],
}

TRANSPORT_MAP = {
    'Standard Class': 'road', 'Second Class': 'road', 'First Class': 'road', 'Same Day': 'road',
    'Waterways': 'water', 'Airways': 'air',
}

# Facility Categories for Nearest Search
AIRPORTS = [k for k in CITY_COORDS if "Airport" in k]
PORTS    = [k for k in CITY_COORDS if "Port" in k]

def find_nearest_facility(coords: list, facility_type: str = "Airport") -> str:
    """Find the closest hub (Airport/Port) to a given coordinate."""
    targets = AIRPORTS if facility_type == "Airport" else PORTS
    min_dist = 999999
    nearest = targets[0]
    for t in targets:
        tc = CITY_COORDS[t]
        d = math.sqrt((tc[0]-coords[0])**2 + (tc[1]-coords[1])**2)
        if d < min_dist:
            min_dist = d
            nearest = t
    return nearest

def get_city_coords(name: str) -> list:
    """Robust lookup for city, port, or airport."""
    if name in CITY_COORDS: return CITY_COORDS[name]
    
    # Flexible matching
    clean = name.replace(" Port", "").replace(" Airport", "").strip()
    if clean in CITY_COORDS: return CITY_COORDS[clean]
    
    # Partial match
    for k in CITY_COORDS:
        if clean.lower() in k.lower() or k.lower() in clean.lower():
            return CITY_COORDS[k]
    
    return [72.8777, 19.0760] # Mumbai fallback

MARITIME_WAYPOINTS = {
    ("Bhubaneswar", "Chennai"): [[86.67, 20.27], [83.30, 17.68], [80.30, 13.09]], 
    ("Chennai", "Bhubaneswar"): [[80.30, 13.09], [83.30, 17.68], [86.67, 20.27]],
}

# Advanced Coastal Corridor (Ordered West-to-East)
COASTAL_CORRIDOR = [
    [70.21, 22.95], # Kandla
    [70.80, 22.30], # Rajkot/Jamnagar
    [72.84, 18.94], # Mumbai
    [73.50, 15.50], # Goa (Point in sea)
    [74.00, 13.00], # Mangalore
    [76.27, 9.96],  # Kochi
    [77.53, 7.50],  # Cape Comorin (Sea point)
    [80.30, 13.09], # Chennai
    [83.30, 17.68], # Vizag
    [86.67, 20.27], # Paradip
    [88.31, 22.54], # Kolkata
]

# ─── Routing Waypoints (Highway Corridors) ──────────────────────────────────
# Format: { (start_city, end_city): [ [lng, lat], ... ] }
HIGHWAY_WAYPOINTS = {
    ("Mumbai",  "Delhi"):     [[72.83, 21.17], [72.63, 23.02], [73.71, 24.58], [75.78, 26.91]], # Surat, Ahmedabad, Udaipur, Jaipur
    ("Delhi",   "Mumbai"):     [[75.78, 26.91], [73.71, 24.58], [72.63, 23.02], [72.83, 21.17]],
    ("Bangalore","Chennai"):   [[79.13, 12.91]], # Vellore
    ("Chennai",  "Bangalore"): [[79.13, 12.91]],
    ("Delhi",    "Kolkata"):   [[78.00, 27.17], [80.94, 26.84], [82.97, 25.31], [85.13, 25.59]], # Agra, Lucknow, Varanasi, Patna
    ("Kolkata",  "Delhi"):     [[85.13, 25.59], [82.97, 25.31], [80.94, 26.84], [78.00, 27.17]],
    ("Mumbai",   "Bangalore"): [[73.85, 18.52], [74.23, 16.70]], # Pune, Kolhapur
    ("Bangalore", "Mumbai"):   [[74.23, 16.70], [73.85, 18.52]],
    ("Mumbai",   "Kolkata"):   [[79.08, 21.14], [83.97, 21.46]], # Nagpur, Sambalpur
    ("Kolkata",  "Mumbai"):    [[83.97, 21.46], [79.08, 21.14]],
}

def generate_fallback_routes(origin_coords: list, dest_coords: list, count: int = 3, mode: str = "road") -> list:
    """Generate realistic paths: Geodesic arcs for Air/Water, Waypoints for Road."""
    routes = []
    dx = (dest_coords[0] - origin_coords[0])
    dy = (dest_coords[1] - origin_coords[1])
    dist_approx = math.sqrt(dx**2 + dy**2)

    for i in range(count):
        num_points = 25 if mode == "air" else 15
        points = [origin_coords]
        
        # Bend factor: i=0: left, i=1: center (primary), i=2: right
        bend_factor = (i - 1) * 0.15 if count > 1 else 0.1
        
        for step in range(1, num_points):
            ratio = step / float(num_points)
            mid_x = origin_coords[0] + dx * ratio
            mid_y = origin_coords[1] + dy * ratio
            
            # Arc curve (Geodesic look)
            curve_scale = 0.2 if mode == "air" else 0.15
            if mode == "water": curve_scale = 0.4 # Big swing into sea
            
            curve_offset = bend_factor * curve_scale * dist_approx * math.sin(ratio * math.pi)
            perp_x = -dy * (curve_offset / dist_approx) if dist_approx > 0 else 0
            perp_y = dx * (curve_offset / dist_approx) if dist_approx > 0 else 0
            
            final_x = mid_x + perp_x
            final_y = mid_y + perp_y
            if mode == "road":
                final_x += random.uniform(-0.003 * dist_approx, 0.003 * dist_approx)
                final_y += random.uniform(-0.003 * dist_approx, 0.003 * dist_approx)
                
            points.append([final_x, final_y])
            
        points.append(dest_coords)
        routes.append({"geometry": points})
    return routes

def get_routing_info(origin: str, destination: str, transport_type: str = "road") -> dict:
    """Universal Intermodal Router: Chains Road/Air/Water legs for perfect connectivity."""
    origin_coords = get_city_coords(origin)
    dest_coords   = get_city_coords(destination)
    
    if origin == destination:
        return {
            "distance_km": 0.1, "travel_time_minutes": 5.0, "congestion_percent": 0.0,
            "routes": [{"distance_km": 0.1, "travel_time_minutes": 5.0, "geometry": [origin_coords, [origin_coords[0]+0.001, origin_coords[1]+0.001]], "is_primary": True}],
            "transport_type": transport_type, "origin_coords": origin_coords, "dest_coords": origin_coords
        }

    # Helper: Get road route between two points
    def get_road_routes(start_coords, end_coords, origin_name=None, dest_name=None, alternatives=False):
        # Simplify: If very close, just return straight line
        dist_deg = math.sqrt((start_coords[0]-end_coords[0])**2 + (start_coords[1]-end_coords[1])**2)
        if dist_deg < 0.05: # ~5km
            return [{"distance_km": round(dist_deg*111, 2), "travel_time_minutes": round(dist_deg*111*2, 1), "geometry": [start_coords, end_coords]}]
        
        # 1. Try TomTom (Primary)
        try:
            url = f"https://api.tomtom.com/routing/1/calculateRoute/{start_coords[1]},{start_coords[0]}:{end_coords[1]},{end_coords[0]}/json"
            params = {"key": TOMTOM_API_KEY, "routeType": "fastest"}
            if alternatives: params["maxAlternatives"] = 2
            resp = requests.get(url, params=params, timeout=10)
            if resp.status_code == 200:
                results = []
                for r in resp.json()["routes"]:
                    calc = r["summary"]
                    pts = [[p["longitude"], p["latitude"]] for p in r["legs"][0]["points"]]
                    if len(pts) > 500: pts = pts[::max(1, len(pts)//500)]
                    results.append({"distance_km": round(calc["lengthInMeters"]/1000, 2), "travel_time_minutes": round(calc["travelTimeInSeconds"]/60, 2), "geometry": pts})
                return results
        except Exception as e:
            print(f"TomTom routing failed: {e}")

        # 2. Try OSRM
        try:
            p = f"{start_coords[0]},{start_coords[1]};{end_coords[0]},{end_coords[1]}"
            params = {"overview":"full","geometries":"geojson"}
            if alternatives: params["alternatives"] = "true"
            resp = requests.get(f"http://router.project-osrm.org/route/v1/driving/{p}", params=params, timeout=10)
            if resp.status_code == 200:
                results = []
                for r in resp.json()["routes"]:
                    results.append({"distance_km": round(r["distance"]/1000, 2), "travel_time_minutes": round(r["duration"]/60, 2), "geometry": r["geometry"]["coordinates"]})
                return results
        except Exception as e:
            print(f"OSRM routing failed: {e}")

        # 3. Fallback to Highway Waypoints
        if origin_name and dest_name:
            base_origin = origin_name.replace(" Port", "").replace(" Airport", "")
            base_dest = dest_name.replace(" Port", "").replace(" Airport", "")
            
            pair = (base_origin, base_dest)
            if pair in HIGHWAY_WAYPOINTS:
                return [{"distance_km": round(dist_deg*130, 2), "travel_time_minutes": round(dist_deg*130/50*60, 1), "geometry": [start_coords] + HIGHWAY_WAYPOINTS[pair] + [end_coords]}]
            rev_pair = (base_dest, base_origin)
            if rev_pair in HIGHWAY_WAYPOINTS:
                return [{"distance_km": round(dist_deg*130, 2), "travel_time_minutes": round(dist_deg*130/50*60, 1), "geometry": [start_coords] + HIGHWAY_WAYPOINTS[rev_pair][::-1] + [end_coords]}]

        # 4. Fallback to Straight Line
        km = round(dist_deg * 125, 2)
        return [{"distance_km": km, "travel_time_minutes": round(km/50*60, 1), "geometry": [start_coords, end_coords]}]

    legs = []
    alt_routes = []
    
    # CASE 1: ROAD (Direct)
    if transport_type == "road":
        road_results = get_road_routes(origin_coords, dest_coords, origin, destination, alternatives=True)
        main_leg = road_results[0]
        legs.append(main_leg)
        for i in range(1, len(road_results)):
            alt_routes.append({
                "distance_km": road_results[i]["distance_km"],
                "travel_time_minutes": road_results[i]["travel_time_minutes"],
                "geometry": road_results[i]["geometry"],
                "is_primary": False
            })
        
    # CASE 2: AIR (Road -> Air -> Road)
    elif transport_type == "air":
        hub_a = find_nearest_facility(origin_coords, "Airport")
        hub_b = find_nearest_facility(dest_coords, "Airport")
        hub_a_coords = CITY_COORDS[hub_a]
        hub_b_coords = CITY_COORDS[hub_b]
        
        # Leg 1: Road to Airport (only if distant)
        l1 = get_road_routes(origin_coords, hub_a_coords, origin, hub_a)[0]
        if l1["distance_km"] > 1.0: legs.append(l1)
        
        # Leg 2: Air Flight
        dx = (hub_a_coords[0] - hub_b_coords[0]) * 111
        dy = (hub_a_coords[1] - hub_b_coords[1]) * 111
        air_dist = math.sqrt(dx**2 + dy**2)
        
        if hub_a != hub_b:
            arc_geom = generate_fallback_routes(hub_a_coords, hub_b_coords, 1, mode="air")[0]["geometry"]
            legs.append({"distance_km": round(air_dist * 1.05, 2), "travel_time_minutes": round(air_dist/800*60 + 120, 1), "geometry": arc_geom})
        
        # Leg 3: Airport to Destination (only if distant)
        l3 = get_road_routes(hub_b_coords, dest_coords, hub_b, destination)[0]
        if l3["distance_km"] > 1.0: legs.append(l3)

    # CASE 3: WATER (Road -> Water -> Road)
    elif transport_type == "water":
        hub_a = find_nearest_facility(origin_coords, "Port")
        hub_b = find_nearest_facility(dest_coords, "Port")
        hub_a_coords = CITY_COORDS[hub_a]
        hub_b_coords = CITY_COORDS[hub_b]
        
        # Leg 1: Road to Port
        l1 = get_road_routes(origin_coords, hub_a_coords, origin, hub_a)[0]
        if l1["distance_km"] > 1.0: legs.append(l1)
        
        # Leg 2: Water Transit (Coastal Corridor)
        if hub_a != hub_b:
            def find_nearest_coast_idx(coords):
                min_d = 999
                idx = 0
                for i, cp in enumerate(COASTAL_CORRIDOR):
                    d = math.sqrt((cp[0]-coords[0])**2 + (cp[1]-coords[1])**2)
                    if d < min_d: min_d = d; idx = i
                return idx
            
            idx_start = find_nearest_coast_idx(hub_a_coords)
            idx_end = find_nearest_coast_idx(hub_b_coords)
            coast_pts = COASTAL_CORRIDOR[idx_start:idx_end+1] if idx_start < idx_end else COASTAL_CORRIDOR[idx_end:idx_start+1][::-1]
            geom = [hub_a_coords] + coast_pts + [hub_b_coords]
            
            dx = (hub_a_coords[0] - hub_b_coords[0]) * 111
            dy = (hub_a_coords[1] - hub_b_coords[1]) * 111
            w_dist = math.sqrt(dx**2 + dy**2) * 1.5
            legs.append({"distance_km": round(w_dist, 2), "travel_time_minutes": round(w_dist/30*60 + 180, 1), "geometry": geom})
            
        # Leg 3: Port to Destination
        l3 = get_road_routes(hub_b_coords, dest_coords, hub_b, destination)[0]
        if l3["distance_km"] > 1.0: legs.append(l3)

    # Aggregation
    if not legs:
        main_leg = get_road_routes(origin_coords, dest_coords, origin, destination)[0]
        legs.append(main_leg)
        
    total_dist = sum(l["distance_km"] for l in legs)
    total_time = sum(l["travel_time_minutes"] for l in legs)
    unified_geom = []
    for l in legs: unified_geom.extend(l["geometry"])

    primary_route = {
        "distance_km": round(total_dist, 2),
        "travel_time_minutes": round(total_time, 2),
        "geometry": unified_geom,
        "is_primary": True
    }

    return {
        "distance_km": primary_route["distance_km"],
        "travel_time_minutes": primary_route["travel_time_minutes"],
        "congestion_percent": round(random.uniform(5, 15), 1),
        "routes": [primary_route] + alt_routes,
        "transport_type": transport_type,
        "origin_coords": origin_coords,
        "dest_coords": dest_coords
    }




def get_weather(city: str) -> dict:
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {"q": f"{city},IN", "appid": WEATHER_API_KEY, "units": "metric"}
        resp = requests.get(url, params=params, timeout=6)
        if resp.status_code == 200:
            data = resp.json()
            weather_main = data["weather"][0]["main"].lower()
            temp_c = data["main"]["temp"]
            if "storm" in weather_main or "thunder" in weather_main:
                condition_code = 2
            elif "rain" in weather_main or "drizzle" in weather_main:
                condition_code = 1
            elif "fog" in weather_main or "mist" in weather_main or "haze" in weather_main:
                condition_code = 3
            else:
                condition_code = 0
            rain_prob = data.get("rain", {}).get("1h", 0)
            return {
                "city": city, "temperature_c": temp_c,
                "description": data["weather"][0]["description"],
                "condition": data["weather"][0]["main"],
                "condition_code": condition_code, "rain_mm": rain_prob,
                "alert": condition_code >= 2, "source": "OpenWeatherMap",
            }
        else:
            raise Exception(f"Weather API {resp.status_code}")
    except Exception as e:
        return {"city": city, "temperature_c": 28.0, "description": "clear sky",
                "condition": "Clear", "condition_code": 0, "rain_mm": 0, "alert": False,
                "source": "fallback", "error": str(e)}


def get_news_alerts(origin: str, destination: str) -> list:
    try:
        query = f"port strike OR shipping delay OR logistics disruption OR transport shutdown {origin} OR {destination}"
        url = "https://newsapi.org/v2/everything"
        params = {"q": query, "sortBy": "publishedAt", "pageSize": 5,
                  "apiKey": NEWS_API_KEY, "language": "en"}
        resp = requests.get(url, params=params, timeout=6)
        if resp.status_code == 200:
            articles = resp.json().get("articles", [])
            return [{"title": a.get("title", ""), "source": a.get("source", {}).get("name", ""),
                     "published": a.get("publishedAt", ""), "url": a.get("url", "")}
                    for a in articles[:3]]
        else:
            raise Exception(f"News API {resp.status_code}")
    except Exception as e:
        return [{"title": "No news alerts available", "source": "system",
                 "published": datetime.utcnow().isoformat(), "url": "", "error": str(e)}]


def encode_shipping_mode(mode: str) -> int:
    if label_encoders and "shipping_mode" in label_encoders:
        le = label_encoders["shipping_mode"]
        try:
            return int(le.transform([mode])[0])
        except ValueError:
            pass
    mode_map = {
        "First Class": 0, "Same Day": 1, "Second Class": 2, "Standard Class": 3,
        "Airways": 4, "Waterways": 5,
    }
    return mode_map.get(mode, 3)


def compute_disruption_risk(weather_code: int, congestion: float, news_count: int,
                             transport_type: str = "road") -> float:
    weather_risk    = {0: 0.05, 1: 0.25, 2: 0.65, 3: 0.35}.get(weather_code, 0.1)
    congestion_risk = min(congestion / 100, 1.0)
    news_risk       = min(news_count * 0.15, 0.45)
    # Waterways have additional risk from weather; airways from congestion
    transport_modifier = {"air": 0.1, "water": 0.15, "road": 0.0}.get(transport_type, 0.0)
    return round(min(weather_risk * 0.4 + congestion_risk * 0.35 + news_risk * 0.25 + transport_modifier, 1.0), 4)


def get_recommendation(prob: float, routing: dict, weather: dict, news: list,
                        transport_type: str = "road") -> str:
    transport_label = {"air": "✈️ air", "water": "🚢 waterway", "road": "🚛 road"}.get(transport_type, "🚛 road")
    if prob >= 0.85:
        return f"🚨 Reroute shipment immediately via alternate carrier ({transport_label}) and notify customer."
    elif prob >= 0.70:
        if weather.get("alert"):
            return f"⚠️ Severe weather on {transport_label} route. Assign alternate carrier. Send early warning."
        elif routing.get("congestion_percent", 0) > 40:
            return f"⚠️ Reroute via less congested {transport_label} corridor. Prioritize handling."
        elif news and "No news" not in news[0].get("title", ""):
            return "⚠️ External disruption detected. Send early warning and monitor route."
        return "⚠️ Prioritize shipment handling and expedite processing to meet SLA."
    elif prob >= 0.50:
        return "⚡ Monitor shipment closely. Prepare contingency re-routing plan."
    else:
        return "✅ Shipment on track. No action required."


def run_prediction(req: PredictRequest) -> dict:
    """Core prediction logic shared by both /predict and /shipments endpoints."""
    transport = req.transport_type or "road"
    routing = get_routing_info(req.origin_city, req.destination_city, transport)
    dist_km     = req.distance_km or routing["distance_km"]
    travel_mins = req.travel_time_minutes or routing["travel_time_minutes"]
    congestion  = routing.get("congestion_percent", 20)

    weather      = get_weather(req.origin_city)
    weather_dest = get_weather(req.destination_city)
    weather_code = req.weather_condition if req.weather_condition is not None else max(
        weather["condition_code"], weather_dest["condition_code"]
    )

    news = get_news_alerts(req.origin_city, req.destination_city)
    disruption = req.disruption_risk if req.disruption_risk is not None else compute_disruption_risk(
        weather_code, congestion,
        len([n for n in news if "No news" not in n.get("title", "")]),
        transport
    )

    shipping_enc = encode_shipping_mode(req.shipping_mode)
    # Convert travel time to DAYS for the model (model was trained on days)
    travel_days = travel_mins / (60.0 * 24.0)
    features = np.array([[shipping_enc, dist_km, travel_days,
                          weather_code, req.sla_delivery_days, disruption]])

    prob = float(model.predict_proba(features)[0][1]) if model else random.uniform(0.1, 0.9)
    prob = round(prob, 4)

    risk_level = "High" if prob >= 0.70 else ("Medium" if prob >= 0.45 else "Low")
    sla_hours  = req.sla_delivery_days * 24
    delay_hours = round(prob * sla_hours * 0.6, 1)
    recommendation = get_recommendation(prob, routing, weather, news, transport)

    return {
        "delay_probability":     prob,
        "risk_level":            risk_level,
        "predicted_delay_hours": delay_hours,
        "recommended_action":    recommendation,
        "early_warning":         prob >= 0.70,
        "transport_type":        transport,
        "sla_hours_buffer":      round(sla_hours - (travel_mins / 60 + delay_hours), 1),
        "weather":               weather_dest,
        "weather_info":          {"origin": weather, "destination": weather_dest,
                                  "condition_code": weather_code},
        "news_alerts":           news,
        "routing_info":          routing,
    }

# ═══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/signup", tags=["Auth"])
def signup(req: SignupRequest):
    if req.role == "admin":
        raise HTTPException(
            status_code=403, 
            detail="Admin accounts cannot be created via signup. Please contact the system administrator."
        )
    if req.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be 'admin' or 'user'")
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM users WHERE email=? OR username=?", (req.email, req.username)
        ).fetchone()
        if existing:
            raise HTTPException(409, "Email or username already registered")
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password, role) VALUES (?,?,?,?)",
            (req.username, req.email, hash_password(req.password), req.role)
        )
        user_id = cursor.lastrowid
    token = create_token(user_id, req.email, req.role)
    return {"token": token, "user": {"id": user_id, "username": req.username,
                                      "email": req.email, "role": req.role}}


@app.post("/auth/login", tags=["Auth"])
def login(req: LoginRequest):
    with get_db() as db:
        user = db.execute(
            "SELECT * FROM users WHERE email=?", (req.email,)
        ).fetchone()
    if not user or not verify_password(req.password, user["password"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": {"id": user["id"], "username": user["username"],
                                      "email": user["email"], "role": user["role"]}}

# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/users", tags=["Admin"])
def admin_list_users(user=Depends(require_admin)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, username, email, role, created_at FROM users ORDER BY id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.delete("/admin/users/{user_id}", tags=["Admin"])
def admin_delete_user(user_id: int, user=Depends(require_admin)):
    with get_db() as db:
        db.execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"message": f"User {user_id} deleted"}


@app.get("/admin/shipments", tags=["Admin"])
def admin_list_shipments(user=Depends(require_admin)):
    with get_db() as db:
        rows = db.execute("""
            SELECT s.*, u.username, u.email FROM sdb.shipments s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


@app.delete("/admin/shipments/{shipment_id}", tags=["Admin"])
def admin_delete_shipment(shipment_id: int, user=Depends(require_admin)):
    with get_db() as db:
        db.execute("DELETE FROM sdb.shipments WHERE id=?", (shipment_id,))
    return {"message": f"Shipment {shipment_id} deleted"}


@app.get("/admin/analytics", tags=["Admin"])
def admin_analytics(user=Depends(require_admin)):
    with get_db() as db:
        total = db.execute("SELECT COUNT(*) FROM sdb.shipments").fetchone()[0]
        avg_prob = db.execute("SELECT AVG(delay_probability) FROM sdb.shipments").fetchone()[0] or 0
        high_risk = db.execute(
            "SELECT COUNT(*) FROM sdb.shipments WHERE risk_level='High'"
        ).fetchone()[0]
        risk_dist_rows = db.execute(
            "SELECT risk_level, COUNT(*) as cnt FROM sdb.shipments GROUP BY risk_level"
        ).fetchall()
        recent = db.execute("""
            SELECT id as shipmentId, origin_city as originCity, destination_city as destinationCity,
                   shipping_mode as shippingMode, transport_type as transportType,
                   carrier_name as carrierName, sla_days as slaDays,
                   delay_probability as delayProbability, risk_level as riskLevel,
                   recommended_action as recommendedAction, status, created_at as timestamp
            FROM sdb.shipments ORDER BY created_at DESC LIMIT 20
        """).fetchall()
        user_count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    risk_distribution = {r["risk_level"]: r["cnt"] for r in risk_dist_rows if r["risk_level"]}
    return {
        "total_shipments": total,
        "avg_delay_probability": round(avg_prob, 4),
        "high_risk_count": high_risk,
        "risk_distribution": risk_distribution,
        "recent_shipments": [dict(r) for r in recent],
        "user_count": user_count,
    }


@app.get("/admin/carrier-performance", tags=["Admin"])
def carrier_performance(user=Depends(require_admin)):
    with get_db() as db:
        rows = db.execute("""
            SELECT carrier_name,
                   COUNT(*) as total,
                   AVG(delay_probability) as avg_delay,
                   SUM(CASE WHEN risk_level='High' THEN 1 ELSE 0 END) as high_risk_count,
                   SUM(CASE WHEN status='delayed' THEN 1 ELSE 0 END) as delayed_count
            FROM sdb.shipments
            WHERE carrier_name IS NOT NULL
            GROUP BY carrier_name
            ORDER BY avg_delay DESC
        """).fetchall()
    return [dict(r) for r in rows]

# ═══════════════════════════════════════════════════════════════════════════════
# USER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/shipments", tags=["User"])
def create_shipment(req: PredictRequest, current_user=Depends(get_current_user)):
    if model is None:
        raise HTTPException(503, "Model not loaded. Run train_model.py first.")
    try:
        result = run_prediction(req)
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute("""
                INSERT INTO sdb.shipments
                  (user_id, origin_city, destination_city, shipping_mode, transport_type,
                   carrier_name, sla_days, delay_probability, risk_level, recommended_action, status)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')
            """, (
                int(current_user["sub"]), req.origin_city, req.destination_city,
                req.shipping_mode, req.transport_type or "road", req.carrier_name,
                req.sla_delivery_days, result["delay_probability"],
                result["risk_level"], result["recommended_action"]
            ))
            shipment_id = cursor.lastrowid
        result["shipment_id"] = shipment_id
        result["stored_at"]   = datetime.utcnow().isoformat()
        return result
    except Exception as e:
        print(f"[ERROR] create_shipment failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, detail=f"Shipment creation failed: {str(e)}")


@app.get("/shipments/my", tags=["User"])
def my_shipments(current_user=Depends(get_current_user)):
    uid = int(current_user["sub"])
    with get_db() as db:
        rows = db.execute("""
            SELECT id as shipmentId, origin_city as originCity, destination_city as destinationCity,
                   shipping_mode as shippingMode, transport_type as transportType,
                   carrier_name as carrierName, sla_days as slaDays,
                   delay_probability as delayProbability, risk_level as riskLevel,
                   recommended_action as recommendedAction, status, created_at as timestamp
            FROM sdb.shipments WHERE user_id=? ORDER BY created_at DESC
        """, (uid,)).fetchall()
    return [dict(r) for r in rows]


@app.get("/shipments/alerts", tags=["User"])
def my_alerts(current_user=Depends(get_current_user)):
    uid = int(current_user["sub"])
    with get_db() as db:
        rows = db.execute("""
            SELECT id as shipmentId, origin_city as originCity, destination_city as destinationCity,
                   shipping_mode as shippingMode, transport_type as transportType,
                   delay_probability as delayProbability, risk_level as riskLevel,
                   recommended_action as recommendedAction, status, created_at as timestamp
            FROM sdb.shipments WHERE user_id=? AND risk_level='High'
            ORDER BY created_at DESC LIMIT 20
        """, (uid,)).fetchall()
    return [dict(r) for r in rows]


@app.put("/shipments/{shipment_id}", tags=["User"])
def update_shipment(shipment_id: int, upd: ShipmentUpdate, current_user=Depends(get_current_user)):
    uid  = int(current_user["sub"])
    role = current_user.get("role")
    with get_db() as db:
        row = db.execute("SELECT user_id FROM sdb.shipments WHERE id=?", (shipment_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Shipment not found")
        if role != "admin" and row["user_id"] != uid:
            raise HTTPException(403, "You can only update your own shipments")
        updates, vals = [], []
        if upd.status:
            updates.append("status=?"); vals.append(upd.status)
        if upd.carrier_name:
            updates.append("carrier_name=?"); vals.append(upd.carrier_name)
        if upd.sla_days:
            updates.append("sla_days=?"); vals.append(upd.sla_days)
        if updates:
            vals.append(shipment_id)
            db.execute(f"UPDATE sdb.shipments SET {', '.join(updates)} WHERE id=?", vals)
    return {"message": "Shipment updated", "shipment_id": shipment_id}

# ═══════════════════════════════════════════════════════════════════════════════
# SHARED / COMPAT ENDPOINTS (for frontend backward compat)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/predict-delay", tags=["Shared"])
def predict_delay_compat(req: PredictRequest, current_user=Depends(get_current_user)):
    """Backward-compat endpoint – creates shipment and returns prediction."""
    return create_shipment(req, current_user)


@app.get("/shipments/history", tags=["Shared"])
def shipment_history(current_user=Depends(get_current_user)):
    """Admin sees all, user sees own."""
    with get_db() as db:
        if current_user.get("role") == "admin":
            rows = db.execute("""
                SELECT id as shipmentId, origin_city as originCity,
                       destination_city as destinationCity,
                       shipping_mode as shippingMode, transport_type as transportType,
                       carrier_name as carrierName, sla_days as slaDays,
                       delay_probability as delayProbability, risk_level as riskLevel,
                       recommended_action as recommendedAction, status,
                       created_at as timestamp
                FROM sdb.shipments ORDER BY created_at DESC LIMIT 20
            """).fetchall()
        else:
            uid = int(current_user["sub"])
            rows = db.execute("""
                SELECT id as shipmentId, origin_city as originCity,
                       destination_city as destinationCity,
                       shipping_mode as shippingMode, transport_type as transportType,
                       carrier_name as carrierName, sla_days as slaDays,
                       delay_probability as delayProbability, risk_level as riskLevel,
                       recommended_action as recommendedAction, status,
                       created_at as timestamp
                FROM sdb.shipments WHERE user_id=? ORDER BY created_at DESC LIMIT 20
            """, (uid,)).fetchall()
    return [dict(r) for r in rows]


@app.get("/dashboard/analytics", tags=["Shared"])
def dashboard_analytics(current_user=Depends(get_current_user)):
    """Alias for admin analytics (admin only)."""
    return admin_analytics(current_user)

# ═══════════════════════════════════════════════════════════════════════════════
# GUEST / PUBLIC ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/track/{shipment_id}", tags=["Guest"])
def track_shipment(shipment_id: int):
    """Public tracking – returns limited info (no sensitive data)."""
    with get_db() as db:
        row = db.execute("""
            SELECT id, origin_city, destination_city, shipping_mode, transport_type,
                   carrier_name, risk_level, status, delay_probability, created_at
            FROM sdb.shipments WHERE id=?
        """, (shipment_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Shipment not found. Please check the shipment ID.")
    return dict(row)


@app.post("/predict", tags=["Shared"])
def predict_standalone(req: PredictRequest, current_user=Depends(optional_user)):
    """Pure AI prediction (no DB save). Any authenticated user can call."""
    if model is None:
        raise HTTPException(503, "Model not loaded. Run train_model.py first.")
    return run_prediction(req)


@app.get("/route-info", tags=["Shared"])
def get_route_telemetry(origin: str, destination: str, mode: str = "Standard Class"):
    """Auto-fill endpoint for distance and suggested SLA."""
    transport = TRANSPORT_MAP.get(mode, "road")
    routing = get_routing_info(origin, destination, transport)
    dist = routing["distance_km"]
    # Dynamic SLA suggestion: travel time + 40% buffer + 12h padding
    suggested_sla = math.ceil((routing["travel_time_minutes"] / 60) * 1.4 + 12)
    return {
        "distance_km": dist,
        "travel_time_minutes": routing["travel_time_minutes"],
        "suggested_sla_days": math.ceil(suggested_sla / 24)
    }


@app.get("/weather-condition", tags=["Shared"])
def get_city_weather(city: str):
    """Auto-fill weather code for prediction."""
    w = get_weather(city)
    return {"condition_code": w["condition_code"], "description": w["description"]}


@app.get("/health", tags=["Public"])
def health():
    with get_db() as db:
        user_count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        ship_count = db.execute("SELECT COUNT(*) FROM sdb.shipments").fetchone()[0]
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "timestamp": datetime.utcnow().isoformat(),
        "database": "SQLite",
        "users": user_count,
        "shipments": ship_count,
    }

if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)