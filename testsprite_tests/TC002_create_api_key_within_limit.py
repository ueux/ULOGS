import os
import requests
import sys

BASE_URL = "http://localhost:8080/api/v1"
TIMEOUT = 30


def test_create_api_key_within_limit():
    """
    Test Case TC002: create_api_key_within_limit
    - Verify unauthenticated creation returns 401
    - If CLERK_BEARER_TOKEN is present:
        - Ensure user has fewer than 5 active keys
        - Create a key -> expect 201 and plaintext shown once
        - Verify plaintext is not exposed in subsequent listings
        - Cleanup: revoke/delete the created key
    - If CLERK_BEARER_TOKEN absent, mark blocked for authenticated portion.
    """
    clerk_token = os.environ.get("CLERK_BEARER_TOKEN")

    create_url = f"{BASE_URL}/api-keys"
    headers_auth = {"Authorization": f"Bearer {clerk_token}"} if clerk_token else {}

    # 1) Unauthenticated behavior: POST without auth should return 401
    try:
        resp_unauth = requests.post(create_url, json={}, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request to {create_url} failed: {e}")
    assert (
        resp_unauth.status_code == 401
    ), f"Unauthenticated POST expected 401, got {resp_unauth.status_code}, body: {resp_unauth.text}"

    # If no Clerk token, we cannot perform authenticated creation; mark blocked and exit
    if not clerk_token:
        print("BLOCKED: CLERK_BEARER_TOKEN not provided in environment; authenticated creation test skipped.")
        return

    # Helper to perform GET /api-keys
    def list_keys():
        try:
            r = requests.get(create_url, headers=headers_auth, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"GET {create_url} failed: {e}")
        assert r.status_code == 200, f"Expected 200 from GET /api-keys, got {r.status_code}, body: {r.text}"
        try:
            return r.json()
        except ValueError:
            raise AssertionError("GET /api-keys did not return valid JSON")

    # 2) Check current active keys count to ensure fewer than 5 active keys
    current_keys = list_keys()
    if not isinstance(current_keys, list):
        raise AssertionError(f"GET /api-keys returned non-list payload: {current_keys}")
    if len(current_keys) >= 5:
        print("BLOCKED: User has 5 or more active keys; cannot validate creation within limit.")
        return

    existing_ids = set()
    for it in current_keys:
        if isinstance(it, dict):
            for k in ("id", "key_id", "api_key_id", "apiKeyId"):
                if k in it:
                    existing_ids.add(it[k])
                    break

    created_id = None
    created_plaintext = None

    try:
        # 3) Create API key
        try:
            resp_create = requests.post(create_url, headers=headers_auth, json={}, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"POST {create_url} failed: {e}")
        assert resp_create.status_code == 201, f"Expected 201 from POST /api-keys, got {resp_create.status_code}, body: {resp_create.text}"

        # Parse JSON response
        try:
            body = resp_create.json()
        except ValueError:
            raise AssertionError("POST /api-keys did not return valid JSON")

        # 4) Find plaintext key in response (one-time secret)
        # Look for common field names; if not present, search recursively for a string that looks like a secret
        def find_plaintext(obj):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if k.lower() in ("plaintext", "key", "secret", "api_key", "token", "value", "secret_key"):
                        if isinstance(v, str) and len(v) >= 16:
                            return v
                    res = find_plaintext(v)
                    if res:
                        return res
            elif isinstance(obj, list):
                for item in obj:
                    res = find_plaintext(item)
                    if res:
                        return res
            elif isinstance(obj, str):
                if len(obj) >= 16:
                    return obj
            return None

        created_plaintext = find_plaintext(body)
        assert created_plaintext, "Creation response did not include a plaintext API key"

        # 5) Determine created resource id for cleanup
        for k in ("id", "key_id", "api_key_id", "apiKeyId"):
            if isinstance(body, dict) and k in body:
                created_id = body[k]
                break

        if not created_id:
            # Re-list and find new id
            after_list = list_keys()
            candidate_id = None
            for item in after_list:
                if isinstance(item, dict):
                    id_val = item.get("id") or item.get("key_id") or item.get("api_key_id") or item.get("apiKeyId")
                    if id_val and id_val not in existing_ids:
                        candidate_id = id_val
                        break
            if candidate_id:
                created_id = candidate_id

        assert created_id, "Could not determine created API key id for cleanup"

        # 6) Ensure plaintext is not exposed in listing responses
        after_listing = list_keys()

        def plaintext_in_listing(listing, plaintext):
            if not isinstance(listing, list):
                return False
            for item in listing:
                if isinstance(item, dict):
                    for v in item.values():
                        if isinstance(v, str) and plaintext in v:
                            return True
            return False

        assert not plaintext_in_listing(after_listing, created_plaintext), "Plaintext API key should not be present in listing responses"

    finally:
        # Cleanup: revoke/delete created API key if we determined its id
        if created_id:
            del_url = f"{create_url}/{created_id}"
            try:
                del_resp = requests.delete(del_url, headers=headers_auth, timeout=TIMEOUT)
                # Some implementations may return 200 or 204; accept both as success
                if del_resp.status_code not in (200, 204):
                    raise AssertionError(f"Failed to delete created API key. DELETE {del_url} returned {del_resp.status_code}, body: {del_resp.text}")
            except requests.RequestException as e:
                print(f"Warning: cleanup DELETE request failed: {e}")
            except AssertionError as ae:
                # Print cleanup failure but do not mask original assertion failures
                print(f"Warning: cleanup assertion failed: {ae}")


if __name__ == "__main__":
    test_create_api_key_within_limit()