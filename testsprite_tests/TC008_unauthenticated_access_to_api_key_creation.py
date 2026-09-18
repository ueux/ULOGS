import requests
import sys

BASE_URL = "http://localhost:8080/api/v1"
ENDPOINT = f"{BASE_URL}/api-keys"
TIMEOUT = 30


def test_unauthenticated_access_to_api_key_creation_TC008():
    payload = {"name": "unauth-create-test"}  # minimal payload; server should reject due to lack of auth

    # Scenario 1: No authentication header
    try:
        resp = requests.post(ENDPOINT, json=payload, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Request failed (no-auth scenario): {e}")
    assert resp.status_code == 401, f"Expected 401 for no-auth request, got {resp.status_code}. Body: {resp.text}"

    # Scenario 2: Malformed Authorization header (missing token)
    headers_malformed_auth = {
        "Content-Type": "application/json",
        "Authorization": "Bearer"  # malformed, no token
    }
    try:
        resp2 = requests.post(ENDPOINT, json=payload, headers=headers_malformed_auth, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Request failed (malformed-auth scenario): {e}")
    assert resp2.status_code == 401, f"Expected 401 for malformed Authorization header, got {resp2.status_code}. Body: {resp2.text}"

    # Scenario 3: Invalid x-api-key header (empty or bogus key)
    headers_invalid_x_api_key = {
        "Content-Type": "application/json",
        "x-api-key": "invalid-or-empty-key"
    }
    try:
        resp3 = requests.post(ENDPOINT, json=payload, headers=headers_invalid_x_api_key, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Request failed (invalid x-api-key scenario): {e}")
    assert resp3.status_code == 401, f"Expected 401 for invalid x-api-key header, got {resp3.status_code}. Body: {resp3.text}"

    print("TC008 passed: unauthenticated API key creation requests returned 401 as expected.")


if __name__ == "__main__":
    try:
        test_unauthenticated_access_to_api_key_creation_TC008()
    except AssertionError as e:
        print(f"TC008 failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"TC008 encountered an unexpected error: {e}")
        sys.exit(2)
    sys.exit(0)