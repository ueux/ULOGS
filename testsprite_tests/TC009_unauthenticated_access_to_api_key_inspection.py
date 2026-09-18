import requests
import uuid
import sys

BASE_ENDPOINT = "http://localhost:8080/api/v1"
TIMEOUT = 30

def test_unauthenticated_access_to_api_key_inspection_tc009():
    """
    TC009: Verify that accessing GET /api/v1/api-keys/:id without authentication
    or with an invalid token returns a 401 Unauthorized response.
    """
    resource_id = str(uuid.uuid4())
    url = f"{BASE_ENDPOINT}/api-keys/{resource_id}"

    results = []

    # Case 1: No Authorization header
    try:
        resp = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        print(f"ERROR: Unauthenticated request to {url} failed with exception: {e}")
        raise

    try:
        assert resp.status_code == 401, (
            f"TC009 FAILED (no auth): expected status 401, got {resp.status_code}. Response body: {resp.text}"
        )
        results.append(("no_auth", resp.status_code))
        print(f"TC009 PASSED (no auth): received 401 as expected.")
    except AssertionError:
        print(f"TC009 FAILED (no auth): expected 401, got {resp.status_code}. Response body: {resp.text}")
        raise

    # Case 2: Invalid Bearer token
    invalid_bearer_headers = {"Authorization": "Bearer invalid_token_value"}
    try:
        resp2 = requests.get(url, headers=invalid_bearer_headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        print(f"ERROR: Invalid-bearer request to {url} failed with exception: {e}")
        raise

    try:
        assert resp2.status_code == 401, (
            f"TC009 FAILED (invalid bearer): expected status 401, got {resp2.status_code}. Response body: {resp2.text}"
        )
        results.append(("invalid_bearer", resp2.status_code))
        print(f"TC009 PASSED (invalid bearer): received 401 as expected.")
    except AssertionError:
        print(f"TC009 FAILED (invalid bearer): expected 401, got {resp2.status_code}. Response body: {resp2.text}")
        raise

    # Additionally check invalid x-api-key header (service may accept x-api-key as auth)
    invalid_x_api_key_headers = {"x-api-key": "invalid_key_value"}
    try:
        resp3 = requests.get(url, headers=invalid_x_api_key_headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        print(f"ERROR: Invalid x-api-key request to {url} failed with exception: {e}")
        raise

    try:
        assert resp3.status_code == 401, (
            f"TC009 FAILED (invalid x-api-key): expected status 401, got {resp3.status_code}. Response body: {resp3.text}"
        )
        results.append(("invalid_x_api_key", resp3.status_code))
        print(f"TC009 PASSED (invalid x-api-key): received 401 as expected.")
    except AssertionError:
        print(f"TC009 FAILED (invalid x-api-key): expected 401, got {resp3.status_code}. Response body: {resp3.text}")
        raise

    print("TC009 SUMMARY:", results)
    return True

if __name__ == "__main__":
    try:
        test_unauthenticated_access_to_api_key_inspection_tc009()
        print("TC009 completed successfully.")
        sys.exit(0)
    except AssertionError as ae:
        print("AssertionError:", ae)
        sys.exit(2)
    except Exception as e:
        print("Unexpected error during TC009:", e)
        sys.exit(1)