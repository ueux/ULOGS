# TestSprite API-Key Service Report

## 1️⃣ Document Metadata

- **Project:** oneminute-logs-starter-master
- **Date:** 2026-09-18
- **Target:** NestJS API at `http://localhost:8080/api/v1`
- **Scope:** API-key management endpoints
- **Runner:** TestSprite MCP

## 2️⃣ Requirement Validation Summary

| Test  | Scenario                                    | Result                              |
| ----- | ------------------------------------------- | ----------------------------------- |
| TC001 | Authenticated API-key listing               | Passed                              |
| TC002 | Create key below active-key limit           | Passed                              |
| TC003 | Reject creation above five active keys      | Passed                              |
| TC004 | Inspect owned key last-used metadata        | Passed                              |
| TC005 | Revoke owned key                            | Passed                              |
| TC006 | Regenerate owned key                        | Passed                              |
| TC007 | Unauthenticated listing rejected            | Passed                              |
| TC008 | Unauthenticated creation rejected           | Passed                              |
| TC009 | Unauthenticated/invalid inspection rejected | Passed after explicit assertion fix |
| TC010 | Unauthorized revoke/regenerate rejected     | Passed                              |

## 3️⃣ Coverage & Matching Metrics

- Initial TestSprite run: **9/10 passed**.
- TC009 initially failed because the generated runner incorrectly reported no assertions, although the test contained validation logic.
- TC009 was updated with an explicit assertion and rerun independently: **1/1 passed**.
- Combined validated scenarios: **10/10 passed across the full run and corrected rerun**.

## 4️⃣ Key Gaps / Risks

- Authenticated ownership-isolation coverage depends on valid test credentials; no credentials were added to the repository or exposed during testing.
- TestSprite’s generated backend report should distinguish harness assertion-discovery failures from application failures.
- The API production script still points to `dist/main`, while Nest emits `dist/src/main.js`; the service was started directly from the compiled entrypoint for this test.
- The TestSprite MCP API key is stored in `.vscode/mcp.json`; rotate it and move it to a secure secret store or environment variable before committing or sharing the repository.
