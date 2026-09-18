import os
import sys
import requests

BASE_ENDPOINT = "http://localhost:8080/api/v1"
TIMEOUT = 30  # seconds

def test_list_api_keys_authenticated_user():
    """
    Test case TC001: list_api_keys_authenticated_user
    - Verifies unauthenticated access returns 401
    - If CLERK_BEARER_TOKEN is provided in the environment, verifies authenticated listing returns 200 and an array
    - If CLERK_BEARER_TOKEN is not provided, marks the authenticated portion as blocked after running unauthenticated checks
    """
    url = f"{BASE_ENDPOINT}/api-keys"

    # 1) Unauthenticated contract-level test: expect 401 Unauthorized
    headers_unauth = {
        "Accept": "application/json"
    }
    try:
        resp = requests.get(url, headers=headers_unauth, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request failed for unauthenticated GET {url}: {e}")
    assert resp.status_code == 401, f"Expected 401 for unauthenticated access to {url}, got {resp.status_code}. Response body: {resp.text!r}"

    # 2) Authenticated test: requires CLERK_BEARER_TOKEN in environment
    clerk_token = os.environ.get("CLERK_BEARER_TOKEN")
    if not clerk_token:
        # Mark as blocked: authenticated portion cannot run without a valid Clerk token.
        # Keep unauthenticated/contract-level assertions executed above.
        raise RuntimeError("BLOCKED: CLERK_BEARER_TOKEN not set in environment. Authenticated listing test skipped.")
    
    headers_auth = {
        "Accept": "application/json",
        "Authorization": f"Bearer {clerk_token}"
    }
    try:
        resp_auth = requests.get(url, headers=headers_auth, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request failed for authenticated GET {url}: {e}")

    # Validate success response
    assert resp_auth.status_code == 200, f"Expected 200 for authenticated access to {url}, got {resp_auth.status_code}. Response body: {resp_auth.text!r}"

    # Validate response body is an array of API keys (contract-level)
    try:
        body = resp_auth.json()
    except ValueError:
        raise AssertionError(f"Response from {url} is not valid JSON. Body: {resp_auth.text!r}")

    assert isinstance(body, list), f"Expected JSON array for API key listing, got {type(body).__name__}. Body: {body!r}"

    # Optionally validate items are objects (contract-level)
    for i, item in enumerate(body):
        assert isinstance(item, dict), f"Expected each API key entry to be an object, but entry {i} is {type(item).__name__}: {item!r}"
        # It's acceptable that the secret is not present after creation; ownership/fields beyond this are covered in other tests.

    print("TC001 passed: unauthenticated returned 401 and authenticated listing returned 200 with an array of API keys.")

if __name__ == "__main__":
    try:
        test_list_api_keys_authenticated_user()
    except RuntimeError as e:
        # Blocked authenticated test (token missing) — exit with code 2 to indicate blocked
        print(str(e))
        sys.exit(2)
    except AssertionError as e:
        print(f"TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"UNEXPECTED ERROR: {e}")
        sys.exit(1)
    else:
        sys.exit(0)