import os
import sys
import time
import json
import requests

BASE_URL = "http://localhost:8080/api/v1"
API_KEYS_PATH = f"{BASE_URL}/api-keys"
TIMEOUT = 30


def _extract_key_ids(list_response_json):
    """
    Attempt to extract stable identifiers for API keys from the list response.
    Returns list of ids (strings). If no 'id' field found, falls back to full item JSON string.
    """
    ids = []
    if isinstance(list_response_json, list):
        items = list_response_json
    elif isinstance(list_response_json, dict):
        # common wrappers: { "data": [...]} or { "items": [...] }
        if "data" in list_response_json and isinstance(list_response_json["data"], list):
            items = list_response_json["data"]
        elif "items" in list_response_json and isinstance(list_response_json["items"], list):
            items = list_response_json["items"]
        else:
            # fallback: treat the dict itself as single item
            items = [list_response_json]
    else:
        items = []

    for it in items:
        if isinstance(it, dict):
            if "id" in it:
                ids.append(str(it["id"]))
            elif "key_id" in it:
                ids.append(str(it["key_id"]))
            elif "api_key_id" in it:
                ids.append(str(it["api_key_id"]))
            else:
                # stringify as fallback
                try:
                    ids.append(json.dumps(it, sort_keys=True))
                except Exception:
                    ids.append(str(it))
        else:
            # non-dict items
            ids.append(str(it))
    return ids


def test_create_api_key_exceeding_limit():
    # 1) Unauthenticated contract-level test: POST without auth should return 401
    try:
        resp_unauth = requests.post(API_KEYS_PATH, json={}, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request to {API_KEYS_PATH} failed (unauthenticated test): {e}")
    assert resp_unauth.status_code == 401, f"Expected 401 for unauthenticated POST, got {resp_unauth.status_code}: {resp_unauth.text}"

    # Check for an authentication token in environment
    token = os.getenv("CLERK_BEARER_TOKEN") or os.getenv("API_KEY") or os.getenv("AUTH_TOKEN")
    if not token:
        # Cannot run authenticated portion; mark blocked but unauthenticated/contract checks done
        print("BLOCKED: No Clerk bearer token or API key available in environment. Authenticated checks skipped.")
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # 2) Retrieve existing keys for this authenticated user
    try:
        resp_list = requests.get(API_KEYS_PATH, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request to list API keys failed: {e}")

    if resp_list.status_code == 401:
        print("BLOCKED: Provided token is invalid or not authorized (received 401 on list). Authenticated checks skipped.")
        return

    assert resp_list.status_code == 200, f"Expected 200 listing API keys, got {resp_list.status_code}: {resp_list.text}"

    try:
        list_json = resp_list.json()
    except ValueError:
        raise AssertionError(f"List API keys response is not valid JSON: {resp_list.text}")

    existing_ids = _extract_key_ids(list_json)
    existing_count = len(existing_ids)

    # If already at or above 5 active keys, directly attempt create and assert 400
    created_ids = []
    try:
        if existing_count >= 5:
            # expect create to fail with 400 active-key limit exceeded
            try:
                resp = requests.post(API_KEYS_PATH, headers=headers, json={}, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"Request to create API key failed: {e}")
            assert resp.status_code == 400, f"Expected 400 when creating beyond limit, got {resp.status_code}: {resp.text}"
            print("Verified 400 response when creating an API key while already at limit.")
            return

        # Otherwise create keys until user reaches 5 active keys
        needed = 5 - existing_count
        for i in range(needed):
            try:
                resp_create = requests.post(API_KEYS_PATH, headers=headers, json={}, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"Request to create API key failed: {e}")

            if resp_create.status_code == 401:
                print("BLOCKED: Provided token is invalid (received 401 on create). Authenticated checks skipped.")
                return

            assert resp_create.status_code == 201, f"Expected 201 creating API key, got {resp_create.status_code}: {resp_create.text}"

            # attempt to extract id from creation response
            created_json = {}
            try:
                created_json = resp_create.json()
            except ValueError:
                created_json = {}

            created_id = None
            if isinstance(created_json, dict):
                for key in ("id", "key_id", "api_key_id", "apiKeyId", "api_key"):
                    if key in created_json and created_json[key]:
                        created_id = str(created_json[key]) if not isinstance(created_json[key], dict) else None
                        break
                # sometimes response nests object { "api_key": { "id": "...", ... } }
                if not created_id:
                    if "api_key" in created_json and isinstance(created_json["api_key"], dict) and "id" in created_json["api_key"]:
                        created_id = str(created_json["api_key"]["id"])

            # If we couldn't extract an id from create response, re-list to find the delta
            if not created_id:
                try:
                    resp_list_after = requests.get(API_KEYS_PATH, headers=headers, timeout=TIMEOUT)
                except requests.RequestException as e:
                    raise AssertionError(f"Request to list API keys after create failed: {e}")
                assert resp_list_after.status_code == 200, f"Expected 200 listing API keys after create, got {resp_list_after.status_code}: {resp_list_after.text}"
                try:
                    list_after_json = resp_list_after.json()
                except ValueError:
                    raise AssertionError(f"List API keys after create is not valid JSON: {resp_list_after.text}")

                after_ids = _extract_key_ids(list_after_json)
                # find new ids that were not in existing_ids or already created_ids
                new_candidates = [x for x in after_ids if x not in existing_ids and x not in created_ids]
                if new_candidates:
                    created_id = new_candidates[0]

            if created_id:
                created_ids.append(created_id)
            else:
                # We were unable to determine an id for cleanup; still continue but warn.
                print("Warning: Unable to determine created key id for cleanup. The created key may remain orphaned.")

            # small delay to avoid hammering the service
            time.sleep(0.1)

        # Now we should have reached 5 active keys. Attempt one more create and expect 400.
        try:
            resp_limit = requests.post(API_KEYS_PATH, headers=headers, json={}, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"Request to create API key (expecting limit exceeded) failed: {e}")

        assert resp_limit.status_code == 400, f"Expected 400 when creating beyond limit, got {resp_limit.status_code}: {resp_limit.text}"
        print("Verified 400 response when creating an API key after reaching the active-key limit.")

    finally:
        # Cleanup only the keys created during this test to avoid affecting pre-existing data.
        for kid in created_ids:
            # if the id looks like a JSON string (starts with { or [) skip deletion attempt
            if not kid or kid.strip().startswith(("{", "[")):
                continue
            delete_url = f"{API_KEYS_PATH}/{kid}"
            try:
                resp_del = requests.delete(delete_url, headers=headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                print(f"Warning: Failed to delete API key {kid}: {e}")
                continue
            if resp_del.status_code not in (200, 204, 404):
                print(f"Warning: Unexpected status deleting API key {kid}: {resp_del.status_code} - {resp_del.text}")


if __name__ == "__main__":
    test_create_api_key_exceeding_limit()