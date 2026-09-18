import os
import sys
import uuid
import time
import requests

BASE_URL = "http://localhost:8080/api/v1"
TIMEOUT = 30


def test_inspect_api_key_owned_by_user():
    """
    TC004: inspect_api_key_owned_by_user

    - Executes unauthenticated/malformed-auth contract checks (expecting 401).
    - If a Clerk bearer token is provided via the CLERK_BEARER_TOKEN environment variable,
      it will attempt to create a new API key (if TEST_API_KEY_ID is not provided), inspect it,
      and then delete it in a finally block.
    - If no token is available, the authenticated portion is marked blocked (prints) but does not fail the unauthenticated tests.
    """

    session = requests.Session()

    # Use a random UUID to test route handling for non-existent/malformed resource IDs
    random_id = str(uuid.uuid4())
    inspect_url = f"{BASE_URL}/api-keys/{random_id}"

    # 1) Unauthenticated access should return 401
    try:
        resp = session.get(inspect_url, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request failed for unauthenticated GET: {e}")
    assert resp.status_code == 401, f"Expected 401 for unauthenticated GET, got {resp.status_code} - body: {resp.text}"

    # 2) Malformed Authorization header (missing token) should return 401
    headers_malformed = {"Authorization": "Bearer"}
    try:
        resp = session.get(inspect_url, headers=headers_malformed, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request failed for malformed-auth GET: {e}")
    assert resp.status_code == 401, f"Expected 401 for malformed Authorization header, got {resp.status_code} - body: {resp.text}"

    # 3) Invalid token should return 401
    headers_invalid = {"Authorization": "Bearer INVALID_TOKEN_XYZ"}
    try:
        resp = session.get(inspect_url, headers=headers_invalid, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request failed for invalid-token GET: {e}")
    assert resp.status_code == 401, f"Expected 401 for invalid token, got {resp.status_code} - body: {resp.text}"

    # 4) Authenticated flow: inspect an API key owned by the authenticated user.
    clerk_token = os.environ.get("CLERK_BEARER_TOKEN")
    provided_api_key_id = os.environ.get("TEST_API_KEY_ID")  # optional: use an existing API key id if provided

    if not clerk_token:
        # Cannot run authenticated checks without a token; mark blocked but do not fail the unauthenticated tests
        print("BLOCKED: CLERK_BEARER_TOKEN not provided. Authenticated inspection test skipped.")
        return

    auth_headers = {"Authorization": f"Bearer {clerk_token}", "Content-Type": "application/json"}

    created_api_key_id = None
    created_key_was_created = False

    try:
        # If an API key id was provided via env, use that. Otherwise attempt to create a new API key.
        if provided_api_key_id:
            api_key_id = provided_api_key_id
        else:
            # Attempt to create a new API key for this user
            create_url = f"{BASE_URL}/api-keys"
            payload = {"name": f"test-key-{str(uuid.uuid4())}"}
            try:
                resp = session.post(create_url, json=payload, headers=auth_headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"Request failed creating API key: {e}")

            if resp.status_code == 401:
                raise AssertionError("Authenticated create returned 401 despite CLERK_BEARER_TOKEN being provided; token may be invalid.")
            assert resp.status_code == 201, f"Expected 201 when creating API key, got {resp.status_code} - body: {resp.text}"

            # Try to parse an ID from the creation response
            try:
                body = resp.json()
            except ValueError:
                raise AssertionError(f"Create response was not JSON as expected: {resp.text}")

            # Heuristics for locating the created resource id
            possible_id_fields = ["id", "api_key_id", "key_id", "keyId", "id_value"]
            api_key_id = None
            for f in possible_id_fields:
                if f in body:
                    api_key_id = body[f]
                    break

            # If no id in response, try to list keys and pick the most recent one
            if not api_key_id:
                list_url = f"{BASE_URL}/api-keys"
                try:
                    list_resp = session.get(list_url, headers=auth_headers, timeout=TIMEOUT)
                except requests.RequestException as e:
                    raise AssertionError(f"Request failed listing API keys after creation: {e}")
                assert list_resp.status_code == 200, f"Expected 200 from list after create, got {list_resp.status_code} - body: {list_resp.text}"
                try:
                    items = list_resp.json()
                except ValueError:
                    raise AssertionError(f"List response was not JSON as expected: {list_resp.text}")

                # Expecting an array; choose the newest by created_at if present, otherwise last item
                api_key_id = None
                if isinstance(items, list) and items:
                    # Try to sort by created_at if available
                    def created_at_key(it):
                        return it.get("created_at") or it.get("createdAt") or it.get("created") or 0

                    try:
                        items_sorted = sorted(items, key=created_at_key)
                        newest = items_sorted[-1]
                        for f in possible_id_fields:
                            if f in newest:
                                api_key_id = newest[f]
                                break
                    except Exception:
                        newest = items[-1]
                        for f in possible_id_fields:
                            if f in newest:
                                api_key_id = newest[f]
                                break

            if not api_key_id:
                raise AssertionError("Unable to determine created API key id from create or list responses.")

            created_api_key_id = api_key_id
            created_key_was_created = True

        # Now inspect the API key
        inspect_url_auth = f"{BASE_URL}/api-keys/{api_key_id}"
        try:
            resp = session.get(inspect_url_auth, headers=auth_headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"Request failed for authenticated inspect GET: {e}")

        # Expect 200 for owned key
        if resp.status_code == 401:
            raise AssertionError("Authenticated inspect returned 401; token may be invalid or not authorized for this key.")
        assert resp.status_code == 200, f"Expected 200 when inspecting owned API key, got {resp.status_code} - body: {resp.text}"

        # Response should contain last_used_at metadata (field name may vary)
        try:
            data = resp.json()
        except ValueError:
            raise AssertionError(f"Inspect response was not JSON as expected: {resp.text}")

        # Accept multiple possible key names for last-used
        possible_last_used_fields = ["last_used_at", "lastUsedAt", "last_used", "lastUsed"]
        found = False
        for f in possible_last_used_fields:
            if f in data:
                # Validate value is either None or a string/number (timestamp)
                val = data[f]
                assert (val is None) or isinstance(val, (str, int, float)), f"Unexpected type for {f}: {type(val)}"
                found = True
                break

        assert found, f"Inspect response did not include last-used metadata. Response keys: {list(data.keys())}"

    finally:
        # Cleanup: delete created API key if we created one
        if created_key_was_created and created_api_key_id:
            delete_url = f"{BASE_URL}/api-keys/{created_api_key_id}"
            try:
                del_resp = session.delete(delete_url, headers=auth_headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                # If deletion fails at network level, raise so the CI knows cleanup didn't succeed
                raise AssertionError(f"Request failed deleting created API key in cleanup: {e}")

            # Accept 200 or 204 for successful delete depending on implementation
            if del_resp.status_code not in (200, 204):
                raise AssertionError(f"Failed to delete created API key in cleanup. Status: {del_resp.status_code} - body: {del_resp.text}")


if __name__ == "__main__":
    try:
        test_inspect_api_key_owned_by_user()
        print("TC004: PASS")
    except AssertionError as e:
        print(f"TC004: FAIL - {e}")
        sys.exit(1)
    except Exception as exc:
        print(f"TC004: ERROR - Unexpected exception: {exc}")
        sys.exit(2)