import requests
import os
from dotenv import load_dotenv

load_dotenv()

KEY = os.getenv("TOMTOM_API_KEY") # User referred to it as TomTom, but testing as GraphHopper
print(f"Testing as GraphHopper with Key: {KEY[:6]}...")

# Mumbai to Delhi
# lat,lon
p1 = "19.0760,72.8777"
p2 = "28.7041,77.1025"
url = f"https://graphhopper.com/api/1/route"
params = {
    "point": [p1, p2],
    "vehicle": "car",
    "locale": "en",
    "key": KEY,
    "type": "json",
    "points_encoded": "false"
}

try:
    resp = requests.get(url, params=params, timeout=10)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("Success! It's a GraphHopper key.")
        data = resp.json()
        path = data["paths"][0]
        print(f"Distance: {path['distance']/1000:.2f} km")
        print(f"Time: {path['time']/60000:.1f} minutes")
    else:
        print("Error details:")
        print(resp.text)
except Exception as e:
    print(f"Request failed: {e}")
