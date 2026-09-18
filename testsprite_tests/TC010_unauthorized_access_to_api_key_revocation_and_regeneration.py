import os
import requests
from requests.exceptions import RequestException

BASE_URL = "http://localhost:8080/api/v1"
TIMEOUT = 30

def test_unauthorized_revocation_and_regeneration():
    # Use a dummy key id for unauthenticated/contract-level checks
    dummy_key_id = "00000000-0000-0000-0000-000000000000"

    # 1) Unauthenticated requests should return 401
    try:
        resp = requests.delete(f"{BASE_URL}/api-keys/{dummy_key_id}", timeout=TIMEOUT)
    except RequestException as e:
        assert False, f"DELETE unauthenticated request failed: {e}"
    assert resp.status_code == 401, f"Expected 401 for unauthenticated DELETE, got {resp.status_code}, body: {resp.text}"

    try:
        resp = requests.post(f"{BASE_URL}/api-keys/{dummy_key_id}/regenerate", timeout=TIMEOUT)
    except RequestException as e:
        assert False, f"POST regenerate unauthenticated request failed: {e}"
    assert resp.status_code == 401, f"Expected 401 for unauthenticated POST regenerate, got {resp.status_code}, body: {resp.text}"

    # 2) Malformed / missing authentication header variants should return 401
    malformed_headers_list = [
        {"Authorization": "Bearer"},                 # Bearer with no token
        {"Authorization": "Bearer INVALID_TOKEN"},   # Bearer with invalid token
        {"x-api-key": ""},                           # Empty x-api-key
        {"x-api-key": "invalid-key-value"}           # Invalid x-api-key
    ]

    for h in malformed_headers_list:
        try:
            resp = requests.delete(f"{BASE_URL}/api-keys/{dummy_key_id}", headers=h, timeout=TIMEOUT)
        except RequestException as e:
            assert False, f"DELETE with header {h} failed: {e}"
        assert resp.status_code == 401, f"Expected 401 for DELETE with header {h}, got {resp.status_code}, body: {resp.text}"

        try:
            resp = requests.post(f"{BASE_URL}/api-keys/{dummy_key_id}/regenerate", headers=h, timeout=TIMEOUT)
        except RequestException as e:
            assert False, f"POST regenerate with header {h} failed: {e}"
        assert resp.status_code == 401, f"Expected 401 for POST regenerate with header {h}, got {resp.status_code}, body: {resp.text}"

    # 3) Ownership isolation tests (blocked if credentials not provided)
    # Read optional credentials from environment. Tests will be skipped if required credentials are missing.
    owner_bearer = os.getenv("CLERK_BEARER_TOKEN")
    owner_x_api_key = os.getenv("TEST_API_KEY")
    alt_bearer = os.getenv("ALT_CLERK_BEARER_TOKEN")
    alt_x_api_key = os.getenv("ALT_TEST_API_KEY")

    owner_headers = None
    alt_headers = None

    if owner_bearer:
        owner_headers = {"Authorization": f"Bearer {owner_bearer}"}
    elif owner_x_api_key:
        owner_headers = {"x-api-key": owner_x_api_key}

    if alt_bearer:
        alt_headers = {"Authorization": f"Bearer {alt_bearer}"}
    elif alt_x_api_key:
        alt_headers = {"x-api-key": alt_x_api_key}

    created_key_id = None

    # If we have credentials for an owner, attempt to create a key to test ownership isolation.
    # If creation is impossible (missing credentials or failure), ownership tests will be skipped.
    if owner_headers:
        try:
            create_resp = requests.post(f"{BASE_URL}/api-keys", headers=owner_headers, timeout=TIMEOUT)
        except RequestException as e:
            # Can't run authenticated creation; skip ownership isolation
            create_resp = None

        if create_resp is None:
            # blocked: unable to perform authenticated create
            pass
        else:
            if create_resp.status_code == 201:
                # Try to extract created id from response body; fallback to listing
                created_id = None
                try:
                    body = create_resp.json()
                except Exception:
                    body = {}

                # Common possible fields for id
                for k in ("id", "key_id", "api_key_id", "apiKeyId"):
                    if isinstance(body, dict) and body.get(k):
                        created_id = body.get(k)
                        break

                # If we didn't receive an ID in create response, attempt to list the user's keys and pick one
                if not created_id:
                    try:
                        list_resp = requests.get(f"{BASE_URL}/api-keys", headers=owner_headers, timeout=TIMEOUT)
                        if list_resp.status_code == 200:
                            list_body = list_resp.json()
                            if isinstance(list_body, list) and len(list_body) > 0:
                                # pick the first key that has an 'id' property
                                for item in list_body:
                                    if isinstance(item, dict) and item.get("id"):
                                        created_id = item.get("id")
                                        break
                    except RequestException:
                        created_id = None

                if created_id:
                    created_key_id = created_id
                else:
                    # Could not determine created key id; treat as blocked for ownership isolation
                    created_key_id = None
            else:
                # Creation failed (e.g., 401 or 400) - cannot proceed with ownership isolation
                created_key_id = None

    # If we have a created key and an alternate identity, attempt revoke/regenerate with alt and expect 401
    if created_key_id and alt_headers:
        try:
            alt_delete = requests.delete(f"{BASE_URL}/api-keys/{created_key_id}", headers=alt_headers, timeout=TIMEOUT)
        except RequestException as e:
            assert False, f"Alt DELETE request failed: {e}"
        assert alt_delete.status_code == 401, f"Expected 401 when alt user attempts DELETE on another's key, got {alt_delete.status_code}, body: {alt_delete.text}"

        try:
            alt_regen = requests.post(f"{BASE_URL}/api-keys/{created_key_id}/regenerate", headers=alt_headers, timeout=TIMEOUT)
        except RequestException as e:
            assert False, f"Alt POST regenerate request failed: {e}"
        assert alt_regen.status_code == 401, f"Expected 401 when alt user attempts POST regenerate on another's key, got {alt_regen.status_code}, body: {alt_regen.text}"

    # Cleanup: if we created a key and have owner credentials, attempt to revoke it
    if created_key_id and owner_headers:
        try:
            cleanup_resp = requests.delete(f"{BASE_URL}/api-keys/{created_key_id}", headers=owner_headers, timeout=TIMEOUT)
            # Accept 200 or 204 as successful cleanup; if it fails, surface assertion but do not block other tests
            assert cleanup_resp.status_code in (200, 204), f"Cleanup delete expected 200/204, got {cleanup_resp.status_code}, body: {cleanup_resp.text}"
        except RequestException as e:
            assert False, f"Cleanup DELETE request failed: {e}"

if __name__ == "__main__":
    test_unauthorized_revocation_and_regeneration()
    print("TC010 completed.")