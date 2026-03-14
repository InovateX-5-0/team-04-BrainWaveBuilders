import requests

def test_routing():
    url = "http://localhost:8000/predict"
    payload = {
        "origin_city": "Bhubaneswar",
        "destination_city": "Chennai Airport",
        "shipping_mode": "Waterways",
        "carrier_name": "Shipping Corp of India",
        "shipment_date": "2026-03-13",
        "sla_delivery_days": 5
    }
    
    print(f"Testing routing from {payload['origin_city']} to {payload['destination_city']}...")
    try:
        resp = requests.post(url, json=payload)
        if resp.status_code == 200:
            data = resp.json()
            routing = data.get("routing_info", {})
            origin = routing.get("origin_coords")
            dest = routing.get("dest_coords")
            dist = routing.get("distance_km")
            
            print(f"Success!")
            print(f"Origin Coords: {origin} (Expected Bhubaneswar ~[85.82, 20.29])")
            print(f"Dest Coords: {dest} (Expected Chennai ~[80.27, 13.08])")
            print(f"Distance: {dist} km")
            
            primary_route = next((r for r in routing.get("routes", []) if r.get("is_primary")), None)
            if primary_route:
                geom_len = len(primary_route.get("geometry", []))
                print(f"Primary Route Geometry Points: {geom_len} (Expected > 2 for waypoints)")
            else:
                print("No primary route found!")
        else:
            print(f"Error: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_routing()
