# Development preview with live reload

From the project directory run:

```sh
python3 tools/dev_server.py
```

The preview serves on port 8000, binds to `0.0.0.0`, and watches `index.html` and runtime files under `src/`, `vendor/` and `assets/`. When a watched file is added, modified or removed, the page performs a full reload within roughly one second. This resets the current game session. The server disables caching to avoid stale modules and textures. Source-only `.blend` files, tests and documentation are not watched because the running game does not load them. Re-exporting the runtime GLB triggers a reload.

The reload client is injected by the development server, not committed into the game page; ordinary static hosting remains unchanged. This server is intended only for development, not an untrusted public network. Stop it with Ctrl+C, and use `--port` to select another port if needed.
