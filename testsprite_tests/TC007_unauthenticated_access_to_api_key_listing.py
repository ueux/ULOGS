import requests
import sys

BASE_ENDPOINT = "http://localhost:8080/api/v1"
TIMEOUT = 30

def test_unauthenticated_access_to_api_key_listing():
    """
    TC007: Verify that accessing GET /api/v1/api-keys without authentication returns 401 Unauthorized.
    """
    url = f"{BASE_ENDPOINT}/api-keys"
    headers = {}  # Intentionally no authentication headers

    try:
        resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"HTTP request to {url} failed: {e}")

    # Primary assertion: must be 401 Unauthorized
    assert resp.status_code == 401, (
        f"Expected 401 Unauthorized when accessing {url} without authentication, "
        f"but got {resp.status_code}. Response body: {resp.text}"
    )

    # Additional contract-level checks (non-fatal beyond the status assertion)
    content_type = resp.headers.get("Content-Type", "")
    if "application/json" in content_type.lower():
        try:
            body = resp.json()
        except ValueError:
            raise AssertionError("Response Content-Type is JSON but body is not valid JSON")
        # If present, ensure the JSON indicates some form of unauthorized/error messaging
        if isinstance(body, dict):
            if not any(k in body for k in ("error", "message", "status", "detail")):
                # Not failing the test here since contract only requires 401; just note via print.
                print("Warning: JSON response for 401 does not contain common error keys.")
    else:
        # If non-JSON, attempt a minimal sanity check on the text
        if resp.text:
            if "unauthorized" not in resp.text.lower() and "unauthorised" not in resp.text.lower():
                print("Warning: Response body does not contain 'unauthorized' wording; status code was 401.")

    print("TC007 passed: unauthenticated GET /api/v1/api-keys returned 401 Unauthorized")

if __name__ == "__main__":
    try:
        test_unauthenticated_access_to_api_key_listing()
    except AssertionError as e:
        print(f"TC007 failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"TC007 encountered an unexpected error: {e}")
        sys.exit(2)
    sys.exit(0)