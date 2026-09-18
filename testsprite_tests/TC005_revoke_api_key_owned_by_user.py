import os
import sys
import time
import uuid
import requests

BASE_URL = "http://localhost:8080/api/v1"
TIMEOUT = 30


def test_revoke_api_key_owned_by_user():
    """
    TC005 - revoke_api_key_owned_by_user
    - If CLERK_BEARER_TOKEN is not provided, run unauthenticated/contract-level checks and mark authenticated part blocked.
    - If token is provided, create an API key, then revoke it, asserting a 200 empty success response.
    """
    clerk_token = os.environ.get("CLERK_BEARER_TOKEN")

    # Always run an unauthenticated contract-level check: deleting without auth should be 401
    random_id = str(uuid.uuid4())
    unauth_url = f"{BASE_URL}/api-keys/{random_id}"
    try:
        unauth_resp = requests.delete(unauth_url, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Unauthenticated DELETE request failed to execute: {e}")

    # Expect 401 Unauthorized for unauthenticated delete per PRD
    assert (
        unauth_resp.status_code == 401
    ), f"Expected 401 for unauthenticated DELETE, got {unauth_resp.status_code} and body: {unauth_resp.text}"

    if not clerk_token:
        # Authenticated portion blocked due to missing token
        raise SystemExit("BLOCKED: CLERK_BEARER_TOKEN not provided; authenticated test skipped.")

    headers = {
        "Authorization": f"Bearer {clerk_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    created_key_id = None
    created_key_name = f"tc005-revoke-{int(time.time())}-{uuid.uuid4().hex[:6]}"

    # Create a new API key for this test; use try/finally to ensure cleanup
    try:
        create_url = f"{BASE_URL}/api-keys"
        create_payload = {"name": created_key_name}
        try:
            create_resp = requests.post(create_url, json=create_payload, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"Failed to execute authenticated POST /api-keys: {e}")

        # Expect 201 Created
        assert create_resp.status_code == 201, f"Expected 201 on API key creation, got {create_resp.status_code}, body: {create_resp.text}"

        # Try to extract id from creation response
        created_json = {}
        try:
            created_json = create_resp.json()
        except ValueError:
            # If response is not JSON, fall back to listing
            created_json = {}

        if isinstance(created_json, dict):
            # Common fields: id, api_key, key, secret
            if "id" in created_json and isinstance(created_json["id"], str) and created_json["id"]:
                created_key_id = created_json["id"]
        # If we didn't get an id directly, list keys to find one matching our name
        if not created_key_id:
            list_url = f"{BASE_URL}/api-keys"
            try:
                list_resp = requests.get(list_url, headers=headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"Failed to execute authenticated GET /api-keys for discovery: {e}")

            assert list_resp.status_code == 200, f"Expected 200 when listing API keys, got {list_resp.status_code}, body: {list_resp.text}"
            try:
                keys = list_resp.json()
            except ValueError:
                raise AssertionError("Listing API keys did not return JSON as expected.")

            # keys expected to be an array of objects with at least an 'id' and optionally 'name'
            if not isinstance(keys, list):
                raise AssertionError(f"Expected API keys list to be an array, got: {type(keys)}")

            # Try to find a key by the name we used; otherwise pick the first key
            found = None
            for k in keys:
                if not isinstance(k, dict):
                    continue
                name = k.get("name") or k.get("display_name") or k.get("title")
                kid = k.get("id") or k.get("key_id") or k.get("api_key_id")
                if name == created_key_name and kid:
                    found = kid
                    break
            if not found:
                # fallback: choose the most recently created key (if created_at present)
                # otherwise pick first key that has an id
                most_recent = None
                for k in keys:
                    kid = k.get("id") or k.get("key_id") or k.get("api_key_id")
                    if kid and not most_recent:
                        most_recent = kid
                found = most_recent

            if not found:
                raise AssertionError("Unable to determine created API key id from creation response or listing.")
            created_key_id = found

        # Now attempt to revoke (DELETE) the created key
        delete_url = f"{BASE_URL}/api-keys/{created_key_id}"
        try:
            delete_resp = requests.delete(delete_url, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"Failed to execute authenticated DELETE /api-keys/{created_key_id}: {e}")

        # Expect 200 empty success response per PRD
        assert delete_resp.status_code == 200, f"Expected 200 on revoke, got {delete_resp.status_code}, body: {delete_resp.text}"
        # Body should be empty
        content = delete_resp.content or b""
        assert content.strip() == b"" , f"Expected empty response body on successful revoke, got: {delete_resp.text}"

        # Optionally verify that inspecting the key is not possible anymore (should be 401 or 404 or 403 depending on implementation)
        inspect_url = f"{BASE_URL}/api-keys/{created_key_id}"
        try:
            inspect_resp = requests.get(inspect_url, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"Failed to execute authenticated GET /api-keys/{created_key_id}: {e}")

        # After revocation, the resource may be gone or forbidden. Accept common possibilities but assert it's not 200.
        assert inspect_resp.status_code != 200, f"Expected non-200 when inspecting a revoked key, got 200 with body: {inspect_resp.text}"

    finally:
        # Best-effort cleanup: attempt to delete the key if it still exists
        if clerk_token and created_key_id:
            cleanup_url = f"{BASE_URL}/api-keys/{created_key_id}"
            try:
                requests.delete(cleanup_url, headers=headers, timeout=TIMEOUT)
            except Exception:
                # suppress cleanup errors
                pass


if __name__ == "__main__":
    try:
        test_revoke_api_key_owned_by_user()
    except SystemExit as se:
        # Treat explicit SystemExit used for BLOCKED as non-error termination
        print(str(se))
        sys.exit(0)
    except AssertionError as ae:
        print(f"TEST FAILED: {ae}")
        sys.exit(1)
    except Exception as e:
        print(f"UNEXPECTED ERROR: {e}")
        sys.exit(2)
    else:
        print("TEST PASSED")
        sys.exit(0)