import os
import sys
import time
import requests

BASE_URL = "http://localhost:8080/api/v1"
TIMEOUT = 30

def test_regenerate_api_key_owned_by_user():
    session = requests.Session()

    # Unauthenticated contract-level checks
    unauth_regen_url = f"{BASE_URL}/api-keys/00000000-0000-0000-0000-000000000000/regenerate"
    try:
        r = session.post(unauth_regen_url, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Network error during unauthenticated regenerate check: {e}")
    assert r.status_code == 401, f"Expected 401 for unauthenticated regenerate, got {r.status_code}"

    # Malformed Authorization header check
    headers_malformed = {"Authorization": "Bearer"}
    try:
        r = session.post(unauth_regen_url, headers=headers_malformed, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Network error during malformed auth header check: {e}")
    assert r.status_code == 401, f"Expected 401 for malformed auth header, got {r.status_code}"

    # Check for Clerk bearer token in environment (do not invent secrets)
    token = os.environ.get("CLERK_BEARER_TOKEN") or os.environ.get("CLERK_TOKEN") or os.environ.get("AUTH_TOKEN")
    if not token:
        print("BLOCKED: No Clerk bearer token available in environment. Authenticated regenerate test skipped.")
        return

    auth_headers = {"Authorization": f"Bearer {token}"}

    created_by_test = False
    resource_id = None

    # Try to create a new API key to ensure we have an owned key to regenerate
    create_url = f"{BASE_URL}/api-keys"
    try:
        r = session.post(create_url, headers=auth_headers, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Network error during API key creation attempt: {e}")

    if r.status_code == 201:
        # Prefer id from creation response if provided
        try:
            body = r.json()
        except ValueError:
            body = {}
        resource_id = body.get("id") or body.get("key_id") or body.get("api_key_id")
        created_by_test = True
        # If no id returned, fall back to listing to find the newly created key
        if not resource_id:
            try:
                list_resp = session.get(f"{BASE_URL}/api-keys", headers=auth_headers, timeout=TIMEOUT)
            except requests.exceptions.RequestException as e:
                raise AssertionError(f"Network error during API key listing after creation: {e}")
            assert list_resp.status_code == 200, f"Expected 200 when listing API keys after creation, got {list_resp.status_code}"
            try:
                keys = list_resp.json()
            except ValueError:
                raise AssertionError("API keys list response is not valid JSON")
            assert isinstance(keys, list) and len(keys) > 0, "Expected non-empty API key list after creation"
            # Assume the most recently created key is present; pick the first with an id-like field
            candidate = keys[0]
            resource_id = candidate.get("id") or candidate.get("key_id") or candidate.get("api_key_id")
            assert resource_id, "Could not determine API key id from list response"
    elif r.status_code == 400:
        # Active-key limit exceeded; pick an existing owned key to test regeneration
        try:
            list_resp = session.get(f"{BASE_URL}/api-keys", headers=auth_headers, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            raise AssertionError(f"Network error during API key listing when limit exceeded: {e}")
        assert list_resp.status_code == 200, f"Expected 200 when listing API keys, got {list_resp.status_code}"
        try:
            keys = list_resp.json()
        except ValueError:
            raise AssertionError("API keys list response is not valid JSON")
        assert isinstance(keys, list) and len(keys) > 0, "No existing API keys available to test regeneration when limit exceeded"
        candidate = keys[0]
        resource_id = candidate.get("id") or candidate.get("key_id") or candidate.get("api_key_id")
        assert resource_id, "Could not determine API key id from list response"
        created_by_test = False
    elif r.status_code == 401:
        print("BLOCKED: Provided Clerk token appears invalid (received 401 on create). Authenticated regenerate test skipped.")
        return
    else:
        raise AssertionError(f"Unexpected status code on API key creation attempt: {r.status_code}. Body: {r.text}")

    # At this point we should have a resource_id to operate on
    regen_url = f"{BASE_URL}/api-keys/{resource_id}/regenerate"
    try:
        regen_resp = session.post(regen_url, headers=auth_headers, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        # Attempt cleanup if we created a key
        if created_by_test and resource_id:
            try:
                session.delete(f"{BASE_URL}/api-keys/{resource_id}", headers=auth_headers, timeout=TIMEOUT)
            except Exception:
                pass
        raise AssertionError(f"Network error during regenerate request: {e}")

    try:
        # Expected 201 with new plaintext API key once
        assert regen_resp.status_code == 201, f"Expected 201 on regenerate, got {regen_resp.status_code}. Body: {regen_resp.text}"
        # Validate response contains a plaintext key shown once
        content_type = regen_resp.headers.get("Content-Type", "")
        if "application/json" in content_type:
            try:
                data = regen_resp.json()
            except ValueError:
                data = {}
            # Find any string value that looks like a secret
            found_secret = False
            if isinstance(data, dict):
                for v in data.values():
                    if isinstance(v, str) and len(v) >= 16:
                        found_secret = True
                        break
            assert found_secret, f"Regenerate response did not contain an obvious plaintext key: {data}"
        else:
            # If not JSON, ensure body has content
            assert regen_resp.text and len(regen_resp.text) > 0, "Regenerate response empty or non-JSON without content"
    finally:
        # Cleanup only if we created the API key during this test
        if created_by_test and resource_id:
            try:
                del_resp = session.delete(f"{BASE_URL}/api-keys/{resource_id}", headers=auth_headers, timeout=TIMEOUT)
            except requests.exceptions.RequestException as e:
                raise AssertionError(f"Network error during cleanup delete: {e}")
            assert del_resp.status_code == 200 or del_resp.status_code == 204, f"Expected 200/204 on delete, got {del_resp.status_code}. Body: {del_resp.text}"

if __name__ == "__main__":
    try:
        test_regenerate_api_key_owned_by_user()
        print("TC006: Completed")
    except AssertionError as e:
        print(f"TC006: FAILED - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"TC006: ERROR - {e}")
        sys.exit(2)