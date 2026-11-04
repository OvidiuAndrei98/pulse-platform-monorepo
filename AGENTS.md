# Local development ports

- Keep ports 8081 and 8082 available for the user's existing Expo/browser/iPhone sessions. Do not launch agent-owned servers on these ports.
- Use **8083** for the agent's main React Native/Expo web preview. The `web:codex` script selects this port explicitly.
- Use **8084 and above** for additional agent-owned servers. Check listeners first and reuse an existing matching agent server instead of creating duplicates.
- Do not stop or restart the user's servers to resolve an agent port conflict. If an agent port belongs to another process, use the next free port in the agent range.
- Browser QA defaults to `http://localhost:8083`. A read-only check of a user/phone session may use its actual port explicitly when needed for the user's task.
