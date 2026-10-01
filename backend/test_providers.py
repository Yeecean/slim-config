import urllib.request
import json

def test_providers_api():
    url = "http://127.0.0.1:8080/api/providers"
    print(f"Testing API endpoint: {url}")
    
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status != 200:
                raise Exception(f"Failed with status code {response.status}")
                
            body = response.read().decode('utf-8')
            data = json.loads(body)
            
            assert data.get("ok") is True, "API response 'ok' should be True"
            providers = data.get("data", {}).get("providers", [])
            
            provider_names = [p.get("name") for p in providers]
            print(f"Found {len(providers)} providers: {', '.join(provider_names)}")
            
            # Assert we have more than 2 providers (meaning the fix is working)
            assert len(providers) > 2, f"Expected more than 2 providers, but got {len(providers)}. The bug is still present!"
            
            # Assert specific known native providers exist
            expected_providers = ["Zhipuai", "Deepseek", "Lmstudio"]
            for ep in expected_providers:
                assert ep in provider_names, f"Missing expected native provider: {ep}"
                
            print("\n[PASS] All tests passed! The provider aggregation logic is working perfectly.")
            
    except Exception as e:
        print(f"\n[FAIL] Test failed: {e}")
        exit(1)

if __name__ == "__main__":
    test_providers_api()
