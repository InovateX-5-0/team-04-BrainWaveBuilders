import requests
import os
from dotenv import load_dotenv

load_dotenv()

KEY = os.getenv("TOMTOM_API_KEY") 
print(f"Testing as Mappls with Key: {KEY[:6]}...")

# Mumbai to Delhi
# lon,lat;lon,lat
p1 = "72.8777,19.0760"
p2 = "77.1025,28.7041"
url = f"https://apis.mappls.com/advancedmaps/v1/{KEY}/route_adv/driving/{p1};{p2}"

try:
    # Testing both as REST_KEY in URL and as access_token param
    resp = requests.get(url, timeout=10)
    print(f"Status (REST_KEY in URL): {resp.status_code}")
    if resp.status_code == 200:
        print("Success! It's a Mappls key.")
    else:
        # Try as access_token
        url2 = f"https://apis.mappls.com/advancedmaps/v1/route_adv/driving/{p1};{p2}"
        resp2 = requests.get(url2, params={"access_token": KEY}, timeout=10)
        print(f"Status (access_token param): {resp2.status_code}")
        if resp2.status_code == 200:
             print("Success! It's a Mappls access_token.")
except Exception as e:
    print(f"Request failed: {e}")
